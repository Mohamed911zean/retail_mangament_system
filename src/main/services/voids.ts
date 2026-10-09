import type { DatabaseHandle } from '../database/repositories/common'
import { runInTransaction } from '../database/repositories/common'
import { getSale } from '../database/repositories/sales'
import { getPurchase } from '../database/repositories/purchases'
import { getSaleReturn } from '../database/repositories/sale-returns'
import { getExpense, updateExpenseVoidMetadata } from '../database/repositories/expenses'
import { updateSaleVoidMetadata } from '../database/repositories/sales'
import { updatePurchaseVoidMetadata } from '../database/repositories/purchases'
import { updateSaleReturnVoidMetadata } from '../database/repositories/sale-returns'
import { listMoneyLedgerByReference, insertMoneyLedgerEntry } from '../database/repositories/money-ledger'
import { getOnHand, insertStockMovement } from '../database/repositories/stock'
import { listSaleReturnsBySale } from '../database/repositories/sale-returns'
import { calculateVoidCompensation } from '../../domain/voids'
import { getOpenShift } from '../database/repositories/shifts'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import { noFaults } from './fault-injector'
import type { IdGenerator } from './ids'
import { createUlidGenerator } from './ids'
import type { Actor } from './permissions'
import { serviceErr, serviceOk, type ServiceResult, ServiceTransactionError } from './result'
import { writeAudit } from './audit'

export type VoidInput = {
  documentId: string
  reason: string
}

type VoidDeps = {
  database: DatabaseHandle
  clock: Clock
  ids?: IdGenerator
  deviceId: string
  allowNegativeStock: boolean
  shiftsEnabled?: boolean
  faults?: FaultInjector
}

type StockMovementRow = {
  id: string
  product_id: string
  batch_id: string | null
  movement_type: string
  qty_delta: number
  value_delta_piasters: number
}

