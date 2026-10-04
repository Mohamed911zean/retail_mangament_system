import type { DatabaseHandle } from '../database/repositories/common'
import { runInTransaction } from '../database/repositories/common'
import { getSale, listSaleItems } from '../database/repositories/sales'
import { getSaleReturn, insertSaleReturn, insertSaleReturnItem, listSaleReturnItems, listSaleReturnsBySale } from '../database/repositories/sale-returns'
import { insertMoneyLedgerEntry } from '../database/repositories/money-ledger'
import { nextSequenceNumber } from '../database/repositories/sequences'
import type { SaleReturnRow, SaleReturnItemRow } from '../database/rows'
import { validateReturnQty, calculateReturnRefund, calculateReturnStockValue } from '../../domain/returns'
import { applyMovement, type StockEngineDependencies } from './stockEngine'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import { noFaults } from './fault-injector'
import type { IdGenerator } from './ids'
import { createUlidGenerator } from './ids'
import type { Actor } from './permissions'
import { serviceErr, serviceOk, type ServiceResult, ServiceTransactionError } from './result'
import { writeAudit } from './audit'

export type ReturnLineInput = {
  saleItemId: string
  qtyBase: number
  condition: 'resalable' | 'damaged'
}

export type SaleReturnInput = {
  originalSaleId: string
  shiftId?: string | null
  lines: ReturnLineInput[]
  cashRefundPiasters?: number
  reason?: string | null
}

export type SaleReturnResult = { saleReturn: SaleReturnRow; items: SaleReturnItemRow[] }

type ReturnDeps = {
  database: DatabaseHandle
  clock: Clock
  ids?: IdGenerator
  deviceId: string
  allowNegativeStock: boolean
  faults?: FaultInjector
}

