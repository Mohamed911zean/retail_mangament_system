import type { DatabaseHandle } from '../database/repositories/common'
import { listSalesInRange, listSaleItemsInRange } from '../database/repositories/sales'
import { listSaleReturnItemsInRange } from '../database/repositories/sale-returns'
import { getOnHand, sumRestockValueByReturnItem, sumRevaluationInRange } from '../database/repositories/stock'
import { listProducts } from '../database/repositories/catalog'
import { calculateProfitSummary, calculateStockValue, type ProfitSummary, type StockValue } from '../../domain/reports'
import type { SaleRow } from '../database/rows'
import { serviceErr, serviceOk, type ServiceResult } from './result'

/**
 * Read-only reports. Every number on a report is either a stored finalized
 * figure (invoice totals, ledger rows) or the output of a pure domain function
 * (`calculateProfitSummary`, `calculateStockValue`) — this service only loads
 * the rows those functions need and never invents arithmetic.
 */
export type ReportRange = { fromMs: number; toMs: number }

export type ProfitReport = ProfitSummary & { salesLines: number; returnItems: number }

export class ReportService {
  constructor(private readonly deps: { database: DatabaseHandle }) {}

  private validRange(range: ReportRange): boolean {
    return (
      Number.isSafeInteger(range.fromMs) && Number.isSafeInteger(range.toMs) && range.fromMs >= 0 && range.toMs >= 0 && range.fromMs <= range.toMs
    )
  }

  async listSalesInRange(range: ReportRange): Promise<ServiceResult<SaleRow[]>> {
    try {
      if (!this.validRange(range)) return serviceErr('invalid_input', { field: 'fromMs' })
      return serviceOk(listSalesInRange(this.deps.database, range.fromMs, range.toMs))
    } catch (e) {
      return serviceErr('database_error', e)
    }
  }

  async getProfitReport(range: ReportRange): Promise<ServiceResult<ProfitReport>> {
    try {
      if (!this.validRange(range)) return serviceErr('invalid_input', { field: 'fromMs' })

      const lines = listSaleItemsInRange(this.deps.database, range.fromMs, range.toMs)
      const returnItems = listSaleReturnItemsInRange(this.deps.database, range.fromMs, range.toMs)
      const restocked = sumRestockValueByReturnItem(
        this.deps.database,
        returnItems.filter((item) => item.condition === 'resalable').map((item) => item.id),
      )
      const variance = sumRevaluationInRange(this.deps.database, range.fromMs, range.toMs)
      if (!Number.isSafeInteger(variance)) return serviceErr('database_error', { field: 'costVariance' })

      const summary = calculateProfitSummary({
        saleLines: lines.map((line) => ({
          status: line.saleStatus === 'completed' ? 'completed' : 'voided',
          finalLineTotalPiasters: line.finalLineTotalPiasters,
          discountPiasters: line.lineDiscountPiasters + line.invoiceDiscountAllocatedPiasters,
          lineCostPiasters: line.lineCostPiasters,
        })),
        returns: returnItems.map((item) => ({
          status: item.returnStatus === 'completed' ? 'completed' : 'voided',
          refundPiasters: item.refundPiasters,
          condition: item.condition,
          restockedValuePiasters: item.condition === 'resalable' ? (restocked.get(item.id) ?? 0) : 0,
        })),
        costVariancePiasters: variance,
      })
      if (!summary.ok) return serviceErr('database_error', summary.error)
      return serviceOk({ ...summary.value, salesLines: lines.length, returnItems: returnItems.length })
    } catch (e) {
      return serviceErr('database_error', e)
    }
  }

  async getStockValueReport(): Promise<ServiceResult<StockValue>> {
    try {
      const products = listProducts(this.deps.database)
      const rows = products.map((product) => {
        const onHand = getOnHand(this.deps.database, product.id)
        return { productId: product.id, onHandQty: onHand.qty, onHandValuePiasters: onHand.valuePiasters }
      })
      const value = calculateStockValue(rows)
      if (!value.ok) return serviceErr('database_error', value.error)
      return serviceOk(value.value)
    } catch (e) {
      return serviceErr('database_error', e)
    }
  }
}
