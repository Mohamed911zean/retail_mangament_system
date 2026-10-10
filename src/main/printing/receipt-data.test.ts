import { describe, expect, it } from 'vitest'
import type { MoneyLedgerRow, SaleItemRow, SaleRow } from '../../shared/rows'
import { buildSaleReceiptData, formatQuantityUnits, formatReceiptTimestamp } from './receipt-data'

const COMMON = { createdAt: 0, updatedAt: 0, deviceId: 'dev' }

function sale(overrides: Partial<SaleRow> = {}): SaleRow {
  return {
    ...COMMON,
    id: 's1',
    invoiceNumber: '1042',
    customerId: null,
    userId: 'u1',
    shiftId: null,
    subtotalPiasters: 3000,
    lineDiscountPiasters: 150,
    invoiceDiscountPiasters: 285,
    taxPiasters: 0,
    roundingAdjustmentPiasters: 0,
    totalPiasters: 2565,
    paidPiasters: 2565,
    duePiasters: 0,
    paymentStatus: 'paid',
    status: 'completed',
    voidedAt: null,
    voidedByUserId: null,
    voidReason: null,
    notes: null,
    ...overrides,
  }
}

function item(overrides: Partial<SaleItemRow> = {}): SaleItemRow {
  return {
    ...COMMON,
    id: 'i1',
    saleId: 's1',
    productId: 'p1',
    unitNameSnapshot: 'كجم',
    pricedUnitQtyBase: 1000,
    qtyBase: 1500,
    unitPricePiasters: 1500,
    lineSubtotalPiasters: 2250,
    lineDiscountPiasters: 0,
    invoiceDiscountAllocatedPiasters: 0,
    taxRateBpsSnapshot: 0,
    taxPiasters: 0,
    finalLineTotalPiasters: 2250,
    lineCostPiasters: 1000,
    productNameSnapshot: 'بطاطس',
    ...overrides,
  }
}

function payment(overrides: Partial<MoneyLedgerRow> = {}): MoneyLedgerRow {
  return {
    ...COMMON,
    id: 'm1',
    entryType: 'sale_payment',
    direction: 'in',
    amountPiasters: 3000,
    paymentMethod: 'cash',
    customerId: null,
    supplierId: null,
    saleId: 's1',
    referenceType: 'sale',
    referenceId: 's1',
    reversesEntryId: null,
    shiftId: null,
    referenceText: null,
    tenderedPiasters: 5000,
    changePiasters: 2435,
    occurredAt: 0,
    userId: 'u1',
    ...overrides,
  }
}

describe('formatQuantityUnits', () => {
  it('divides by the priced unit', () => {
    // 1500 g of a product priced per kilogram is 1.5 kg.
    expect(formatQuantityUnits(1500, 1000)).toBe('1.5')
    // Exactly one kilogram keeps no decimal point.
    expect(formatQuantityUnits(1000, 1000)).toBe('1')
    // 24 pieces of a 12-piece box is 2 boxes.
    expect(formatQuantityUnits(24, 12)).toBe('2')
    // Half a box.
    expect(formatQuantityUnits(6, 12)).toBe('0.5')
    expect(formatQuantityUnits(0, 1)).toBe('0')
  })

  it('rounds a unit that is not a power of ten for display only', () => {
    // A box of 3: 1 piece is 0.333…, printed to three places.
    expect(formatQuantityUnits(1, 3)).toBe('0.333')
    expect(formatQuantityUnits(2, 3)).toBe('0.667')
  })

  it('carries instead of printing a four-digit fraction', () => {
    // 1999/2000 rounds to 999.5 thousandths → 1000, which is one whole unit.
    expect(formatQuantityUnits(1999, 2000)).toBe('1')
  })

  it('refuses impossible input', () => {
    expect(() => formatQuantityUnits(-1, 1000)).toThrow()
    expect(() => formatQuantityUnits(1000, 0)).toThrow()
    expect(() => formatQuantityUnits(1.5, 1000)).toThrow()
  })
})

describe('formatReceiptTimestamp', () => {
  it('prints the shop clock as yyyy/mm/dd hh:mm', () => {
    // Built from local components, so the assertion holds in any time zone.
    expect(formatReceiptTimestamp(new Date(2026, 9, 9, 14, 5).getTime())).toBe('2026/10/09 14:05')
    expect(formatReceiptTimestamp(new Date(2026, 0, 1, 0, 0).getTime())).toBe('2026/01/01 00:00')
  })
})

describe('buildSaleReceiptData', () => {
  it('flattens a stored sale into the template data', () => {
    const receipt = buildSaleReceiptData({
      sale: sale(),
      items: [item()],
      payments: [payment()],
      shopName: 'بقالة النور',
      customerName: 'أحمد',
    })

    expect(receipt.shopName).toBe('بقالة النور')
    expect(receipt.invoiceNumber).toBe('1042')
    expect(receipt.customerName).toBe('أحمد')
    expect(receipt.items).toEqual([
      { productName: 'بطاطس', qtyText: '1.5', unitName: 'كجم', unitPricePiasters: 1500, lineTotalPiasters: 2250 },
    ])
    // 150 line discount + 285 invoice discount = 435.
    expect(receipt.discountPiasters).toBe(435)
    expect(receipt.totalPiasters).toBe(2565)
    // 5000 tendered − 2565 due = 2435 change.
    expect(receipt.changePiasters).toBe(2435)
  })

  it('adds the change of every cash row and treats a missing one as zero', () => {
    const receipt = buildSaleReceiptData({
      sale: sale(),
      items: [],
      payments: [payment({ id: 'm1', changePiasters: 100 }), payment({ id: 'm2', changePiasters: null })],
      shopName: '',
      customerName: null,
    })
    expect(receipt.changePiasters).toBe(100)
    expect(receipt.customerName).toBeNull()
  })

  it('sums a zero discount to zero rather than leaving it undefined', () => {
    const receipt = buildSaleReceiptData({
      sale: sale({ lineDiscountPiasters: 0, invoiceDiscountPiasters: 0, totalPiasters: 3000 }),
      items: [],
      payments: [],
      shopName: '',
      customerName: null,
    })
    expect(receipt.discountPiasters).toBe(0)
    expect(receipt.changePiasters).toBe(0)
  })
})
