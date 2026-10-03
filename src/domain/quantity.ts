import { safeInteger } from './integer'
import { err, ok, type DomainError, type Result } from './result'

export function convertUnitToBaseQty(
  displayedQty: number,
  baseQtyPerUnit: number,
): Result<number, DomainError> {
  const displayedResult = safeInteger(displayedQty, 'displayedQty')
  if (!displayedResult.ok || displayedResult.value <= 0) {
    return err({
      code: 'invalid_quantity',
      message: 'displayedQty must be a positive safe integer',
      field: 'displayedQty',
    })
  }

  const factorResult = safeInteger(baseQtyPerUnit, 'baseQtyPerUnit')
  if (!factorResult.ok || factorResult.value <= 0) {
    return err({
      code: 'invalid_quantity',
      message: 'baseQtyPerUnit must be a positive safe integer',
      field: 'baseQtyPerUnit',
    })
  }

  const result = BigInt(displayedResult.value) * BigInt(factorResult.value)
  const maximum = BigInt(Number.MAX_SAFE_INTEGER)
  if (result > maximum) {
    return err({
      code: 'overflow',
      message: 'base quantity exceeds the safe integer range',
    })
  }

  return ok(Number(result))
}
