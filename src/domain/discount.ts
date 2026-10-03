import { safeInteger } from './integer'
import { mulDivRoundHalfUp } from './rounding'
import { err, ok, type DomainError, type Result } from './result'

export type Discount =
  | { kind: 'fixed'; amountPiasters: number }
  | { kind: 'percentage'; rateBps: number }

export function calculateDiscountAmount(
  basePiasters: number,
  discount: Discount,
): Result<number, DomainError> {
  const baseResult = safeInteger(basePiasters, 'basePiasters')
  if (!baseResult.ok || baseResult.value < 0) {
    return err({
      code: 'invalid_money',
      message: 'basePiasters must be a non-negative safe integer',
      field: 'basePiasters',
    })
  }

  let amount: number
  if (discount.kind === 'fixed') {
    const fixedResult = safeInteger(discount.amountPiasters, 'amountPiasters')
    if (!fixedResult.ok || fixedResult.value < 0) {
      return err({
        code: 'invalid_discount',
        message: 'fixed discount must be a non-negative safe integer',
        field: 'amountPiasters',
      })
    }
    amount = fixedResult.value
  } else if (discount.kind === 'percentage') {
    const rateResult = safeInteger(discount.rateBps, 'rateBps')
    if (!rateResult.ok || rateResult.value < 0 || rateResult.value > 10000) {
      return err({
        code: 'invalid_discount',
        message: 'discount rate must be an integer from 0 to 10000',
        field: 'rateBps',
      })
    }

    const percentageResult = mulDivRoundHalfUp(
      baseResult.value,
      rateResult.value,
      10000,
    )
    if (!percentageResult.ok) {
      return percentageResult
    }
    amount = percentageResult.value
  } else {
    return err({
      code: 'invalid_discount',
      message: 'discount kind is invalid',
      field: 'kind',
    })
  }

  return ok(amount > baseResult.value ? baseResult.value : amount)
}
