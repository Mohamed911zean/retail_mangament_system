import { roundCashTotal } from './cashRounding'
import type { LineAmount } from './lineAmounts'
import { err, ok, type DomainError, type Result } from './result'

export type SaleTotals = {
  subtotal: number
  lineDiscount: number
  invoiceDiscount: number
  tax: number
  preRoundTotal: number
  roundingAdjustment: number
  total: number
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
      message: 'sale total exceeds the safe integer range',
    })
  }

  return ok(Number(total))
}

export function calculateSaleTotals(
  lineResults: LineAmount[],
  cashRoundingStep: number,
): Result<SaleTotals, DomainError> {
  const subtotalResult = sum(lineResults.map((line) => line.lineSubtotal))
  if (!subtotalResult.ok) return subtotalResult
  const lineDiscountResult = sum(
    lineResults.map((line) => line.lineDiscount),
  )
  if (!lineDiscountResult.ok) return lineDiscountResult
  const invoiceDiscountResult = sum(
    lineResults.map((line) => line.invoiceDiscountAllocated),
  )
  if (!invoiceDiscountResult.ok) return invoiceDiscountResult
  const taxResult = sum(lineResults.map((line) => line.tax))
  if (!taxResult.ok) return taxResult
  const preRoundTotalResult = sum(
    lineResults.map((line) => line.finalLineTotal),
  )
  if (!preRoundTotalResult.ok) return preRoundTotalResult

  const roundingResult = roundCashTotal(
    preRoundTotalResult.value,
    cashRoundingStep,
  )
  if (!roundingResult.ok) return roundingResult

  const total = BigInt(preRoundTotalResult.value) +
    BigInt(roundingResult.value.adjustment)
  const maximum = BigInt(Number.MAX_SAFE_INTEGER)
  const minimum = -maximum
  if (total < minimum || total > maximum) {
    return err({
      code: 'overflow',
      message: 'sale total exceeds the safe integer range',
    })
  }

  return ok({
    subtotal: subtotalResult.value,
    lineDiscount: lineDiscountResult.value,
    invoiceDiscount: invoiceDiscountResult.value,
    tax: taxResult.value,
    preRoundTotal: preRoundTotalResult.value,
    roundingAdjustment: roundingResult.value.adjustment,
    total: Number(total),
  })
}
