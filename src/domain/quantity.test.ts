import { describe, expect, it } from 'vitest'
import { convertUnitToBaseQty } from './quantity'

describe('convertUnitToBaseQty', () => {
  it('converts displayed packaging quantities to base units', () => {
    expect(convertUnitToBaseQty(2, 12)).toEqual({ ok: true, value: 24 })
  })

  it.each([
    [0, 12],
    [-1, 12],
    [2, 0],
    [2, -12],
    [1.5, 12],
  ])('rejects invalid quantity input %s, %s', (displayedQty, factor) => {
    const result = convertUnitToBaseQty(displayedQty, factor)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_quantity')
    }
  })

  it('rejects safe-integer overflow', () => {
    const result = convertUnitToBaseQty(Number.MAX_SAFE_INTEGER, 2)
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'overflow',
        message: 'base quantity exceeds the safe integer range',
      },
    })
  })
})
