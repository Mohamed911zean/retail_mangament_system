import type { DatabaseHandle } from '../database/repositories/common'
import { runInTransaction } from '../database/repositories/common'
import { insertPurchase, insertPurchaseItem, getPurchase, listPurchaseItems } from '../database/repositories/purchases'
import { getSupplier, insertSupplier, updateSupplier, softDeleteSupplier, listSuppliers } from '../database/repositories/suppliers'
import { insertMoneyLedgerEntry } from '../database/repositories/money-ledger'
import { insertStockBatch } from '../database/repositories/stock'
import { nextSequenceNumber } from '../database/repositories/sequences'
import { getProduct } from '../database/repositories/catalog'
import type { PurchaseRow, PurchaseItemRow, SupplierRow } from '../database/rows'
import { calculatePaymentAllocation, type Tender } from '../../domain/payments'
import { applyMovement, type StockEngineDependencies } from './stockEngine'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import { noFaults } from './fault-injector'
import type { IdGenerator } from './ids'
import { createUlidGenerator } from './ids'
import type { Actor } from './permissions'
import { serviceErr, serviceOk, type ServiceResult } from './result'
import { writeAudit } from './audit'

export type PurchaseLineInput = {
  productId: string
  unitNameSnapshot: string
  pricedUnitQtyBase: number
  qtyBase: number
  unitCostPiasters: number
  taxRateBps?: number
  batchCode?: string | null
  expiryAt?: number | null
  createBatch?: boolean
}

export type ReceivePurchaseInput = {
  supplierId?: string | null
  lines: PurchaseLineInput[]
  tenders: Tender[]
  taxEnabled: boolean
}

export type PurchaseResult = { purchase: PurchaseRow; items: PurchaseItemRow[] }

type PurchaseDeps = {
  database: DatabaseHandle
  clock: Clock
  ids?: IdGenerator
  deviceId: string
  allowNegativeStock: boolean
  faults?: FaultInjector
}

function computeLineTotals(lines: PurchaseLineInput[], taxEnabled: boolean): { lineSubtotalPiasters: number; taxPiasters: number; lineTotalPiasters: number }[] {
  return lines.map((line) => {
    const lineSubtotalPiasters = line.unitCostPiasters * line.qtyBase / line.pricedUnitQtyBase
    const taxRateBps = taxEnabled ? (line.taxRateBps ?? 0) : 0
    const taxPiasters = Math.floor(lineSubtotalPiasters * taxRateBps / 10000)
    return { lineSubtotalPiasters: Math.round(lineSubtotalPiasters), taxPiasters, lineTotalPiasters: Math.round(lineSubtotalPiasters) + taxPiasters }
  })
}

