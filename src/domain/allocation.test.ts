import { describe, expect, it } from 'vitest'
import { allocateProportionally } from './allocation'

describe('allocateProportionally', () => {
  it.each([
    [100, [1, 1, 1], [34, 33, 33]],
    [10, [5, 3, 2], [5, 3, 2]],
    [7, [1, 2], [2, 5]],
    [1, [1, 1], [1, 0]],
    [2, [0, 5, 5], [0, 1, 1]],
    [0, [0, 0], [0, 0]],
  ])('allocates %s over %s', (total, weights, expected) => {
    expect(allocateProportionally(total, weights)).toEqual({
      ok: true,
      value: expected,
    })
  })

  it('rejects a positive total with no weight', () => {
    const result = allocateProportionally(5, [0, 0])
    expect(result.ok).toBe(false)
  })

  it('rejects negative or non-integer values', () => {
    expect(allocateProportionally(-1, [1]).ok).toBe(false)
    expect(allocateProportionally(1, [1.5]).ok).toBe(false)
  })

  it('preserves the total and caps allocations by weights when total is bounded', () => {
    const result = allocateProportionally(10, [5, 3, 2])
    expect(result).toEqual({ ok: true, value: [5, 3, 2] })
  })
})
