import { safeInteger } from './integer'
import { mulDivRoundHalfUp, roundHalfUp } from './rounding'
import { err, ok, type DomainError, type Result } from './result'

export type CashRounding = {
  roundedTotal: number
  adjustment: number
}

export function roundCashTotal(
  total: number,
  step: number,
): Result<CashRounding, DomainError> {
  const totalResult = safeInteger(total, 'total')
  if (!totalResult.ok || totalResult.value < 0) {
    return err({
      code: 'invalid_money',
      message: 'total must be a non-negative safe integer',
      field: 'total',
    })
  }

  const stepResult = safeInteger(step, 'step')
  if (!stepResult.ok || stepResult.value < 0) {
    return err({
      code: 'invalid_money',
      message: 'step must be a non-negative safe integer',
      field: 'step',
    })
  }

  if (stepResult.value === 0 || totalResult.value === 0) {
    return ok({ roundedTotal: totalResult.value, adjustment: 0 })
  }

  const quotientResult = roundHalfUp(totalResult.value, stepResult.value)
  if (!quotientResult.ok) {
    return quotientResult
  }

  const quotient = quotientResult.value === 0 ? 1 : quotientResult.value
  const roundedResult = mulDivRoundHalfUp(quotient, stepResult.value, 1)
  if (!roundedResult.ok) {
    return roundedResult
  }

  return ok({
    roundedTotal: roundedResult.value,
    adjustment: roundedResult.value - totalResult.value,
  })
}
