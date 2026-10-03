import { describe, expect, it } from 'vitest'
import { safeInteger } from './integer'

describe('safeInteger', () => {
  it('accepts safe integer numbers', () => {
    expect(safeInteger(0, 'amount')).toEqual({ ok: true, value: 0 })
    expect(safeInteger(Number.MAX_SAFE_INTEGER, 'amount')).toEqual({
      ok: true,
      value: Number.MAX_SAFE_INTEGER,
    })
  })

  it.each([
    ['text', 'amount'],
    [Number.NaN, 'amount'],
    [Number.POSITIVE_INFINITY, 'amount'],
    [1.5, 'amount'],
    [Number.MAX_SAFE_INTEGER + 1, 'amount'],
  ])('rejects %s', (value, label) => {
    const result = safeInteger(value, label)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_input')
      expect(result.error.field).toBe(label)
    }
  })
})
