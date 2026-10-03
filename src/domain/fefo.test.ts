import { describe, expect, it } from 'vitest'
import { allocateCostAcrossBatches, allocateFefoBatches } from './fefo'

const batches = [
  { id: 'A', qtyAvailable: 3, expiryAt: 100, receivedAt: 1 },
  { id: 'B', qtyAvailable: 10, expiryAt: 200, receivedAt: 2 },
]

describe('allocateFefoBatches', () => {
  it('allocates by expiry and reports shortfall', () => {
    expect(allocateFefoBatches(5, batches, 50, false)).toEqual({
      ok: true, value: { allocations: [{ batchId: 'A', qty: 3 }, { batchId: 'B', qty: 2 }], shortfallQty: 0 },
    })
    expect(allocateFefoBatches(15, batches, 50, false)).toEqual({
      ok: true, value: { allocations: [{ batchId: 'A', qty: 3 }, { batchId: 'B', qty: 10 }], shortfallQty: 2 },
    })
  })

  it('filters expired batches unless overridden', () => {
    const expired = [{ id: 'A', qtyAvailable: 3, expiryAt: 40, receivedAt: 1 }, batches[1]]
    expect(allocateFefoBatches(5, expired, 50, false)).toEqual({
      ok: true, value: { allocations: [{ batchId: 'B', qty: 5 }], shortfallQty: 0 },
    })
    expect(allocateFefoBatches(5, expired, 50, true)).toEqual({
      ok: true, value: { allocations: [{ batchId: 'A', qty: 3 }, { batchId: 'B', qty: 2 }], shortfallQty: 0 },
    })
  })

  it('uses received time, id, and null expiry as stable tie breakers', () => {
    const tied = [
      { id: 'B', qtyAvailable: 1, expiryAt: 100, receivedAt: 2 },
      { id: 'A', qtyAvailable: 1, expiryAt: 100, receivedAt: 2 },
      { id: 'Z', qtyAvailable: 1, expiryAt: null, receivedAt: 0 },
    ]
    expect(allocateFefoBatches(3, tied, 50, false)).toEqual({
      ok: true, value: { allocations: [{ batchId: 'A', qty: 1 }, { batchId: 'B', qty: 1 }, { batchId: 'Z', qty: 1 }], shortfallQty: 0 },
    })
    expect(allocateFefoBatches(0, tied, 50, false)).toEqual({ ok: true, value: { allocations: [], shortfallQty: 0 } })
    expect(allocateFefoBatches(-1, tied, 50, false).ok).toBe(false)
  })
})

describe('allocateCostAcrossBatches', () => {
  it.each([
    [1000, [{ batchId: 'A', qty: 3 }, { batchId: 'B', qty: 2 }], [600, 400]],
    [100, [{ batchId: 'A', qty: 1 }, { batchId: 'B', qty: 1 }, { batchId: 'C', qty: 1 }], [34, 33, 33]],
  ] as const)('allocates exact batch costs', (cost, allocations, expected) => {
    expect(allocateCostAcrossBatches(cost, allocations)).toEqual({ ok: true, value: expected })
  })
})
