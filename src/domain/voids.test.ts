import { describe, expect, it } from 'vitest'
import { calculateVoidCompensation } from './voids'

const base = {
  documentType: 'sale' as const,
  documentStatus: 'completed' as const,
  hasCompletedReturns: false,
  stockMovements: [],
  moneyEntries: [],
  currentOpenShiftId: 's2',
  shiftsEnabled: true,
  allowNegativeStock: false,
  onHandQtyByProduct: {},
}

describe('calculateVoidCompensation', () => {
  it('compensates sale stock and money in the current shift', () => {
    expect(calculateVoidCompensation({
      ...base,
      stockMovements: [{ id: 'm1', productId: 'p1', batchId: null, movementType: 'sale', qtyDelta: -2, valueDeltaPiasters: -200 }],
      moneyEntries: [{ id: 'e1', entryType: 'sale', method: 'cash', direction: 'in', amountPiasters: 1000 }],
    })).toEqual({
      ok: true,
      value: {
        stockCompensations: [{ reversesMovementId: 'm1', productId: 'p1', batchId: null, qtyDelta: 2, valueDeltaPiasters: 200 }],
        moneyCompensations: [{ reversesEntryId: 'e1', method: 'cash', direction: 'out', amountPiasters: 1000, shiftId: 's2' }],
        createsNegativeStock: false,
      },
    })
  })

  it('handles credit sales and multiple tenders', () => {
    expect(calculateVoidCompensation({ ...base, moneyEntries: [] })).toEqual({ ok: true, value: { stockCompensations: [], moneyCompensations: [], createsNegativeStock: false } })
    expect(calculateVoidCompensation({
      ...base,
      moneyEntries: [
        { id: 'e1', entryType: 'sale', method: 'card', direction: 'in', amountPiasters: 600 },
        { id: 'e2', entryType: 'sale', method: 'cash', direction: 'in', amountPiasters: 400 },
      ],
    })).toEqual({
      ok: true,
      value: {
        stockCompensations: [],
        moneyCompensations: [
          { reversesEntryId: 'e1', method: 'card', direction: 'out', amountPiasters: 600, shiftId: 's2' },
          { reversesEntryId: 'e2', method: 'cash', direction: 'out', amountPiasters: 400, shiftId: 's2' },
        ],
        createsNegativeStock: false,
      },
    })
  })

  it('enforces status, returns, and shift precedence', () => {
    expect(calculateVoidCompensation({ ...base, documentStatus: 'voided', hasCompletedReturns: true }).error?.code).toBe('document_already_voided')
    expect(calculateVoidCompensation({ ...base, hasCompletedReturns: true }).error?.code).toBe('void_blocked_by_returns')
    expect(calculateVoidCompensation({ ...base, currentOpenShiftId: null }).error?.code).toBe('invalid_shift_state')
    expect(calculateVoidCompensation({ ...base, shiftsEnabled: false, currentOpenShiftId: null })).toEqual({ ok: true, value: { stockCompensations: [], moneyCompensations: [], createsNegativeStock: false } })
  })

  it('reverses purchase revaluation and enforces stock policy', () => {
    const input = {
      ...base,
      documentType: 'purchase' as const,
      stockMovements: [
        { id: 'm1', productId: 'p1', batchId: 'b1', movementType: 'purchase', qtyDelta: 10, valueDeltaPiasters: 1200 },
        { id: 'm2', productId: 'p1', batchId: null, movementType: 'revaluation', qtyDelta: 0, valueDeltaPiasters: -60 },
      ],
      onHandQtyByProduct: { p1: 10 },
    }
    expect(calculateVoidCompensation(input)).toEqual({
      ok: true,
      value: {
        stockCompensations: [
          { reversesMovementId: 'm1', productId: 'p1', batchId: 'b1', qtyDelta: -10, valueDeltaPiasters: -1200 },
          { reversesMovementId: 'm2', productId: 'p1', batchId: null, qtyDelta: 0, valueDeltaPiasters: 60 },
        ],
        moneyCompensations: [],
        createsNegativeStock: false,
      },
    })
    expect(calculateVoidCompensation({ ...input, onHandQtyByProduct: { p1: 3 } }).error?.code).toBe('insufficient_stock')
    expect(calculateVoidCompensation({ ...input, onHandQtyByProduct: { p1: 3 }, allowNegativeStock: true }).value?.createsNegativeStock).toBe(true)
  })

  it('compensates expenses and clears shift when shifts are disabled', () => {
    expect(calculateVoidCompensation({
      ...base,
      documentType: 'expense',
      shiftsEnabled: false,
      currentOpenShiftId: null,
      moneyEntries: [{ id: 'e1', entryType: 'expense', method: 'cash', direction: 'out', amountPiasters: 500 }],
    }).value).toEqual({
      stockCompensations: [],
      moneyCompensations: [{ reversesEntryId: 'e1', method: 'cash', direction: 'in', amountPiasters: 500, shiftId: null }],
      createsNegativeStock: false,
    })
  })
})
