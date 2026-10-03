import { describe, expect, it } from 'vitest'
import { calculateExpectedShiftCash, reconcileShiftCash } from './shifts'

describe('shift cash', () => {
  it('counts only cash entries for the current shift', () => {
    expect(calculateExpectedShiftCash(10000, 's1', [
      { shiftId: 's1', method: 'cash', direction: 'in', amountPiasters: 5000 },
      { shiftId: 's1', method: 'cash', direction: 'out', amountPiasters: 2000 },
      { shiftId: 's1', method: 'card', direction: 'in', amountPiasters: 3000 },
      { shiftId: 's2', method: 'cash', direction: 'in', amountPiasters: 1000 },
      { shiftId: null, method: 'cash', direction: 'out', amountPiasters: 700 },
      { shiftId: 's1', method: 'cash', direction: 'out', amountPiasters: 5000 },
    ])).toEqual({ ok: true, value: { expectedCashPiasters: 8000, cashIn: 5000, cashOut: 7000 } })
  })

  it.each([
    [15000, 15000, 0, 'balanced'],
    [15000, 14000, -1000, 'short'],
    [15000, 16000, 1000, 'over'],
  ] as const)('reconciles cash', (expected, counted, difference, status) => {
    expect(reconcileShiftCash(expected, counted)).toEqual({ ok: true, value: { differencePiasters: difference, status } })
  })

  it('rejects negative counted cash', () => {
    expect(reconcileShiftCash(100, -1).ok).toBe(false)
  })
})
