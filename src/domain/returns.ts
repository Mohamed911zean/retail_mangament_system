import { safeInteger } from './integer'
import { mulDivRoundHalfUp } from './rounding'
import { err, ok, type DomainError, type Result } from './result'

function amount(value: number, field: string): Result<number, DomainError> {
  const result = safeInteger(value, field)
  if (!result.ok || result.value < 0) {
    return err({ code: 'invalid_money', message: `${field} must be non-negative`, field })
  }
  return ok(result.value)
}

function quantity(value: number, field: string): Result<number, DomainError> {
  const result = safeInteger(value, field)
  if (!result.ok || result.value < 0) {
    return err({ code: 'invalid_quantity', message: `${field} must be non-negative`, field })
  }
  return ok(result.value)
}

export function validateReturnQty(
  originalQty: number,
  alreadyReturnedQty: number,
  requestedQty: number,
): Result<{ remainingAfter: number }, DomainError> {
  const original = quantity(originalQty, 'originalQty')
  const already = quantity(alreadyReturnedQty, 'alreadyReturnedQty')
  const requested = quantity(requestedQty, 'requestedQty')
  if (!original.ok) return original
  if (!already.ok) return already
  if (!requested.ok) return requested
  if (requested.value === 0 || already.value > original.value || requested.value > original.value - already.value) {
    return err({ code: 'return_exceeds_original', message: 'requested return exceeds original quantity' })
  }
  return ok({ remainingAfter: original.value - already.value - requested.value })
}

function cumulativeValue(
  lineAmount: number,
  returnedQty: number,
  originalQty: number,
  alreadyReturnedQty: number,
  alreadyValue: number,
): Result<number, DomainError> {
  const line = amount(lineAmount, 'lineAmount')
  const original = quantity(originalQty, 'originalQty')
  const already = quantity(alreadyReturnedQty, 'alreadyReturnedQty')
  const returned = quantity(returnedQty, 'returnedQty')
  const previous = amount(alreadyValue, 'alreadyValue')
  if (!line.ok) return line
  if (!original.ok) return original
  if (!already.ok) return already
  if (!returned.ok) return returned
  if (!previous.ok) return previous
  if (original.value === 0 || already.value + returned.value > original.value) {
    return err({ code: 'return_exceeds_original', message: 'return exceeds original quantity' })
  }
  const target = mulDivRoundHalfUp(
    line.value,
    already.value + returned.value,
    original.value,
  )
  if (!target.ok) return target
  const current = target.value - previous.value
  if (current < 0) {
    return err({ code: 'return_exceeds_original', message: 'cumulative return value exceeds line value' })
  }
  return ok(current)
}

export function calculateReturnRefund(
  finalLineTotalPiasters: number,
  returnedQty: number,
  originalQty: number,
  alreadyReturnedQty: number,
  refundedSoFarPiasters: number,
): Result<number, DomainError> {
  return cumulativeValue(
    finalLineTotalPiasters,
    returnedQty,
    originalQty,
    alreadyReturnedQty,
    refundedSoFarPiasters,
  )
}

export function calculateReturnStockValue(
  originalLineCostPiasters: number,
  returnedQty: number,
  originalQty: number,
  alreadyReturnedQty: number,
  alreadyRestockedValuePiasters: number,
): Result<number, DomainError> {
  return cumulativeValue(
    originalLineCostPiasters,
    returnedQty,
    originalQty,
    alreadyReturnedQty,
    alreadyRestockedValuePiasters,
  )
}
