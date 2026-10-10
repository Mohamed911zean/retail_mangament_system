import { describe, expect, it } from 'vitest'
import { checkPurchasePayment, invoiceTotal, lineTotal, parseExpiryDate } from './purchaseCart'

describe('lineTotal', () => {
  it('prices counted and weighed lines like the service', () => {
    // 12 pieces at 100 piasters.
    expect(lineTotal({ unitCostPiasters: 100, qtyBase: 12, pricedUnitQtyBase: 1 })).toBe(1200)
    // 350 g at 12,000 piasters/kg = 4200 (the schema's canonical example).
    expect(lineTotal({ unitCostPiasters: 12_000, qtyBase: 350, pricedUnitQtyBase: 1000 })).toBe(4200)
  })

  it('sums lines into the invoice total', () => {
    expect(
      invoiceTotal([
        { unitCostPiasters: 100, qtyBase: 12, pricedUnitQtyBase: 1 },
        { unitCostPiasters: 12_000, qtyBase: 350, pricedUnitQtyBase: 1000 },
      ]),
    ).toBe(5400)
    expect(invoiceTotal([])).toBe(0)
  })
})

describe('checkPurchasePayment', () => {
  it('leaves the remainder as supplier balance on a partial payment', () => {
    const check = checkPurchasePayment(10_000, [{ method: 'cash', amountPiasters: 5000 }], 'sup1')
    expect(check).toEqual({ ok: true, paidPiasters: 5000, duePiasters: 5000, status: 'partial' })
  })

  it('puts the whole invoice on credit when nothing is paid', () => {
    const check = checkPurchasePayment(10_000, [], 'sup1')
    expect(check).toEqual({ ok: true, paidPiasters: 0, duePiasters: 10_000, status: 'credit' })
  })

  it('refuses an unpaid invoice without a supplier', () => {
    const check = checkPurchasePayment(10_000, [], null)
    expect(check.ok).toBe(false)
  })

  it('marks exact payment as paid', () => {
    const check = checkPurchasePayment(10_000, [{ method: 'card', amountPiasters: 10_000 }], 'sup1')
    expect(check).toEqual({ ok: true, paidPiasters: 10_000, duePiasters: 0, status: 'paid' })
  })
})

describe('parseExpiryDate', () => {
  it('reads yyyy/MM/dd into UTC epoch milliseconds', () => {
    expect(parseExpiryDate('2027/03/05')).toBe(Date.UTC(2027, 2, 5))
  })

  it('refuses impossible dates and wrong shapes', () => {
    expect(parseExpiryDate('2027/02/30')).toBeNull()
    expect(parseExpiryDate('2027/13/01')).toBeNull()
    expect(parseExpiryDate('05/03/2027')).toBeNull()
    expect(parseExpiryDate('tomorrow')).toBeNull()
    expect(parseExpiryDate('')).toBeNull()
  })
})