export class PurchaseService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector
  private readonly engineDeps: StockEngineDependencies
  constructor(private readonly deps: PurchaseDeps) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
    this.engineDeps = { ids: this.ids, clock: deps.clock, faults: this.faults, allowNegativeStock: deps.allowNegativeStock }
  }

  async receivePurchase(actor: Actor, input: ReceivePurchaseInput): Promise<ServiceResult<PurchaseResult>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      if (input.supplierId) {
        const supplier = getSupplier(this.deps.database, input.supplierId)
        if (supplier === undefined) return serviceErr('not_found', { field: 'supplierId' })
      }

      for (const line of input.lines) {
        if (getProduct(this.deps.database, line.productId) === undefined) return serviceErr('not_found', { productId: line.productId })
      }

      const lineTotals = computeLineTotals(input.lines, input.taxEnabled)
      const totalPiasters = lineTotals.reduce((sum, l) => sum + l.lineTotalPiasters, 0)

      const paymentResult = calculatePaymentAllocation(totalPiasters, input.tenders, !!input.supplierId)
      if (!paymentResult.ok) return serviceErr(paymentResult.error.code, paymentResult.error)

      const now = this.deps.clock.now()
      const purchaseId = this.ids.next()
      const purchaseNumber = String(nextSequenceNumber(this.deps.database, this.deps.deviceId, 'purchase', now))
      this.faults.after('purchase.sequence_allocated')

      let resultRef!: ServiceResult<PurchaseResult>

      runInTransaction(this.deps.database, (tx) => {
        insertPurchase(tx, {
          id: purchaseId,
          purchaseNumber,
          supplierId: input.supplierId ?? null,
          userId: actor.userId,
          totalPiasters,
          paidPiasters: paymentResult.value.paidPiasters,
          duePiasters: paymentResult.value.duePiasters,
          paymentStatus: paymentResult.value.status,
          status: 'completed',
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        this.faults.after('purchase.header_inserted')

        for (let i = 0; i < input.lines.length; i++) {
          const line = input.lines[i]
          const totals = lineTotals[i]

          // Create batch if requested or expiry tracking
          let batchId: string | null = null
          if (line.createBatch || line.expiryAt !== undefined) {
            batchId = this.ids.next()
            insertStockBatch(tx, {
              id: batchId,
              productId: line.productId,
              batchCode: line.batchCode ?? null,
              expiryAt: line.expiryAt ?? null,
              receivedAt: now,
              initialQtyBase: line.qtyBase,
              createdAt: now,
              updatedAt: now,
              deviceId: this.deps.deviceId,
            })
            this.faults.after(`purchase.item.${i}.batch_created`)
          }

          const stockResult = applyMovement(tx, this.engineDeps, {
            productId: line.productId,
            qtyDelta: line.qtyBase,
            valuePiasters: totals.lineTotalPiasters,
            movementType: 'purchase',
            referenceType: 'purchase',
            referenceId: purchaseId,
            batchId,
            userId: actor.userId,
            deviceId: this.deps.deviceId,
          })
          if (!stockResult.ok) {
            resultRef = serviceErr(stockResult.error.code, stockResult.error)
            throw new Error('stock_error')
          }
          this.faults.after(`purchase.item.${i}.stock_applied`)

          insertPurchaseItem(tx, {
            id: this.ids.next(),
            purchaseId,
            productId: line.productId,
            unitNameSnapshot: line.unitNameSnapshot,
            pricedUnitQtyBase: line.pricedUnitQtyBase,
            qtyBase: line.qtyBase,
            unitCostPiasters: line.unitCostPiasters,
            lineSubtotalPiasters: totals.lineSubtotalPiasters,
            taxRateBpsSnapshot: input.taxEnabled ? (line.taxRateBps ?? 0) : 0,
            taxPiasters: totals.taxPiasters,
            lineTotalPiasters: totals.lineTotalPiasters,
            batchCodeSnapshot: line.batchCode ?? null,
            expiryAtSnapshot: line.expiryAt ?? null,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
          this.faults.after(`purchase.item.${i}.row_inserted`)
        }

        // Money ledger – cash paid to supplier (direction: out)
        for (const entry of paymentResult.value.ledgerEntries) {
          insertMoneyLedgerEntry(tx, {
            id: this.ids.next(),
            entryType: 'purchase_payment',
            direction: 'out',
            amountPiasters: entry.amountPiasters,
            paymentMethod: entry.method,
            supplierId: input.supplierId ?? null,
            referenceType: 'purchase',
            referenceId: purchaseId,
            occurredAt: now,
            userId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
        }

        // Supplier credit for unpaid balance
        if (paymentResult.value.duePiasters > 0 && input.supplierId) {
          insertMoneyLedgerEntry(tx, {
            id: this.ids.next(),
            entryType: 'purchase_credit',
            direction: 'in',
            amountPiasters: paymentResult.value.duePiasters,
            paymentMethod: 'credit',
            supplierId: input.supplierId,
            referenceType: 'purchase',
            referenceId: purchaseId,
            occurredAt: now,
            userId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
        }
        this.faults.after('purchase.money_inserted')

        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'purchase_received', entityType: 'purchase', entityId: purchaseId,
          after: { purchaseNumber, totalPiasters, status: paymentResult.value.status },
          now, deviceId: this.deps.deviceId,
        })
        this.faults.after('purchase.audited')
      })

      if (resultRef !== undefined && !resultRef.ok) return resultRef

      const purchase = getPurchase(this.deps.database, purchaseId)
      const items = listPurchaseItems(this.deps.database, purchaseId)
      if (purchase === undefined) return serviceErr('database_error')
      return serviceOk({ purchase, items })
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'stock_error') return resultRef
      return serviceErr('database_error', e)
    }
  }

  async getPurchase(purchaseId: string): Promise<ServiceResult<PurchaseResult>> {
    try {
      const purchase = getPurchase(this.deps.database, purchaseId)
      if (purchase === undefined) return serviceErr('not_found')
      const items = listPurchaseItems(this.deps.database, purchaseId)
      return serviceOk({ purchase, items })
    } catch (e) { return serviceErr('database_error', e) }
  }
}

// ─── SupplierService ──────────────────────────────────────────────────────────

type SupplierDeps = { database: DatabaseHandle; clock: Clock; ids?: IdGenerator; deviceId: string; faults?: FaultInjector }

export class SupplierService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector
  constructor(private readonly deps: SupplierDeps) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
  }

  async listSuppliers(): Promise<ServiceResult<SupplierRow[]>> {
    try { return serviceOk(listSuppliers(this.deps.database)) } catch (e) { return serviceErr('database_error', e) }
  }

  async createSupplier(actor: Actor, fields: { name: string; phone?: string | null; address?: string | null; metadata?: string | null }): Promise<ServiceResult<SupplierRow>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertSupplier(tx, { id, ...fields, createdAt: now, updatedAt: now, deviceId: this.deps.deviceId })
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'supplier_created', entityType: 'supplier', entityId: id, after: { name: fields.name }, now, deviceId: this.deps.deviceId })
        this.faults.after('supplier.created_audited')
      })
      const row = getSupplier(this.deps.database, id)
      if (row === undefined) return serviceErr('database_error')
      return serviceOk(row)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async updateSupplier(actor: Actor, id: string, fields: Partial<Pick<SupplierRow, 'name' | 'phone' | 'address' | 'metadata'>>): Promise<ServiceResult<SupplierRow>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      if (getSupplier(this.deps.database, id) === undefined) return serviceErr('not_found')
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        updateSupplier(tx, id, { ...fields, updatedAt: now })
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'supplier_updated', entityType: 'supplier', entityId: id, after: fields, now, deviceId: this.deps.deviceId })
        this.faults.after('supplier.updated_audited')
      })
      const row = getSupplier(this.deps.database, id)
      if (row === undefined) return serviceErr('database_error')
      return serviceOk(row)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async deleteSupplier(actor: Actor, id: string): Promise<ServiceResult<true>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      if (getSupplier(this.deps.database, id) === undefined) return serviceErr('not_found')
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        softDeleteSupplier(tx, id, now)
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'supplier_deleted', entityType: 'supplier', entityId: id, now, deviceId: this.deps.deviceId })
        this.faults.after('supplier.deleted_audited')
      })
      return serviceOk(true)
    } catch (e) { return serviceErr('database_error', e) }
  }
}
