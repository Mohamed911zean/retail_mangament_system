import { describe, expect, it } from 'vitest'
import { calculateProfitSummary, calculateStockValue } from './reports'

describe('calculateProfitSummary', () => {
  it('calculates completed sales and returns', () => {
    expect(calculateProfitSummary({
      saleLines: [{ status: 'completed', finalLineTotalPiasters: 10000, discountPiasters: 500, lineCostPiasters: 6000 }],
      returns: [],
      costVariancePiasters: 0,
    })).toEqual({ ok: true, value: { revenuePiasters: 10000, discountPiasters: 500, costPiasters: 6000, grossProfitPiasters: 4000, marginBps: 4000 } })
    expect(calculateProfitSummary({
      saleLines: [{ status: 'completed', finalLineTotalPiasters: 10000, discountPiasters: 500, lineCostPiasters: 6000 }],
      returns: [{ status: 'completed', refundPiasters: 2000, condition: 'resalable', restockedValuePiasters: 1200 }],
      costVariancePiasters: 0,
    })).toEqual({ ok: true, value: { revenuePiasters: 8000, discountPiasters: 500, costPiasters: 4800, grossProfitPiasters: 3200, marginBps: 4000 } })
    expect(calculateProfitSummary({
      saleLines: [{ status: 'completed', finalLineTotalPiasters: 10000, discountPiasters: 500, lineCostPiasters: 6000 }],
      returns: [{ status: 'completed', refundPiasters: 2000, condition: 'damaged', restockedValuePiasters: 0 }],
      costVariancePiasters: 0,
    })).toEqual({ ok: true, value: { revenuePiasters: 8000, discountPiasters: 500, costPiasters: 6000, grossProfitPiasters: 2000, marginBps: 2500 } })
  })

  it('excludes voided sales and applies signed variance', () => {
    expect(calculateProfitSummary({
      saleLines: [{ status: 'voided', finalLineTotalPiasters: 10000, discountPiasters: 500, lineCostPiasters: 6000 }],
      returns: [],
      costVariancePiasters: 60,
    })).toEqual({ ok: true, value: { revenuePiasters: 0, discountPiasters: 0, costPiasters: 60, grossProfitPiasters: -60, marginBps: 0 } })
    expect(calculateProfitSummary({
      saleLines: [{ status: 'completed', finalLineTotalPiasters: 1000, discountPiasters: 0, lineCostPiasters: 1500 }],
      returns: [],
      costVariancePiasters: 0,
    })).toEqual({ ok: true, value: { revenuePiasters: 1000, discountPiasters: 0, costPiasters: 1500, grossProfitPiasters: -500, marginBps: -5000 } })
  })
})

describe('calculateStockValue', () => {
  it('reports only positive stock values and flags review rows', () => {
    expect(calculateStockValue([
      { productId: 'A', onHandQty: 10, onHandValuePiasters: 1000 },
      { productId: 'B', onHandQty: 5, onHandValuePiasters: 250 },
      { productId: 'C', onHandQty: -3, onHandValuePiasters: -300 },
      { productId: 'D', onHandQty: 0, onHandValuePiasters: 60 },
    ])).toEqual({
      ok: true,
      value: {
        totalValuePiasters: 1250,
        breakdown: [
          { productId: 'A', onHandQty: 10, onHandValuePiasters: 1000 },
          { productId: 'B', onHandQty: 5, onHandValuePiasters: 250 },
        ],
        needsReview: ['C', 'D'],
      },
    })
  })
})
