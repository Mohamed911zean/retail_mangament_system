import { describe, expect, it } from 'vitest'
import {
  calculateIncomingValueAtAverage,
  calculateNegativeStockSettlement,
  calculateOnHand,
  calculateOutgoingCost,
} from './inventory'

describe('inventory valuation', () => {
  it('sums movements safely', () => {
    expect(calculateOnHand([{ qtyDelta: 3, valueDeltaPiasters: 300 }, { qtyDelta: -1, valueDeltaPiasters: -100 }])).toEqual({ ok: true, value: { qty: 2, value: 200 } })
  })

  it.each([
    [10, 1000, 10, 100, 1, 1000],
    [10, 1000, 4, 100, 1, 400],
    [3, 100, 1, 100, 1, 33],
    [3, 100, 2, 100, 1, 67],
    [5, 500, 8, 100, 1, 800],
    [0, 0, 3, 100, 1, 300],
    [-3, -300, 2, 100, 1, 200],
    [5, 0, 2, 100, 1, 200],
    [0, 0, 350, 11050, 1000, 3868],
  ] as const)('calculates outgoing cost', (qty, value, out, cost, unit, expected) => {
    expect(calculateOutgoingCost(qty, value, out, cost, unit)).toEqual({ ok: true, value: expected })
  })

  it('rejects non-positive outgoing quantity', () => {
    expect(calculateOutgoingCost(1, 1, 0, 1, 1).ok).toBe(false)
  })

  it.each([
    [10, 1000, 5, 100, 1, 500],
    [0, 0, 5, 100, 1, 500],
    [-3, -300, 2, 100, 1, 200],
  ] as const)('calculates incoming average value', (qty, value, input, cost, unit, expected) => {
    expect(calculateIncomingValueAtAverage(qty, value, input, cost, unit)).toEqual({ ok: true, value: expected })
  })

  it.each([
    [-3, -300, 3, 360, -60, 60, 0, 0],
    [-3, -300, 3, 240, 60, -60, 0, 0],
    [-3, -300, 10, 1200, -60, 60, 7, 840],
    [5, 500, 3, 360, 0, 0, 8, 860],
    [-5, -500, 3, 360, 0, 0, -2, -140],
    [0, 0, 3, 360, 0, 0, 3, 360],
  ] as const)('settles negative stock', (qty, value, input, incoming, revaluation, variance, resultingQty, resultingValue) => {
    expect(calculateNegativeStockSettlement(qty, value, input, incoming)).toEqual({
      ok: true, value: { revaluationPiasters: revaluation, costVariancePiasters: variance, resultingQty, resultingValue },
    })
  })

  it('preserves sequence invariants across seeded purchase and sale sequences', () => {
    let state = 0xabcdef01n
    const next = (max: number): number => {
      state = (state * 1664525n + 1013904223n) % 4294967296n
      return Number(state % BigInt(max))
    }
    for (let sequence = 0; sequence < 2000; sequence += 1) {
      let qty = 0
      let value = 0
      for (let operation = 0; operation < next(26) + 5; operation += 1) {
        if (next(2) === 0) {
          const incomingQty = next(20) + 1
          const incomingValue = incomingQty * (next(200) + 1)
          const settlement = calculateNegativeStockSettlement(qty, value, incomingQty, incomingValue)
          expect(settlement.ok).toBe(true)
          if (!settlement.ok) continue
          qty = settlement.value.resultingQty
          value = settlement.value.resultingValue
        } else {
          const outgoingQty = next(20) + 1
          const cost = calculateOutgoingCost(qty, value, outgoingQty, 100, 1)
          expect(cost.ok).toBe(true)
          if (!cost.ok) continue
          qty -= outgoingQty
          value -= cost.value
        }
        if (qty === 0) expect(value).toBe(0)
        if (qty >= 0) expect(value).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
