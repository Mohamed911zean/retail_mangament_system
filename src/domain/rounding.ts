import { safeInteger } from './integer'
import { err, ok, type DomainError, type Result } from './result'

function validateInteger(
  value: unknown,
  label: string,
): Result<number, DomainError> {
  const result = safeInteger(value, label)
  if (!result.ok) {
    return err({
      code: label.includes('denominator') ? 'invalid_rate' : 'invalid_input',
      message: result.error.message,
      field: label,
    })
  }

  return result
}

function checkedBigInt(value: number, label: string): Result<bigint, DomainError> {
  const result = validateInteger(value, label)
  if (!result.ok) {
    return result
  }

  return ok(BigInt(result.value))
}

function toSafeNumber(value: bigint): Result<number, DomainError> {
  const maximum = BigInt(Number.MAX_SAFE_INTEGER)
  const minimum = -maximum

  if (value < minimum || value > maximum) {
    return err({
      code: 'overflow',
      message: 'rounded result exceeds the safe integer range',
    })
  }

  return ok(Number(value))
}

function roundAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const remainderMagnitude = remainder < 0n ? -remainder : remainder

  if (remainderMagnitude === 0n || remainderMagnitude * 2n < denominator) {
    return quotient
  }

  return quotient + (numerator < 0n ? -1n : 1n)
}

export function roundHalfUp(
  numerator: number,
  denominator: number,
): Result<number, DomainError> {
  const numeratorResult = checkedBigInt(numerator, 'numerator')
  if (!numeratorResult.ok) {
    return numeratorResult
  }

  const denominatorResult = checkedBigInt(denominator, 'denominator')
  if (!denominatorResult.ok) {
    return denominatorResult
  }

  if (denominatorResult.value <= 0n) {
    return err({
      code: 'invalid_rate',
      message: 'denominator must be a positive safe integer',
      field: 'denominator',
    })
  }

  return toSafeNumber(
    roundAwayFromZero(numeratorResult.value, denominatorResult.value),
  )
}

export function mulDivRoundHalfUp(
  a: number,
  b: number,
  c: number,
): Result<number, DomainError> {
  const aResult = checkedBigInt(a, 'a')
  if (!aResult.ok) {
    return aResult
  }

  const bResult = checkedBigInt(b, 'b')
  if (!bResult.ok) {
    return bResult
  }

  const cResult = checkedBigInt(c, 'denominator')
  if (!cResult.ok) {
    return cResult
  }

  if (cResult.value <= 0n) {
    return err({
      code: 'invalid_rate',
      message: 'denominator must be a positive safe integer',
      field: 'denominator',
    })
  }

  return toSafeNumber(
    roundAwayFromZero(aResult.value * bResult.value, cResult.value),
  )
}
