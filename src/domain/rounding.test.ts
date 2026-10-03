import { describe, expect, it } from 'vitest'
import { mulDivRoundHalfUp, roundHalfUp } from './rounding'

function expectValue(result: ReturnType<typeof mulDivRoundHalfUp>, value: number): void {
  expect(result).toEqual({ ok: true, value })
}

function expectError(
  result: ReturnType<typeof mulDivRoundHalfUp>,
  code: string,
): void {
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.error.code).toBe(code)
  }
}

function referenceRoundHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const remainderMagnitude = remainder < 0n ? -remainder : remainder

  if (remainderMagnitude === 0n || remainderMagnitude * 2n < denominator) {
    return quotient
  }

  return quotient + (numerator < 0n ? -1n : 1n)
}

describe('roundHalfUp', () => {
  it('rounds halves away from zero', () => {
    expect(roundHalfUp(5, 2)).toEqual({ ok: true, value: 3 })
    expect(roundHalfUp(-5, 2)).toEqual({ ok: true, value: -3 })
    expect(roundHalfUp(4, 2)).toEqual({ ok: true, value: 2 })
  })

  it('rejects a non-positive denominator', () => {
    expectError(roundHalfUp(1, 0), 'invalid_rate')
    expectError(roundHalfUp(1, -1), 'invalid_rate')
  })
})

describe('mulDivRoundHalfUp', () => {
  it('calculates weighted quantities without floating point arithmetic', () => {
    expectValue(mulDivRoundHalfUp(12000, 350, 1000), 4200)
    expectValue(mulDivRoundHalfUp(12, 5, 1), 60)
    expectValue(mulDivRoundHalfUp(12, 10, 3), 40)
    expectValue(mulDivRoundHalfUp(5, 1, 2), 3)
    expectValue(mulDivRoundHalfUp(-5, 1, 2), -3)
  })

  it.each([
    [0, 1, 0],
    [1, 1, -1],
  ])('rejects denominator %s', (a, b, c) => {
    expectError(mulDivRoundHalfUp(a, b, c), 'invalid_rate')
  })

  it('rejects non-integer and unsafe inputs', () => {
    expectError(mulDivRoundHalfUp(1.5, 1, 1), 'invalid_input')
    expectError(mulDivRoundHalfUp(Number.MAX_SAFE_INTEGER + 1, 1, 1), 'invalid_input')
  })

  it('handles an unsafe intermediate product when the result is safe', () => {
    expectValue(
      mulDivRoundHalfUp(Number.MAX_SAFE_INTEGER, 1000, 1000),
      Number.MAX_SAFE_INTEGER,
    )
  })

  it('returns overflow when the final result is unsafe', () => {
    expectError(
      mulDivRoundHalfUp(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1),
      'overflow',
    )
  })

  it('matches a seeded BigInt reference across thousands of cases', () => {
    let state = 0x13579bdfn

    function next(): bigint {
      state = (state * 1664525n + 1013904223n) % 4294967296n
      return state
    }

    for (let index = 0; index < 3000; index += 1) {
      const a = Number(next() % 2000001n) - 1000000
      const b = Number(next() % 2000001n) - 1000000
      const c = Number(next() % 10000n) + 1
      const expected = referenceRoundHalfAwayFromZero(
        BigInt(a) * BigInt(b),
        BigInt(c),
      )

      expectValue(mulDivRoundHalfUp(a, b, c), Number(expected))
    }
  })
})
