import { describe, expect, it } from 'vitest'
import { calculateLineSubtotal } from './pricing'

describe('calculateLineSubtotal', () => {
  it.each([
    [12000, 350, 1000, 4200],
    [12000, 1, 1000, 12],
    [11050, 1, 1000, 11],
    [24000, 12, 12, 24000],
    [24000, 6, 12, 12000],
    [0, 500, 1000, 0],
  ])('calculates subtotal for %s, %s, %s', (price, quantity, pricedUnit, expected) => {
    expect(calculateLineSubtotal(price, quantity, pricedUnit)).toEqual({
      ok: true,
      value: expected,
    })
  })

  it.each([
    [-1, 1, 1],
    [1, 0, 1],
    [1, -1, 1],
    [1, 1, 0],
    [1, 1, -1],
    [1.5, 1, 1],
  ])('rejects invalid pricing input %s, %s, %s', (price, quantity, pricedUnit) => {
    expect(calculateLineSubtotal(price, quantity, pricedUnit).ok).toBe(false)
  })
})
