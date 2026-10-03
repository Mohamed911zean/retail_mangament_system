import { describe, expect, it } from 'vitest'
import { calculateTaxInclusiveBreakdown } from './tax'

describe('calculateTaxInclusiveBreakdown', () => {
  it.each([
    [11400, 1400, true, { net: 10000, tax: 1400 }],
    [1000, 1400, true, { net: 877, tax: 123 }],
    [5, 1400, true, { net: 4, tax: 1 }],
    [11400, 1400, false, { net: 11400, tax: 0 }],
    [11400, 0, true, { net: 11400, tax: 0 }],
  ])('calculates tax-inclusive breakdown', (amount, rate, enabled, expected) => {
    expect(calculateTaxInclusiveBreakdown(amount, rate, enabled)).toEqual({
      ok: true,
      value: expected,
    })
  })

  it.each([-1, 10001, 1.5])('rejects invalid tax rates %s', (rate) => {
    const result = calculateTaxInclusiveBreakdown(100, rate, true)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_rate')
    }
  })
})
