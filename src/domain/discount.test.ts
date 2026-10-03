import { describe, expect, it } from 'vitest'
import {
  calculateDiscountAmount,
  type Discount,
} from './discount'

const validCases: Array<[number, Discount, number]> = [
  [1005, { kind: 'percentage', rateBps: 1000 }, 101],
  [1004, { kind: 'percentage', rateBps: 1000 }, 100],
  [1005, { kind: 'percentage', rateBps: 10000 }, 1005],
  [1005, { kind: 'fixed', amountPiasters: 1200 }, 1005],
]

const invalidCases: Array<[number, Discount]> = [
  [-1, { kind: 'fixed', amountPiasters: 1 }],
  [100, { kind: 'fixed', amountPiasters: -1 }],
  [100, { kind: 'percentage', rateBps: -1 }],
  [100, { kind: 'percentage', rateBps: 10001 }],
  [100, { kind: 'percentage', rateBps: 1.5 }],
]

describe('calculateDiscountAmount', () => {
  it.each(validCases)('calculates and caps discounts', (base, discount, expected) => {
    expect(calculateDiscountAmount(base, discount)).toEqual({
      ok: true,
      value: expected,
    })
  })

  it.each(invalidCases)('rejects invalid discount input', (base, discount) => {
    const result = calculateDiscountAmount(base, discount)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toMatch(/invalid_(money|discount)/)
    }
  })
})
