import { describe, expect, it } from 'vitest'
import { roundCashTotal } from './cashRounding'

describe('roundCashTotal', () => {
  it.each([
    [1012, 25, { roundedTotal: 1000, adjustment: -12 }],
    [1013, 25, { roundedTotal: 1025, adjustment: 12 }],
    [1000, 25, { roundedTotal: 1000, adjustment: 0 }],
    [25, 50, { roundedTotal: 50, adjustment: 25 }],
    [10, 50, { roundedTotal: 50, adjustment: 40 }],
    [0, 50, { roundedTotal: 0, adjustment: 0 }],
    [1013, 0, { roundedTotal: 1013, adjustment: 0 }],
  ])('rounds total %s with step %s', (total, step, expected) => {
    expect(roundCashTotal(total, step)).toEqual({ ok: true, value: expected })
  })

  it.each([
    [-1, 25],
    [1.5, 25],
    [10, -1],
    [10, 1.5],
  ])('rejects invalid cash rounding input', (total, step) => {
    expect(roundCashTotal(total, step).ok).toBe(false)
  })
})
