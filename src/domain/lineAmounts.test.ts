import { describe, expect, it } from 'vitest'
import { calculateLineAmounts, type LineInput } from './lineAmounts'

const baseLines: LineInput[] = [
  {
    unitPricePiasters: 10000,
    qtyBase: 1,
    pricedUnitQtyBase: 1,
    taxRateBps: 0,
  },
  {
    unitPricePiasters: 5000,
    qtyBase: 1,
    pricedUnitQtyBase: 1,
    taxRateBps: 0,
  },
]

describe('calculateLineAmounts', () => {
  it('allocates a fixed invoice discount by largest remainder', () => {
    const result = calculateLineAmounts(
      baseLines,
      { kind: 'fixed', amountPiasters: 1000 },
      false,
    )

    expect(result).toEqual({
      ok: true,
      value: [
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
    })
  })

  it('applies line discounts before invoice allocation', () => {
    const lines: LineInput[] = [
      { ...baseLines[0], lineDiscount: { kind: 'percentage', rateBps: 1000 } },
      baseLines[1],
    ]
    const result = calculateLineAmounts(
      lines,
      { kind: 'fixed', amountPiasters: 1000 },
      false,
    )

    expect(result).toEqual({
      ok: true,
      value: [
        {
          lineSubtotal: 10000,
          lineDiscount: 1000,
          invoiceDiscountAllocated: 643,
          finalLineTotal: 8357,
          tax: 0,
          net: 8357,
          taxRateBps: 0,
        },
        {
          lineSubtotal: 5000,
          lineDiscount: 0,
          invoiceDiscountAllocated: 357,
          finalLineTotal: 4643,
          tax: 0,
          net: 4643,
          taxRateBps: 0,
        },
      ],
    })
  })

  it('caps a percentage invoice discount and handles zero-price weights', () => {
    const lines: LineInput[] = [
      { ...baseLines[0], unitPricePiasters: 0 },
      baseLines[1],
    ]
    const result = calculateLineAmounts(
      lines,
      { kind: 'percentage', rateBps: 10000 },
      false,
    )

    expect(result).toEqual({
      ok: true,
      value: [
        {
          lineSubtotal: 0,
          lineDiscount: 0,
          invoiceDiscountAllocated: 0,
          finalLineTotal: 0,
          tax: 0,
          net: 0,
          taxRateBps: 0,
        },
        {
          lineSubtotal: 5000,
          lineDiscount: 0,
          invoiceDiscountAllocated: 5000,
          finalLineTotal: 0,
          tax: 0,
          net: 0,
          taxRateBps: 0,
        },
      ],
    })
  })

  it('calculates enabled tax from each final line', () => {
    const result = calculateLineAmounts(
      [{ ...baseLines[0], taxRateBps: 1400 }],
      { kind: 'fixed', amountPiasters: 0 },
      true,
    )

    expect(result).toEqual({
      ok: true,
      value: [
        {
          lineSubtotal: 10000,
          lineDiscount: 0,
          invoiceDiscountAllocated: 0,
          finalLineTotal: 10000,
          tax: 1228,
          net: 8772,
          taxRateBps: 1400,
        },
      ],
    })
  })

  it('allows an empty list and returns no lines', () => {
    expect(
      calculateLineAmounts([], { kind: 'fixed', amountPiasters: 0 }, false),
    ).toEqual({ ok: true, value: [] })
  })
})