export class SaleReturnService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector
  private readonly engineDeps: StockEngineDependencies
  constructor(private readonly deps: ReturnDeps) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
    this.engineDeps = { ids: this.ids, clock: deps.clock, faults: this.faults, allowNegativeStock: deps.allowNegativeStock }
  }

  async processReturn(actor: Actor, input: SaleReturnInput): Promise<ServiceResult<SaleReturnResult>> {
    try {
      const originalSale = getSale(this.deps.database, input.originalSaleId)
      if (originalSale === undefined) return serviceErr('not_found', { field: 'originalSaleId' })
      if (originalSale.status === 'voided') return serviceErr('document_already_voided')

      const originalItems = listSaleItems(this.deps.database, input.originalSaleId)
      const previousReturns = listSaleReturnsBySale(this.deps.database, input.originalSaleId)

      // Build cumulative already-returned qty/value per sale item
      const alreadyReturnedQty: Record<string, number> = {}
      const alreadyReturnedValue: Record<string, number> = {}
      const alreadyReturnedResalableQty: Record<string, number> = {}
      const alreadyReturnedCost: Record<string, number> = {}
      for (const ret of previousReturns) {
        if (ret.status === 'voided') continue
        const retItems = listSaleReturnItems(this.deps.database, ret.id)
        for (const ri of retItems) {
          alreadyReturnedQty[ri.saleItemId] = (alreadyReturnedQty[ri.saleItemId] ?? 0) + ri.qtyBase
          alreadyReturnedValue[ri.saleItemId] = (alreadyReturnedValue[ri.saleItemId] ?? 0) + ri.refundPiasters
          if (ri.condition === 'resalable') {
            alreadyReturnedResalableQty[ri.saleItemId] = (alreadyReturnedResalableQty[ri.saleItemId] ?? 0) + ri.qtyBase
            const orig = originalItems.find((oi) => oi.id === ri.saleItemId)
            if (orig) {
              const resCost = calculateReturnStockValue(orig.lineCostPiasters, alreadyReturnedResalableQty[ri.saleItemId], orig.qtyBase, 0, 0)
              if (resCost.ok) alreadyReturnedCost[ri.saleItemId] = resCost.value
            }
          }
        }
      }

      // Validate all requested line quantities before touching DB
      const lineData: { saleItemId: string; originalItem: (typeof originalItems)[number]; qtyBase: number; condition: 'resalable' | 'damaged'; refundPiasters: number; stockValuePiasters: number }[] = []
      let totalRefundPiasters = 0
      for (const line of input.lines) {
        const originalItem = originalItems.find((i) => i.id === line.saleItemId)
        if (originalItem === undefined) return serviceErr('not_found', { field: 'saleItemId', value: line.saleItemId })
        const validateResult = validateReturnQty(originalItem.qtyBase, alreadyReturnedQty[line.saleItemId] ?? 0, line.qtyBase)
        if (!validateResult.ok) return serviceErr(validateResult.error.code, validateResult.error)
        const refundResult = calculateReturnRefund(
          originalItem.finalLineTotalPiasters,
          line.qtyBase,
          originalItem.qtyBase,
          alreadyReturnedQty[line.saleItemId] ?? 0,
          alreadyReturnedValue[line.saleItemId] ?? 0,
        )
        if (!refundResult.ok) return serviceErr(refundResult.error.code, refundResult.error)
        let stockValuePiasters = 0
        if (line.condition === 'resalable') {
          const stockValResult = calculateReturnStockValue(
            originalItem.lineCostPiasters,
            line.qtyBase,
            originalItem.qtyBase,
            alreadyReturnedResalableQty[line.saleItemId] ?? 0,
            alreadyReturnedCost[line.saleItemId] ?? 0,
          )
          if (!stockValResult.ok) return serviceErr(stockValResult.error.code, stockValResult.error)
          stockValuePiasters = stockValResult.value
        }
        totalRefundPiasters += refundResult.value
        lineData.push({ saleItemId: line.saleItemId, originalItem, qtyBase: line.qtyBase, condition: line.condition, refundPiasters: refundResult.value, stockValuePiasters })
      }

      const cashRefunded = input.cashRefundPiasters !== undefined ? input.cashRefundPiasters : totalRefundPiasters
      const creditedToAccount = totalRefundPiasters - cashRefunded

      const now = this.deps.clock.now()
      const returnId = this.ids.next()
      const returnNumber = String(nextSequenceNumber(this.deps.database, this.deps.deviceId, 'sale_return', now))
      this.faults.after('sale_return.sequence_allocated')

      runInTransaction(this.deps.database, (tx) => {
        insertSaleReturn(tx, {
          id: returnId,
          returnNumber,
          originalSaleId: input.originalSaleId,
          customerId: originalSale.customerId,
          userId: actor.userId,
          shiftId: input.shiftId ?? null,
          totalPiasters: totalRefundPiasters,
          cashRefundedPiasters: cashRefunded,
          creditedToAccountPiasters: creditedToAccount,
          status: 'completed',
          reason: input.reason ?? null,
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        this.faults.after('sale_return.header_inserted')

        for (let i = 0; i < lineData.length; i++) {
          const ld = lineData[i]
          const itemId = this.ids.next()
          insertSaleReturnItem(tx, {
            id: itemId,
            saleReturnId: returnId,
            saleItemId: ld.saleItemId,
            productId: ld.originalItem.productId,
            qtyBase: ld.qtyBase,
            refundPiasters: ld.refundPiasters,
            condition: ld.condition,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
          this.faults.after(`sale_return.item.${i}.inserted`)

          // Only add back stock for resalable items
          if (ld.condition === 'resalable') {
            const stockResult = applyMovement(tx, this.engineDeps, {
              productId: ld.originalItem.productId,
              qtyDelta: ld.qtyBase,
              valuePiasters: ld.stockValuePiasters,
              movementType: 'sale_return',
              referenceType: 'sale_return',
              referenceId: itemId,
              userId: actor.userId,
              deviceId: this.deps.deviceId,
            })
            if (!stockResult.ok) {
              throw new ServiceTransactionError(serviceErr(stockResult.error.code, stockResult.error))
            }
            this.faults.after(`sale_return.item.${i}.stock_applied`)
          }
        }

        // Cash refund money ledger entry
        if (cashRefunded > 0) {
          insertMoneyLedgerEntry(tx, {
            id: this.ids.next(),
            entryType: 'sale_return_refund',
            direction: 'out',
            amountPiasters: cashRefunded,
            paymentMethod: 'cash',
            customerId: originalSale.customerId,
            saleId: input.originalSaleId,
            referenceType: 'sale_return',
            referenceId: returnId,
            shiftId: input.shiftId ?? null,
            occurredAt: now,
            userId: actor.userId,
            createdAt: now,
            updatedAt: now,
            deviceId: this.deps.deviceId,
          })
        }
        this.faults.after('sale_return.money_inserted')

        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'sale_return_processed', entityType: 'sale_return', entityId: returnId,
          after: { returnNumber, originalSaleId: input.originalSaleId, totalPiasters: totalRefundPiasters },
          now, deviceId: this.deps.deviceId,
        })
        this.faults.after('sale_return.audited')
      })

      const saleReturn = getSaleReturn(this.deps.database, returnId)
      const items = listSaleReturnItems(this.deps.database, returnId)
      if (saleReturn === undefined) return serviceErr('database_error')
      return serviceOk({ saleReturn, items })
    } catch (e: unknown) {
      if (e instanceof ServiceTransactionError) return e.result
      return serviceErr('database_error', e)
    }
  }

  async getSaleReturn(id: string): Promise<ServiceResult<SaleReturnResult>> {
    try {
      const saleReturn = getSaleReturn(this.deps.database, id)
      if (saleReturn === undefined) return serviceErr('not_found')
      const items = listSaleReturnItems(this.deps.database, id)
      return serviceOk({ saleReturn, items })
    } catch (e) { return serviceErr('database_error', e) }
  }
}