export class VoidService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector
  constructor(private readonly deps: VoidDeps) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
  }

  async voidSale(actor: Actor, input: VoidInput): Promise<ServiceResult<{ id: string }>> {
    try {
      const sale = getSale(this.deps.database, input.documentId)
      if (sale === undefined) return serviceErr('not_found', { field: 'documentId' })

      const openShift = getOpenShift(this.deps.database, this.deps.deviceId)
      const shiftsEnabled = this.deps.shiftsEnabled ?? false

      // Collect prior completed returns to block void
      const priorReturns = listSaleReturnsBySale(this.deps.database, input.documentId)
      const hasCompletedReturns = priorReturns.some((r) => r.status === 'completed')

      // Gather stock movements for this sale (reference_type='sale', reference_id=saleId)
      const stockMovements = this.deps.database
        .prepare("SELECT * FROM stock_movements WHERE reference_type = 'sale' AND reference_id = ?")
        .all(input.documentId) as StockMovementRow[]

      // Gather money ledger entries for sale payments on this sale
      const moneyEntries = listMoneyLedgerByReference(this.deps.database, 'sale', input.documentId)

      // Build onHandQtyByProduct for negative-stock check (N/A for sales — voiding adds back stock, can't go negative)
      const onHandQtyByProduct: Record<string, number> = {}

      const domainResult = calculateVoidCompensation({
        documentType: 'sale',
        documentStatus: sale.status as 'completed' | 'posted' | 'voided',
        hasCompletedReturns,
        stockMovements: stockMovements.map((m) => ({
          id: m.id,
          productId: m.product_id,
          batchId: m.batch_id,
          movementType: m.movement_type,
          qtyDelta: m.qty_delta,
          valueDeltaPiasters: m.value_delta_piasters,
        })),
        moneyEntries: moneyEntries.map((e) => ({
          id: e.id,
          entryType: e.entryType,
          method: e.paymentMethod ?? 'cash',
          direction: e.direction,
          amountPiasters: e.amountPiasters,
        })),
        currentOpenShiftId: openShift?.id ?? null,
        shiftsEnabled,
        allowNegativeStock: this.deps.allowNegativeStock,
        onHandQtyByProduct,
      })
      if (!domainResult.ok) return serviceErr(domainResult.error.code, domainResult.error)

      const now = this.deps.clock.now()

      runInTransaction(this.deps.database, (tx) => {
        this.faults.after('void.sale.start')
        for (const sc of domainResult.value.stockCompensations) {
          const movId = this.ids.next()
          insertStockMovement(tx, {
            id: movId,
            productId: sc.productId,
            batchId: sc.batchId,
            qtyDelta: sc.qtyDelta,
            valueDeltaPiasters: sc.valueDeltaPiasters,
            movementType: 'void_compensation',
            reversesMovementId: sc.reversesMovementId,
            referenceType: 'sale',
            referenceId: input.documentId,
            occurredAt: now,
            reason: `void: ${input.reason}`,
            createdByUserId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
        }
        this.faults.after('void.sale.stock_written')
        const moneyEntriesMap = new Map(moneyEntries.map((e) => [e.id, e]))
        for (const mc of domainResult.value.moneyCompensations) {
          const original = moneyEntriesMap.get(mc.reversesEntryId)
          insertMoneyLedgerEntry(tx, {
            id: this.ids.next(),
            entryType: 'void_compensation',
            direction: mc.direction,
            amountPiasters: mc.amountPiasters,
            paymentMethod: mc.method,
            customerId: original?.customerId ?? null,
            supplierId: null,
            saleId: input.documentId,
            referenceType: 'sale',
            referenceId: input.documentId,
            reversesEntryId: mc.reversesEntryId,
            shiftId: mc.shiftId,
            occurredAt: now,
            userId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
        }
        this.faults.after('void.sale.money_written')
        updateSaleVoidMetadata(tx, input.documentId, now, now, actor.userId, input.reason)
        this.faults.after('void.sale.status_updated')
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'sale_voided', entityType: 'sale', entityId: input.documentId,
          after: { reason: input.reason },
          now, deviceId: this.deps.deviceId,
        })
      })
      this.faults.after('void.sale.committed')
      return serviceOk({ id: input.documentId })
    } catch (e: unknown) {
      if (e instanceof ServiceTransactionError) return e.result
      return serviceErr('database_error', e)
    }
  }

  async voidPurchase(actor: Actor, input: VoidInput): Promise<ServiceResult<{ id: string }>> {
    try {
      const purchase = getPurchase(this.deps.database, input.documentId)
      if (purchase === undefined) return serviceErr('not_found', { field: 'documentId' })

      const openShift = getOpenShift(this.deps.database, this.deps.deviceId)
      const shiftsEnabled = this.deps.shiftsEnabled ?? false

      const stockMovements = this.deps.database
        .prepare("SELECT * FROM stock_movements WHERE reference_type = 'purchase' AND reference_id = ?")
        .all(input.documentId) as StockMovementRow[]

      const moneyEntries = listMoneyLedgerByReference(this.deps.database, 'purchase', input.documentId)

      // For purchase void: check if removing purchased qty would go negative
      const productIds = [...new Set(stockMovements.map((m) => m.product_id))]
      const onHandQtyByProduct: Record<string, number> = {}
      for (const pid of productIds) {
        const oh = getOnHand(this.deps.database, pid)
        onHandQtyByProduct[pid] = oh.qty
      }

      const domainResult = calculateVoidCompensation({
        documentType: 'purchase',
        documentStatus: purchase.status as 'completed' | 'posted' | 'voided',
        hasCompletedReturns: false,
        stockMovements: stockMovements.map((m) => ({
          id: m.id,
          productId: m.product_id,
          batchId: m.batch_id,
          movementType: m.movement_type,
          qtyDelta: m.qty_delta,
          valueDeltaPiasters: m.value_delta_piasters,
        })),
        moneyEntries: moneyEntries.map((e) => ({
          id: e.id,
          entryType: e.entryType,
          method: e.paymentMethod ?? 'cash',
          direction: e.direction,
          amountPiasters: e.amountPiasters,
        })),
        currentOpenShiftId: openShift?.id ?? null,
        shiftsEnabled,
        allowNegativeStock: this.deps.allowNegativeStock,
        onHandQtyByProduct,
      })
      if (!domainResult.ok) return serviceErr(domainResult.error.code, domainResult.error)

      const now = this.deps.clock.now()

      runInTransaction(this.deps.database, (tx) => {
        this.faults.after('void.purchase.start')
        for (const sc of domainResult.value.stockCompensations) {
          insertStockMovement(tx, {
            id: this.ids.next(),
            productId: sc.productId,
            batchId: sc.batchId,
            qtyDelta: sc.qtyDelta,
            valueDeltaPiasters: sc.valueDeltaPiasters,
            movementType: 'void_compensation',
            reversesMovementId: sc.reversesMovementId,
            referenceType: 'purchase',
            referenceId: input.documentId,
            occurredAt: now,
            reason: `void: ${input.reason}`,
            createdByUserId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
        }
        this.faults.after('void.purchase.stock_written')
        const moneyEntriesMap = new Map(moneyEntries.map((e) => [e.id, e]))
        for (const mc of domainResult.value.moneyCompensations) {
          const original = moneyEntriesMap.get(mc.reversesEntryId)
          insertMoneyLedgerEntry(tx, {
            id: this.ids.next(),
            entryType: 'void_compensation',
            direction: mc.direction,
            amountPiasters: mc.amountPiasters,
            paymentMethod: mc.method,
            customerId: null,
            supplierId: original?.supplierId ?? null,
            referenceType: 'purchase',
            referenceId: input.documentId,
            reversesEntryId: mc.reversesEntryId,
            shiftId: mc.shiftId,
            occurredAt: now,
            userId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
        }
        this.faults.after('void.purchase.money_written')
        updatePurchaseVoidMetadata(tx, input.documentId, now, now, actor.userId, input.reason)
        this.faults.after('void.purchase.status_updated')
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'purchase_voided', entityType: 'purchase', entityId: input.documentId,
          after: { reason: input.reason },
          now, deviceId: this.deps.deviceId,
        })
      })
      this.faults.after('void.purchase.committed')
      return serviceOk({ id: input.documentId })
    } catch (e: unknown) {
      if (e instanceof ServiceTransactionError) return e.result
      return serviceErr('database_error', e)
    }
  }

  async voidSaleReturn(actor: Actor, input: VoidInput): Promise<ServiceResult<{ id: string }>> {
    try {
      const saleReturn = getSaleReturn(this.deps.database, input.documentId)
      if (saleReturn === undefined) return serviceErr('not_found', { field: 'documentId' })

      const openShift = getOpenShift(this.deps.database, this.deps.deviceId)
      const shiftsEnabled = this.deps.shiftsEnabled ?? false

      // Stock movements for a sale_return use reference_type='sale_return', reference_id=item_id
      // We need all movements that belong to this return's items.
      // Use the sale_return_items to find item IDs, then join to stock_movements.
      const stockMovements = this.deps.database
        .prepare(`
          SELECT sm.* FROM stock_movements sm
          INNER JOIN sale_return_items sri ON sri.id = sm.reference_id
          WHERE sm.reference_type = 'sale_return' AND sri.sale_return_id = ?
        `)
        .all(input.documentId) as StockMovementRow[]

      const moneyEntries = listMoneyLedgerByReference(this.deps.database, 'sale_return', input.documentId)

      const domainResult = calculateVoidCompensation({
        documentType: 'sale',  // sale_return uses same void logic as sale (no stock check needed for void)
        documentStatus: saleReturn.status as 'completed' | 'posted' | 'voided',
        hasCompletedReturns: false,
        stockMovements: stockMovements.map((m) => ({
          id: m.id,
          productId: m.product_id,
          batchId: m.batch_id,
          movementType: m.movement_type,
          qtyDelta: m.qty_delta,
          valueDeltaPiasters: m.value_delta_piasters,
        })),
        moneyEntries: moneyEntries.map((e) => ({
          id: e.id,
          entryType: e.entryType,
          method: e.paymentMethod ?? 'cash',
          direction: e.direction,
          amountPiasters: e.amountPiasters,
        })),
        currentOpenShiftId: openShift?.id ?? null,
        shiftsEnabled,
        allowNegativeStock: this.deps.allowNegativeStock,
        onHandQtyByProduct: {},
      })
      if (!domainResult.ok) return serviceErr(domainResult.error.code, domainResult.error)

      const now = this.deps.clock.now()

      runInTransaction(this.deps.database, (tx) => {
        this.faults.after('void.sale_return.start')
        for (const sc of domainResult.value.stockCompensations) {
          insertStockMovement(tx, {
            id: this.ids.next(),
            productId: sc.productId,
            batchId: sc.batchId,
            qtyDelta: sc.qtyDelta,
            valueDeltaPiasters: sc.valueDeltaPiasters,
            movementType: 'void_compensation',
            reversesMovementId: sc.reversesMovementId,
            referenceType: 'sale_return',
            referenceId: input.documentId,
            occurredAt: now,
            reason: `void: ${input.reason}`,
            createdByUserId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
        }
        this.faults.after('void.sale_return.stock_written')
        const moneyEntriesMap = new Map(moneyEntries.map((e) => [e.id, e]))
        for (const mc of domainResult.value.moneyCompensations) {
          const original = moneyEntriesMap.get(mc.reversesEntryId)
          insertMoneyLedgerEntry(tx, {
            id: this.ids.next(),
            entryType: 'void_compensation',
            direction: mc.direction,
            amountPiasters: mc.amountPiasters,
            paymentMethod: mc.method,
            customerId: original?.customerId ?? null,
            supplierId: null,
            referenceType: 'sale_return',
            referenceId: input.documentId,
            reversesEntryId: mc.reversesEntryId,
            shiftId: mc.shiftId,
            occurredAt: now,
            userId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
        }
        this.faults.after('void.sale_return.money_written')
        updateSaleReturnVoidMetadata(tx, input.documentId, now, now, actor.userId, input.reason)
        this.faults.after('void.sale_return.status_updated')
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'sale_return_voided', entityType: 'sale_return', entityId: input.documentId,
          after: { reason: input.reason },
          now, deviceId: this.deps.deviceId,
        })
      })
      this.faults.after('void.sale_return.committed')
      return serviceOk({ id: input.documentId })
    } catch (e: unknown) {
      if (e instanceof ServiceTransactionError) return e.result
      return serviceErr('database_error', e)
    }
  }

  async voidExpense(actor: Actor, input: VoidInput): Promise<ServiceResult<{ id: string }>> {
    try {
      const expense = getExpense(this.deps.database, input.documentId)
      if (expense === undefined) return serviceErr('not_found', { field: 'documentId' })

      const openShift = getOpenShift(this.deps.database, this.deps.deviceId)
      const shiftsEnabled = this.deps.shiftsEnabled ?? false

      const moneyEntries = listMoneyLedgerByReference(this.deps.database, 'expense', input.documentId)

      const domainResult = calculateVoidCompensation({
        documentType: 'expense',
        documentStatus: expense.status as 'completed' | 'posted' | 'voided',
        hasCompletedReturns: false,
        stockMovements: [],
        moneyEntries: moneyEntries.map((e) => ({
          id: e.id,
          entryType: e.entryType,
          method: e.paymentMethod ?? 'cash',
          direction: e.direction,
          amountPiasters: e.amountPiasters,
        })),
        currentOpenShiftId: openShift?.id ?? null,
        shiftsEnabled,
        allowNegativeStock: this.deps.allowNegativeStock,
        onHandQtyByProduct: {},
      })
      if (!domainResult.ok) return serviceErr(domainResult.error.code, domainResult.error)

      const now = this.deps.clock.now()

      runInTransaction(this.deps.database, (tx) => {
        this.faults.after('void.expense.start')
        // Expenses have no stock movements
        for (const mc of domainResult.value.moneyCompensations) {
          insertMoneyLedgerEntry(tx, {
            id: this.ids.next(),
            entryType: 'void_compensation',
            direction: mc.direction,
            amountPiasters: mc.amountPiasters,
            paymentMethod: mc.method,
            customerId: null,
            supplierId: null,
            referenceType: 'expense',
            referenceId: input.documentId,
            reversesEntryId: mc.reversesEntryId,
            shiftId: mc.shiftId,
            occurredAt: now,
            userId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
        }
        this.faults.after('void.expense.money_written')
        updateExpenseVoidMetadata(tx, input.documentId, now, now, actor.userId, input.reason)
        this.faults.after('void.expense.status_updated')
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'expense_voided', entityType: 'expense', entityId: input.documentId,
          after: { reason: input.reason },
          now, deviceId: this.deps.deviceId,
        })
      })
      this.faults.after('void.expense.committed')
      return serviceOk({ id: input.documentId })
    } catch (e: unknown) {
      if (e instanceof ServiceTransactionError) return e.result
      return serviceErr('database_error', e)
    }
  }
}
