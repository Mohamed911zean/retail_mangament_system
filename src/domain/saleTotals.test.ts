import { describe, expect, it } from 'vitest'
import { calculateSaleTotals } from './saleTotals'

describe('calculateSaleTotals', () => {
  it('returns zero totals for an empty list', () => {
    expect(calculateSaleTotals([], 25)).toEqual({
      ok: true,
      value: {
        subtotal: 0,
        lineDiscount: 0,
        invoiceDiscount: 0,
        tax: 0,
        preRoundTotal: 0,
        roundingAdjustment: 0,
        total: 0,
      },
    })
  })

  it('sums persisted-style line fields and applies cash rounding', () => {
    const result = calculateSaleTotals(
      [
        {
          lineSubtotal: 10000,
          lineDiscount: 0,
          invoiceDiscountAllocated: 667,
          finalLineTotal: 9333,
          tax: 0,
          net: 9333,
          taxRateBps: 0,
        },
        {
          lineSubtotal: 5000,
          lineDiscount: 0,
          invoiceDiscountAllocated: 333,
          finalLineTotal: 4667,
          tax: 0,
          net: 4667,
          taxRateBps: 0,
        },
      ],
      25,
    )

    expect(result).toEqual({
      ok: true,
      value: {
        subtotal: 15000,
        lineDiscount: 0,
        invoiceDiscount: 1000,
        tax: 0,
        preRoundTotal: 14000,
        roundingAdjustment: 0,
        total: 14000,
      },
    })
  })
})
