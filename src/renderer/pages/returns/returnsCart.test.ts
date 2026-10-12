import { describe, expect, it } from 'vitest'
import type { ReturnDetails } from '../../../shared/ipc'
import { alreadyReturned, previewRefund, remainingQty } from './returnsCart'

function entry(status: 'completed' | 'voided', items: { saleItemId: string; qtyBase: number; refundPiasters: number }[]): ReturnDetails {
  return {
    saleReturn: {
      id: 'r1',
      returnNumber: '000001',
      originalSaleId: 's1',
      customerId: null,
      userId: 'u1',
      shiftId: null,
      totalPiasters: 0,
      cashRefundedPiasters: 0,
      creditedToAccountPiasters: 0,
      status,
      reason: null,
      voidedAt: null,
      voidedByUserId: null,
      voidReason: null,
      createdAt: 0,
      updatedAt: 0,
      deviceId: 'd1',
    },
    items: items.map((item, index) => ({
      id: `ri${index}`,
      saleReturnId: 'r1',
      saleItemId: item.saleItemId,
      productId: 'p1',
      qtyBase: item.qtyBase,
      refundPiasters: item.refundPiasters,
      condition: 'resalable' as const,
      createdAt: 0,
      updatedAt: 0,
      deviceId: 'd1',
    })),
  }
}

describe('alreadyReturned', () => {
  it('sums completed returns and skips voided ones', () => {
    const history = [
      entry('completed', [{ saleItemId: 'li1', qtyBase: 1, refundPiasters: 334 }]),
      entry('voided', [{ saleItemId: 'li1', qtyBase: 1, refundPiasters: 334 }]),
      entry('completed', [{ saleItemId: 'other', qtyBase: 2, refundPiasters: 500 }]),
    ]
    expect(alreadyReturned(history, 'li1')).toEqual({ qtyBase: 1, refundPiasters: 334 })
    expect(alreadyReturned(history, 'missing')).toEqual({ qtyBase: 0, refundPiasters: 0 })
  })
})

describe('remainingQty', () => {
  it('never goes below zero', () => {
    expect(remainingQty(3, 1)).toBe(2)
    expect(remainingQty(3, 3)).toBe(0)
    expect(remainingQty(3, 9)).toBe(0)
  })
})

describe('previewRefund', () => {
  it('follows the cumulative 1001-over-3 schedule: 334, then 333', () => {
    // First unit already refunded 334; the next single unit previews 333.
    expect(previewRefund(1001, 1, 3, 1, 334)).toBe(333)
  })

  it('returns null past the original quantity', () => {
    expect(previewRefund(1001, 3, 3, 1, 334)).toBeNull()
  })
})
