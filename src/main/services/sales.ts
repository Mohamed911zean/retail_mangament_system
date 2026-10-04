import type { DatabaseHandle } from '../database/repositories/common'
import { runInTransaction } from '../database/repositories/common'
import { getSale, insertSale, insertSaleItem, listSaleItems } from '../database/repositories/sales'
import { insertMoneyLedgerEntry, listMoneyLedgerByReference } from '../database/repositories/money-ledger'
import { insertHeldSale, getHeldSale, listHeldSales, softDeleteHeldSale } from '../database/repositories/held-sales'
import { nextSequenceNumber } from '../database/repositories/sequences'
import { getProduct } from '../database/repositories/catalog'
import { getCustomer } from '../database/repositories/customers'
import type { SaleRow, SaleItemRow } from '../database/rows'
import { calculateLineAmounts, type LineInput } from '../../domain/lineAmounts'
import { calculateSaleTotals } from '../../domain/saleTotals'
import { calculatePaymentAllocation, type Tender } from '../../domain/payments'
import type { Discount } from '../../domain/discount'
import { applyMovement, type StockEngineDependencies } from './stockEngine'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import { noFaults } from './fault-injector'
import type { IdGenerator } from './ids'
import { createUlidGenerator } from './ids'
import type { Actor } from './permissions'
import { serviceErr, serviceOk, type ServiceResult } from './result'
import { writeAudit } from './audit'

export type SaleLineInput = {
  productId: string
  unitNameSnapshot: string
  pricedUnitQtyBase: number
  qtyBase: number
  unitPricePiasters: number
  lineDiscount?: Discount
  batchId?: string | null
}

export type CompleteSaleInput = {
  customerId?: string | null
  shiftId?: string | null
  lines: SaleLineInput[]
  invoiceDiscount?: Discount
  tenders: Tender[]
  notes?: string | null
  taxEnabled: boolean
  cashRoundingStep: number
}

export type SaleResult = {
  sale: SaleRow
  items: SaleItemRow[]
}

type SaleDeps = {
  database: DatabaseHandle
  clock: Clock
  ids?: IdGenerator
  deviceId: string
  allowNegativeStock: boolean
  faults?: FaultInjector
}

