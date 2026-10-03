import { safeInteger } from './integer'
import { mulDivRoundHalfUp } from './rounding'
import { err, ok, type DomainError, type Result } from './result'

export type TaxBreakdown = {
  net: number
  tax: number
}

export function calculateTaxInclusiveBreakdown(
  finalLineAmount: number,
  taxRateBps: number,
  enabled: boolean,
): Result<TaxBreakdown, DomainError> {
  const amountResult = safeInteger(finalLineAmount, 'finalLineAmount')
  if (!amountResult.ok || amountResult.value < 0) {
    return err({
      code: 'invalid_money',
      message: 'finalLineAmount must be a non-negative safe integer',
      field: 'finalLineAmount',
    })
  }

  const rateResult = safeInteger(taxRateBps, 'taxRateBps')
  if (!rateResult.ok || rateResult.value < 0 || rateResult.value > 10000) {
    return err({
      code: 'invalid_rate',
      message: 'taxRateBps must be an integer from 0 to 10000',
      field: 'taxRateBps',
    })
  }

  if (!enabled || rateResult.value === 0) {
    return ok({ net: amountResult.value, tax: 0 })
  }

  const netResult = mulDivRoundHalfUp(
    amountResult.value,
    10000,
    10000 + rateResult.value,
  )
  if (!netResult.ok) {
    return netResult
  }

  return ok({
    net: netResult.value,
    tax: amountResult.value - netResult.value,
  })
}
