import { describe, expect, it } from 'vitest'
import type { CustomerSummary } from '../../../shared/ipc'
import {
  addCash,
  cashTendered,
  changeDue,
  checkPayment,
  exceedsCreditLimit,
  remainingDue,
  setCash,
  setMethodTender,
  tenderedTotal,
  toTenders,
  type TenderDraft,
} from './payment'

/**
 * Every expected amount below is worked out by hand in the comment above it.
 * Money is integer piasters: 30.00 EGP is `3000`.
 */

function customer(overrides: Partial<CustomerSummary> = {}): CustomerSummary {
  return {
    id: 'c1',
    name: 'عميل',
    phone: null,
    address: null,
    creditLimitPiasters: null,
    metadata: null,
    deletedAt: null,
    createdAt: 0,
    updatedAt: 0,
    deviceId: 'dev',
    balancePiasters: 0,
    ...overrides,
  }
}

describe('tender arithmetic', () => {
  it('sums cash and non-cash separately', () => {
    const tenders: TenderDraft[] = [
      { method: 'cash', amountPiasters: 2500 },
      { method: 'card', amountPiasters: 1000 },
    ]
    expect(tenderedTotal(tenders)).toBe(3500)
    expect(cashTendered(tenders)).toBe(2500)
  })

  it('reports what is still unpaid, never a negative debt', () => {
    // 30.00 due, 10.00 handed over → 20.00 left.
    expect(remainingDue(3000, [{ method: 'cash', amountPiasters: 1000 }])).toBe(2000)
    // 30.00 due, a 50.00 note → nothing left to collect.
    expect(remainingDue(3000, [{ method: 'cash', amountPiasters: 5000 }])).toBe(0)
  })

  it('gives change from the cash part only', () => {
    // 30.00 due, 50.00 cash → 20.00 back.
    expect(changeDue(3000, [{ method: 'cash', amountPiasters: 5000 }])).toBe(2000)
    // 30.00 due, 10.00 on card then 25.00 cash → the card covered 10.00,
    // so 20.00 was owed in cash and 5.00 comes back.
    expect(
      changeDue(3000, [
        { method: 'card', amountPiasters: 1000 },
        { method: 'cash', amountPiasters: 2500 },
      ]),
    ).toBe(500)
    // Paid by card alone: no change is ever given on a card.
    expect(changeDue(3000, [{ method: 'card', amountPiasters: 3000 }])).toBe(0)
  })

  it('adds notes to one cash tender instead of stacking rows', () => {
    const first = addCash([], 5000)
    expect(first).toEqual([{ method: 'cash', amountPiasters: 5000 }])

    const second = addCash(first, 2000)
    // A 50.00 note plus a 20.00 note is one cash tender of 70.00.
    expect(second).toEqual([{ method: 'cash', amountPiasters: 7000 }])
  })

  it('replaces the cash and per-method tenders', () => {
    const tenders: TenderDraft[] = [
      { method: 'cash', amountPiasters: 1000 },
      { method: 'card', amountPiasters: 500 },
    ]
    expect(setCash(tenders, 3000)).toEqual([
      { method: 'card', amountPiasters: 500 },
      { method: 'cash', amountPiasters: 3000 },
    ])
    // Zero removes the tender rather than leaving a 0.00 row behind.
    expect(setMethodTender(tenders, 'card', 0)).toEqual([{ method: 'cash', amountPiasters: 1000 }])
  })

  it('drops empty tenders from the payload', () => {
    expect(
      toTenders([
        { method: 'cash', amountPiasters: 0 },
        { method: 'wallet', amountPiasters: 1250 },
      ]),
    ).toEqual([{ method: 'wallet', amountPiasters: 1250 }])
  })
})

describe('checkPayment', () => {
  it('accepts a fully paid invoice', () => {
    // 12.50 due, 12.50 in cash.
    expect(checkPayment({ totalPiasters: 1250, tenders: [{ method: 'cash', amountPiasters: 1250 }], customerId: null, creditEnabled: false })).toEqual({
      ok: true,
    })
  })

  it('accepts an over-tender, because the difference is change', () => {
    expect(checkPayment({ totalPiasters: 3000, tenders: [{ method: 'cash', amountPiasters: 5000 }], customerId: null, creditEnabled: false })).toEqual({
      ok: true,
    })
  })

  it('refuses a part payment with no customer', () => {
    const result = checkPayment({ totalPiasters: 3000, tenders: [{ method: 'cash', amountPiasters: 1000 }], customerId: null, creditEnabled: true })
    expect(result).toEqual({ ok: false, reason: 'needs_customer' })
  })

  it('accepts a part payment once a customer carries the rest', () => {
    const result = checkPayment({ totalPiasters: 3000, tenders: [{ method: 'cash', amountPiasters: 1000 }], customerId: 'c1', creditEnabled: true })
    expect(result).toEqual({ ok: true })
  })

  it('refuses credit when the shop has credit selling switched off', () => {
    const result = checkPayment({ totalPiasters: 3000, tenders: [], customerId: 'c1', creditEnabled: false })
    expect(result).toEqual({ ok: false, reason: 'needs_full_payment' })
  })

  it('refuses a cart that priced to nothing', () => {
    expect(checkPayment({ totalPiasters: 0, tenders: [], customerId: 'c1', creditEnabled: true })).toEqual({ ok: false, reason: 'nothing_to_pay' })
  })
})

describe('exceedsCreditLimit', () => {
  it('is false when the customer has no limit set', () => {
    expect(exceedsCreditLimit(customer({ balancePiasters: 900_000, creditLimitPiasters: null }), 100_000)).toBe(false)
  })

  it('stays false exactly at the limit', () => {
    // 50.00 owed + 50.00 new = 100.00, which is the limit, not over it.
    expect(exceedsCreditLimit(customer({ balancePiasters: 5000, creditLimitPiasters: 10000 }), 5000)).toBe(false)
  })

  it('is true one piaster over the limit', () => {
    expect(exceedsCreditLimit(customer({ balancePiasters: 5000, creditLimitPiasters: 10000 }), 5001)).toBe(true)
  })
})
