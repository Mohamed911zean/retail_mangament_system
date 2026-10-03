import { describe, expect, it } from 'vitest'
import {
  calculateIncomingValueAtAverage,
  calculateNegativeStockSettlement,
  calculateOnHand,
  calculateOutgoingCost,
  calculateStockNormalization,
} from './inventory'

describe('inventory valuation', () => {
  it('sums movements safely', () => {
    expect(calculateOnHand([
      { qtyDelta: 3, valueDeltaPiasters: 300 },
      { qtyDelta: -1, valueDeltaPiasters: -100 },
    ])).toEqual({ ok: true, value: { qty: 2, value: 200 } })
  })

  it.each([
    [10, 1000, 10, 100, 1, 1000],
    [10, 1000, 4, 100, 1, 400],
    [3, 100, 1, 100, 1, 33],
    [3, 100, 2, 100, 1, 67],
    [5, 500, 8, 100, 1, 800],
    [0, 0, 3, 100, 1, 300],
    [-3, -300, 2, 100, 1, 200],
    [5, 0, 2, 100, 1, 0],
    [5, 0, 5, 100, 1, 0],
    [5, 0, 8, 100, 1, 300],
    [0, 0, 350, 11050, 1000, 3868],
  ] as const)('calculates outgoing cost', (qty, value, out, cost, unit, expected) => {
    expect(calculateOutgoingCost(qty, value, out, cost, unit)).toEqual({
      ok: true,
      value: expected,
    })
  })

  it('rejects invalid outgoing quantity and positive-quantity negative value', () => {
    expect(calculateOutgoingCost(1, 1, 0, 1, 1).ok).toBe(false)
    expect(calculateOutgoingCost(5, -10, 2, 100, 1)).toEqual({
      ok: false,
      error: {
        code: 'ledger_invariant_violation',
        message: 'positive on-hand quantity cannot have negative value',
        field: 'onHandValue',
      },
    })
  })

  it.each([
    [10, 1000, 5, 100, 1, 500],
    [0, 0, 5, 100, 1, 500],
    [-3, -300, 2, 100, 1, 200],
    [5, 0, 2, 100, 1, 0],
  ] as const)('calculates incoming average value', (qty, value, input, cost, unit, expected) => {
    expect(calculateIncomingValueAtAverage(qty, value, input, cost, unit)).toEqual({
      ok: true,
      value: expected,
    })
  })

  it('rejects incoming average valuation for a positive quantity with negative value', () => {
    expect(calculateIncomingValueAtAverage(5, -10, 2, 100, 1)).toEqual({
      ok: false,
      error: {
        code: 'ledger_invariant_violation',
        message: 'positive on-hand quantity cannot have negative value',
        field: 'onHandValue',
      },
    })
  })

  it.each([
    [0, 60, -60],
    [0, -250, 250],
    [5, -40, 40],
    [5, 0, 0],
    [-3, -300, 0],
    [7, 840, 0],
    [0, 0, 0],
  ] as const)('normalizes stock values', (qty, value, revaluationPiasters) => {
    expect(calculateStockNormalization(qty, value)).toEqual({
      ok: true,
      value: { revaluationPiasters },
    })
  })

  it.each([
    [-3, -300, 3, 360, -60, 60, 0, 0],
    [-3, -300, 3, 240, 60, -60, 0, 0],
    [-3, -300, 10, 1200, -60, 60, 7, 840],
    [5, 500, 3, 360, 0, 0, 8, 860],
    [-5, -500, 3, 360, 0, 0, -2, -140],
    [0, 0, 3, 360, 0, 0, 3, 360],
  ] as const)('settles negative stock', (
    qty,
    value,
    input,
    incoming,
    revaluation,
    variance,
    resultingQty,
    resultingValue,
  ) => {
    expect(calculateNegativeStockSettlement(qty, value, input, incoming)).toEqual({
      ok: true,
      value: {
        revaluationPiasters: revaluation,
        costVariancePiasters: variance,
        resultingQty,
        resultingValue,
      },
    })
  })

  it('normalizes a voided purchase after a weighted sale', () => {
    expect(calculateNegativeStockSettlement(5, 500, 5, 1000)).toEqual({
      ok: true,
      value: {
        revaluationPiasters: 0,
        costVariancePiasters: 0,
        resultingQty: 10,
        resultingValue: 1500,
      },
    })
    expect(calculateOutgoingCost(10, 1500, 5, 100, 1)).toEqual({
      ok: true,
      value: 750,
    })
    expect(calculateStockNormalization(0, -250)).toEqual({
      ok: true,
      value: { revaluationPiasters: 250 },
    })
  })

  it('preserves invariants across seeded mixed stock operations', () => {
    let state = 0xabcdef01n
    const next = (max: number): number => {
      state = (state * 1664525n + 1013904223n) % 4294967296n
      return Number(state % BigInt(max))
    }

    for (let sequence = 0; sequence < 2000; sequence += 1) {
      let qty = 0
      let value = 0
      const purchases: { qtyDelta: number; valueDeltaPiasters: number; voided: boolean }[] = []
      const revaluationRows: { qtyDelta: number; valueDeltaPiasters: number }[] = []

      for (let operation = 0; operation < next(36) + 5; operation += 1) {
        const kind = next(7)
        if (kind === 0 || kind === 3 || kind === 5) {
          const incomingQty = next(20) + 1
          const incomingValue = next(2) === 0 ? 0 : incomingQty * next(200)
          const previousQty = qty
          const settlement = calculateNegativeStockSettlement(
            qty,
            value,
            incomingQty,
            incomingValue,
          )
          expect(settlement.ok).toBe(true)
          if (!settlement.ok) continue
          purchases.push({
            qtyDelta: incomingQty,
            valueDeltaPiasters: incomingValue,
            voided: false,
          })
          qty = settlement.value.resultingQty
          value = settlement.value.resultingValue
          if (previousQty < 0 && qty >= 0) {
            revaluationRows.push({
              qtyDelta: 0,
              valueDeltaPiasters: settlement.value.revaluationPiasters,
            })
          }
        } else if (kind === 1 || kind === 2 || kind === 4) {
          const outgoingQty = next(20) + 1
          const cost = calculateOutgoingCost(qty, value, outgoingQty, 100, 1)
          expect(cost.ok).toBe(true)
          if (!cost.ok) continue
          qty -= outgoingQty
          value -= cost.value
        } else {
          let purchaseIndex = -1
          for (let index = purchases.length - 1; index >= 0; index -= 1) {
            if (!purchases[index].voided) {
              purchaseIndex = index
              break
            }
          }
          if (purchaseIndex < 0) continue
          const purchase = purchases[purchaseIndex]
          purchase.voided = true
          qty -= purchase.qtyDelta
          value -= purchase.valueDeltaPiasters
        }

        const normalization = calculateStockNormalization(qty, value)
        expect(normalization.ok).toBe(true)
        if (!normalization.ok) continue
        if (normalization.value.revaluationPiasters !== 0) {
          revaluationRows.push({
            qtyDelta: 0,
            valueDeltaPiasters: normalization.value.revaluationPiasters,
          })
          value += normalization.value.revaluationPiasters
        }

        expect(revaluationRows.every((row) => row.qtyDelta === 0)).toBe(true)
        if (qty === 0) expect(value).toBe(0)
        if (qty > 0) expect(value).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
