import { describe, expect, it } from 'vitest'
import {
  calculateReturnRefund,
  calculateReturnStockValue,
  validateReturnQty,
} from './returns'

describe('return quantity and cumulative values', () => {
  it.each([
    [10, 0, 3, 7],
    [10, 4, 6, 0],
  ] as const)('validates return quantity', (original, already, requested, remainingAfter) => {
    expect(validateReturnQty(original, already, requested)).toEqual({ ok: true, value: { remainingAfter } })
  })

  it.each([
    [10, 4, 7],
    [10, 0, 0],
  ] as const)('rejects invalid return quantity', (original, already, requested) => {
    expect(validateReturnQty(original, already, requested).ok).toBe(false)
  })

  it.each([
    [1001, 1, 3, 0, 0, 334],
    [1001, 1, 3, 1, 334, 333],
    [1001, 1, 3, 2, 667, 334],
    [1001, 3, 3, 0, 0, 1001],
    [1001, 2, 3, 1, 334, 667],
  ] as const)('calculates cumulative refund', (line, returned, original, already, refunded, expected) => {
    expect(calculateReturnRefund(line, returned, original, already, refunded)).toEqual({ ok: true, value: expected })
  })

  it('rejects cumulative refund beyond the line', () => {
    expect(calculateReturnRefund(1001, 2, 3, 2, 667).ok).toBe(false)
  })

  it('allocates original cost cumulatively', () => {
    const first = calculateReturnStockValue(100, 1, 3, 0, 0)
    const second = calculateReturnStockValue(100, 1, 3, 1, 33)
    const third = calculateReturnStockValue(100, 1, 3, 2, 67)
    expect([first, second, third]).toEqual([
      { ok: true, value: 33 },
      { ok: true, value: 34 },
      { ok: true, value: 33 },
    ])
  })

  it('keeps random return splits exact', () => {
    let state = 0x10203040n
    const next = (max: number): number => {
      state = (state * 1664525n + 1013904223n) % 4294967296n
      return Number(state % BigInt(max))
    }
    for (let i = 0; i < 2000; i += 1) {
      const originalQty = next(30) + 1
      const lineTotal = next(100000)
      let alreadyQty = 0
      let refunded = 0
      while (alreadyQty < originalQty) {
        const requested = Math.min(next(originalQty - alreadyQty) + 1, originalQty - alreadyQty)
        const result = calculateReturnRefund(lineTotal, requested, originalQty, alreadyQty, refunded)
        expect(result.ok).toBe(true)
        if (!result.ok) break
        expect(result.value).toBeGreaterThanOrEqual(0)
        refunded += result.value
        alreadyQty += requested
        expect(refunded).toBeLessThanOrEqual(lineTotal)
      }
      expect(refunded).toBe(lineTotal)
    }
  })
})
