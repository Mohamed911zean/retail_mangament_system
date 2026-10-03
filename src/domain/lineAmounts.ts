import { allocateProportionally } from './allocation'
import {
  calculateDiscountAmount,
  type Discount,
} from './discount'
import { calculateLineSubtotal } from './pricing'
import { calculateTaxInclusiveBreakdown } from './tax'
import { err, ok, type DomainError, type Result } from './result'

export type LineInput = {
  unitPricePiasters: number
  qtyBase: number
  pricedUnitQtyBase: number
  lineDiscount?: Discount
  taxRateBps: number
}

export type LineAmount = {
  lineSubtotal: number
  lineDiscount: number
  invoiceDiscountAllocated: number
  finalLineTotal: number
  tax: number
  net: number
  taxRateBps: number
}

function sum(values: number[]): Result<number, DomainError> {
  let total = 0n
  for (const value of values) {
    total += BigInt(value)
  }

  const maximum = BigInt(Number.MAX_SAFE_INTEGER)
  if (total > maximum) {
    return err({
      code: 'overflow',
      message: 'sum exceeds the safe integer range',
    })
  }

  return ok(Number(total))
}

export function calculateLineAmounts(
  lines: LineInput[],
  invoiceDiscount: Discount,
  taxEnabled: boolean,
): Result<LineAmount[], DomainError> {
  const calculated = []
  for (const line of lines) {
    const subtotalResult = calculateLineSubtotal(
      line.unitPricePiasters,
      line.qtyBase,
      line.pricedUnitQtyBase,
    )
    if (!subtotalResult.ok) {
      return subtotalResult
    }

    const lineDiscountResult = line.lineDiscount
      ? calculateDiscountAmount(subtotalResult.value, line.lineDiscount)
      : ok(0)
    if (!lineDiscountResult.ok) {
      return lineDiscountResult
    }

    calculated.push({
      line,
      lineSubtotal: subtotalResult.value,
      lineDiscount: lineDiscountResult.value,
      afterLineDiscount: subtotalResult.value - lineDiscountResult.value,
    })
  }

  const afterDiscountSumResult = sum(
    calculated.map((line) => line.afterLineDiscount),
  )
  if (!afterDiscountSumResult.ok) {
    return afterDiscountSumResult
  }

  const invoiceDiscountResult = calculateDiscountAmount(
    afterDiscountSumResult.value,
    invoiceDiscount,
  )
  if (!invoiceDiscountResult.ok) {
    return invoiceDiscountResult
  }

  const allocationResult = allocateProportionally(
    invoiceDiscountResult.value,
    calculated.map((line) => line.afterLineDiscount),
  )
  if (!allocationResult.ok) {
    return allocationResult
  }

  const results: LineAmount[] = []
  for (let index = 0; index < calculated.length; index += 1) {
    const current = calculated[index]
    const invoiceDiscountAllocated = allocationResult.value[index]
    const finalLineTotal = current.afterLineDiscount - invoiceDiscountAllocated
    const taxResult = calculateTaxInclusiveBreakdown(
      finalLineTotal,
      current.line.taxRateBps,
      taxEnabled,
    )
    if (!taxResult.ok) {
      return taxResult
    }

    results.push({
      lineSubtotal: current.lineSubtotal,
      lineDiscount: current.lineDiscount,
      invoiceDiscountAllocated,
      finalLineTotal,
      tax: taxResult.value.tax,
      net: taxResult.value.net,
      taxRateBps: current.line.taxRateBps,
    })
  }

  return ok(results)
}
