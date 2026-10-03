import { safeInteger } from './integer'
import { err, ok, type DomainError, type Result } from './result'

type ShiftEntry = {
  shiftId: string | null
  method: string
  direction: 'in' | 'out'
  amountPiasters: number
}

function amount(value: number, field: string): Result<number, DomainError> {
  const result = safeInteger(value, field)
  if (!result.ok || result.value < 0) return err({ code: 'invalid_money', message: `${field} must be non-negative`, field })
  return ok(result.value)
}

function checked(value: bigint): Result<number, DomainError> {
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  if (value < -max || value > max) return err({ code: 'overflow', message: 'cash amount exceeds safe integer range' })
  return ok(Number(value))
}

export function calculateExpectedShiftCash(
  openingCashPiasters: number,
  shiftId: string,
  entries: ShiftEntry[],
): Result<{ expectedCashPiasters: number; cashIn: number; cashOut: number }, DomainError> {
  const opening = amount(openingCashPiasters, 'openingCashPiasters')
  if (!opening.ok) return opening
  if (typeof shiftId !== 'string' || shiftId.length === 0) return err({ code: 'invalid_shift_state', message: 'shiftId must be non-empty', field: 'shiftId' })
  let cashIn = 0n
  let cashOut = 0n
  for (const entry of entries) {
    const value = amount(entry.amountPiasters, 'amountPiasters')
    if (!value.ok) return value
    if (entry.method !== 'cash' || entry.shiftId !== shiftId) continue
    if (entry.direction === 'in') cashIn += BigInt(value.value)
    else if (entry.direction === 'out') cashOut += BigInt(value.value)
    else return err({ code: 'invalid_input', message: 'direction must be in or out', field: 'direction' })
  }
  const inResult = checked(cashIn)
  if (!inResult.ok) return inResult
  const outResult = checked(cashOut)
  if (!outResult.ok) return outResult
  const expected = checked(BigInt(opening.value) + cashIn - cashOut)
  if (!expected.ok) return expected
  return ok({ expectedCashPiasters: expected.value, cashIn: inResult.value, cashOut: outResult.value })
}

export function reconcileShiftCash(
  expectedCashPiasters: number,
  countedCashPiasters: number,
): Result<{ differencePiasters: number; status: 'balanced' | 'over' | 'short' }, DomainError> {
  const expected = safeInteger(expectedCashPiasters, 'expectedCashPiasters')
  const counted = amount(countedCashPiasters, 'countedCashPiasters')
  if (!expected.ok) return expected
  if (!counted.ok) return counted
  const difference = BigInt(counted.value) - BigInt(expected.value)
  const checkedDifference = checked(difference)
  if (!checkedDifference.ok) return checkedDifference
  return ok({
    differencePiasters: checkedDifference.value,
    status: checkedDifference.value === 0 ? 'balanced' : checkedDifference.value > 0 ? 'over' : 'short',
  })
}
