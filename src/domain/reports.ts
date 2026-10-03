import { mulDivRoundHalfUp } from './rounding'
import { safeInteger } from './integer'
import { err, ok, type DomainError, type Result } from './result'

function amount(value: number, field: string, allowNegative = false): Result<number, DomainError> {
  const result = safeInteger(value, field)
  if (!result.ok || (!allowNegative && result.value < 0)) {
    return err({ code: 'invalid_money', message: `${field} must be a ${allowNegative ? '' : 'non-negative '}safe integer`, field })
  }
  return ok(result.value)
}

function checked(value: bigint): Result<number, DomainError> {
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  if (value < -max || value > max) return err({ code: 'overflow', message: 'report total exceeds safe integer range' })
  return ok(Number(value))
}

export type ProfitSummary = {
  revenuePiasters: number
  discountPiasters: number
  costPiasters: number
  grossProfitPiasters: number
  marginBps: number
}

export function calculateProfitSummary(input: {
  saleLines: { status: 'completed' | 'voided'; finalLineTotalPiasters: number; discountPiasters: number; lineCostPiasters: number }[]
  returns: { status: 'completed' | 'voided'; refundPiasters: number; condition: 'resalable' | 'damaged'; restockedValuePiasters: number }[]
  costVariancePiasters: number
}): Result<ProfitSummary, DomainError> {
  let revenue = 0n
  let discount = 0n
  let cost = 0n
  for (const line of input.saleLines) {
    const final = amount(line.finalLineTotalPiasters, 'finalLineTotalPiasters')
    const lineDiscount = amount(line.discountPiasters, 'discountPiasters')
    const lineCost = amount(line.lineCostPiasters, 'lineCostPiasters')
    if (!final.ok) return final
    if (!lineDiscount.ok) return lineDiscount
    if (!lineCost.ok) return lineCost
    if (line.status === 'completed') {
      revenue += BigInt(final.value)
      discount += BigInt(lineDiscount.value)
      cost += BigInt(lineCost.value)
    }
  }
  for (const returned of input.returns) {
    const refund = amount(returned.refundPiasters, 'refundPiasters')
    const restocked = amount(returned.restockedValuePiasters, 'restockedValuePiasters')
    if (!refund.ok) return refund
    if (!restocked.ok) return restocked
    if (returned.status === 'completed') {
      revenue -= BigInt(refund.value)
      if (returned.condition === 'resalable') cost -= BigInt(restocked.value)
    }
  }
  const variance = amount(input.costVariancePiasters, 'costVariancePiasters', true)
  if (!variance.ok) return variance
  cost += BigInt(variance.value)
  const revenueResult = checked(revenue)
  const discountResult = checked(discount)
  const costResult = checked(cost)
  if (!revenueResult.ok) return revenueResult
  if (!discountResult.ok) return discountResult
  if (!costResult.ok) return costResult
  const profit = checked(revenue - cost)
  if (!profit.ok) return profit
  const margin = revenueResult.value > 0
    ? mulDivRoundHalfUp(profit.value, 10000, revenueResult.value)
    : ok(0)
  if (!margin.ok) return margin
  return ok({
    revenuePiasters: revenueResult.value,
    discountPiasters: discountResult.value,
    costPiasters: costResult.value,
    grossProfitPiasters: profit.value,
    marginBps: margin.value,
  })
}

export type StockValueRow = { productId: string; onHandQty: number; onHandValuePiasters: number }
export type StockValue = {
  totalValuePiasters: number
  breakdown: StockValueRow[]
  needsReview: string[]
}

export function calculateStockValue(rows: StockValueRow[]): Result<StockValue, DomainError> {
  let total = 0n
  const breakdown: StockValueRow[] = []
  const needsReview: string[] = []
  for (const row of rows) {
    const qty = safeInteger(row.onHandQty, 'onHandQty')
    const value = safeInteger(row.onHandValuePiasters, 'onHandValuePiasters')
    if (!qty.ok) return qty
    if (!value.ok) return value
    if (qty.value < 0 || value.value < 0 || (qty.value === 0 && value.value !== 0)) {
      needsReview.push(row.productId)
    }
    if (qty.value > 0 && value.value > 0) {
      breakdown.push(row)
      total += BigInt(value.value)
    }
  }
  const totalResult = checked(total)
  if (!totalResult.ok) return totalResult
  return ok({ totalValuePiasters: totalResult.value, breakdown, needsReview })
}