export class SaleService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector
  private readonly engineDeps: StockEngineDependencies
  constructor(private readonly deps: SaleDeps) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
    this.engineDeps = { ids: this.ids, clock: deps.clock, faults: this.faults, allowNegativeStock: deps.allowNegativeStock }
  }

  async completeSale(actor: Actor, input: CompleteSaleInput): Promise<ServiceResult<SaleResult>> {
    try {
      // Validate customer exists if provided
      if (input.customerId) {
        const customer = getCustomer(this.deps.database, input.customerId)
        if (customer === undefined) return serviceErr('not_found', { field: 'customerId' })
      }

      // Build line inputs for domain calculation
      const lineInputs: (LineInput & { productId: string; pricedUnitQtyBase: number; qtyBase: number; unitPricePiasters: number; batchId: string | null; unitNameSnapshot: string; productNameSnapshot: string })[] = []
      for (const line of input.lines) {
        const product = getProduct(this.deps.database, line.productId)
        if (product === undefined) return serviceErr('not_found', { productId: line.productId })
        lineInputs.push({
          productId: line.productId,
          unitNameSnapshot: line.unitNameSnapshot,
          productNameSnapshot: product.name,
          pricedUnitQtyBase: line.pricedUnitQtyBase,
          qtyBase: line.qtyBase,
          unitPricePiasters: line.unitPricePiasters,
          taxRateBps: product.taxRateBps,
          lineDiscount: line.lineDiscount,
          batchId: line.batchId ?? null,
        })
      }

      const lineAmountsResult = calculateLineAmounts(
        lineInputs,
        input.invoiceDiscount ?? { kind: 'fixed', amountPiasters: 0 },
        input.taxEnabled,
      )
      if (!lineAmountsResult.ok) return serviceErr(lineAmountsResult.error.code, lineAmountsResult.error)

      const totalsResult = calculateSaleTotals(lineAmountsResult.value, input.cashRoundingStep)
      if (!totalsResult.ok) return serviceErr(totalsResult.error.code, totalsResult.error)

      const paymentResult = calculatePaymentAllocation(totalsResult.value.total, input.tenders, !!input.customerId)
      if (!paymentResult.ok) return serviceErr(paymentResult.error.code, paymentResult.error)

      const now = this.deps.clock.now()
      const saleId = this.ids.next()
      const invoiceNumber = String(nextSequenceNumber(this.deps.database, this.deps.deviceId, 'sale_invoice', now))
      this.faults.after('sale.sequence_allocated')

      let saleResult!: ServiceResult<SaleResult>

      runInTransaction(this.deps.database, (tx) => {
        // Insert the sale header
        insertSale(tx, {
          id: saleId,
          invoiceNumber,
          customerId: input.customerId ?? null,
          userId: actor.userId,
          shiftId: input.shiftId ?? null,
          subtotalPiasters: totalsResult.value.subtotal,
          lineDiscountPiasters: totalsResult.value.lineDiscount,
          invoiceDiscountPiasters: totalsResult.value.invoiceDiscount,
          taxPiasters: totalsResult.value.tax,
          roundingAdjustmentPiasters: totalsResult.value.roundingAdjustment,
          totalPiasters: totalsResult.value.total,
          paidPiasters: paymentResult.value.paidPiasters,
          duePiasters: paymentResult.value.duePiasters,
          paymentStatus: paymentResult.value.status,
          status: 'completed',
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        this.faults.after('sale.header_inserted')

        // Insert sale items and apply stock movements
        for (let i = 0; i < lineInputs.length; i++) {
          const line = lineInputs[i]
          const amounts = lineAmountsResult.value[i]
          const itemId = this.ids.next()

          // Apply stock outgoing movement
          const stockResult = applyMovement(tx, this.engineDeps, {
            productId: line.productId,
            qtyDelta: -line.qtyBase,
            movementType: 'sale',
            referenceType: 'sale',
            referenceId: saleId,
            batchId: line.batchId,
            userId: actor.userId,
            deviceId: this.deps.deviceId,
          })
          if (!stockResult.ok) {
            saleResult = serviceErr(stockResult.error.code, stockResult.error)
            throw new Error('stock_error')
          }
          this.faults.after(`sale.item.${i}.stock_applied`)

          insertSaleItem(tx, {
            id: itemId,
            saleId,
            productId: line.productId,
            unitNameSnapshot: line.unitNameSnapshot,
            pricedUnitQtyBase: line.pricedUnitQtyBase,
            qtyBase: line.qtyBase,
            unitPricePiasters: line.unitPricePiasters,
            lineSubtotalPiasters: amounts.lineSubtotal,
            lineDiscountPiasters: amounts.lineDiscount,
            invoiceDiscountAllocatedPiasters: amounts.invoiceDiscountAllocated,
            taxRateBpsSnapshot: amounts.taxRateBps,
            taxPiasters: amounts.tax,
            finalLineTotalPiasters: amounts.finalLineTotal,
            lineCostPiasters: stockResult.value.costPiasters,
            productNameSnapshot: line.productNameSnapshot,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
          this.faults.after(`sale.item.${i}.row_inserted`)
        }

        // Insert money ledger entries
        for (const entry of paymentResult.value.ledgerEntries) {
          const ledgerId = this.ids.next()
          const isCash = entry.method === 'cash'
          insertMoneyLedgerEntry(tx, {
            id: ledgerId,
            entryType: 'sale_payment',
            direction: 'in',
            amountPiasters: entry.amountPiasters,
            paymentMethod: entry.method,
            customerId: input.customerId ?? null,
            saleId,
            referenceType: 'sale',
            referenceId: saleId,
            shiftId: input.shiftId ?? null,
            tenderedPiasters: isCash ? paymentResult.value.cashTenderedPiasters : null,
            changePiasters: isCash ? paymentResult.value.changePiasters : null,
            occurredAt: now,
            userId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
          this.faults.after(`sale.ledger.${entry.method}_inserted`)
        }

        // Credit balance entry for unpaid amount
        if (paymentResult.value.duePiasters > 0 && input.customerId) {
          insertMoneyLedgerEntry(tx, {
            id: this.ids.next(),
            entryType: 'sale_credit',
            direction: 'out',
            amountPiasters: paymentResult.value.duePiasters,
            paymentMethod: 'credit',
            customerId: input.customerId,
            saleId,
            referenceType: 'sale',
            referenceId: saleId,
            shiftId: input.shiftId ?? null,
            occurredAt: now,
            userId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
        }
        this.faults.after('sale.money_inserted')

        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'sale_completed', entityType: 'sale', entityId: saleId,
          after: { invoiceNumber, total: totalsResult.value.total, status: paymentResult.value.status },
          now, deviceId: this.deps.deviceId,
        })
        this.faults.after('sale.audited')
      })

      if (saleResult !== undefined && !saleResult.ok) return saleResult

      const sale = getSale(this.deps.database, saleId)
      const items = listSaleItems(this.deps.database, saleId)
      if (sale === undefined) return serviceErr('database_error')
      return serviceOk({ sale, items })
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'stock_error') return saleResult
      return serviceErr('database_error', e)
    }
  }

  // ─── Held sales ────────────────────────────────────────────────────────────

  async holdSale(actor: Actor, payload: object, label: string | null, shiftId: string | null, customerId: string | null): Promise<ServiceResult<{ id: string }>> {
    try {
      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertHeldSale(tx, { id, label, userId: actor.userId, shiftId, customerId, payloadJson: JSON.stringify(payload), heldAt: now, createdAt: now, updatedAt: now, deviceId: this.deps.deviceId })
        this.faults.after('sale.held')
      })
      return serviceOk({ id })
    } catch (e) { return serviceErr('database_error', e) }
  }

  async recallHeldSale(id: string): Promise<ServiceResult<object>> {
    try {
      const row = getHeldSale(this.deps.database, id)
      if (row === undefined) return serviceErr('not_found')
      return serviceOk(JSON.parse(row.payloadJson) as object)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async deleteHeldSale(id: string): Promise<ServiceResult<true>> {
    try {
      if (getHeldSale(this.deps.database, id) === undefined) return serviceErr('not_found')
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        softDeleteHeldSale(tx, id, now)
        this.faults.after('sale.held_deleted')
      })
      return serviceOk(true)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async listHeldSales(userId?: string): Promise<ServiceResult<{ id: string; label: string | null; heldAt: number }[]>> {
    try {
      const rows = listHeldSales(this.deps.database, userId)
      return serviceOk(rows.map((r) => ({ id: r.id, label: r.label, heldAt: r.heldAt })))
    } catch (e) { return serviceErr('database_error', e) }
  }

  async getSale(saleId: string): Promise<ServiceResult<SaleResult>> {
    try {
      const sale = getSale(this.deps.database, saleId)
      if (sale === undefined) return serviceErr('not_found')
      const items = listSaleItems(this.deps.database, saleId)
      return serviceOk({ sale, items })
    } catch (e) { return serviceErr('database_error', e) }
  }

  async listPayments(saleId: string): Promise<ServiceResult<ReturnType<typeof listMoneyLedgerByReference>>> {
    try { return serviceOk(listMoneyLedgerByReference(this.deps.database, 'sale', saleId)) } catch (e) { return serviceErr('database_error', e) }
  }
}
