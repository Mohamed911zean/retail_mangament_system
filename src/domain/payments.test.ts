import { describe, expect, it } from 'vitest'
import { calculatePaymentAllocation } from './payments'

describe('calculatePaymentAllocation', () => {
  it.each([
    [10000, [{ method: 'cash', amountPiasters: 10000 }], false, 10000, 0, 'paid', [{ method: 'cash', amountPiasters: 10000 }], 10000, 0],
    [10000, [{ method: 'cash', amountPiasters: 20000 }], false, 10000, 0, 'paid', [{ method: 'cash', amountPiasters: 10000 }], 20000, 10000],
    [10000, [{ method: 'cash', amountPiasters: 4000 }], true, 4000, 6000, 'partial', [{ method: 'cash', amountPiasters: 4000 }], 4000, 0],
    [10000, [], true, 0, 10000, 'credit', [], 0, 0],
    [10000, [{ method: 'cash', amountPiasters: 4000 }, { method: 'card', amountPiasters: 6000 }], false, 10000, 0, 'paid', [{ method: 'cash', amountPiasters: 4000 }, { method: 'card', amountPiasters: 6000 }], 4000, 0],
    [10000, [{ method: 'card', amountPiasters: 6000 }, { method: 'cash', amountPiasters: 6000 }], false, 10000, 0, 'paid', [{ method: 'card', amountPiasters: 6000 }, { method: 'cash', amountPiasters: 4000 }], 6000, 2000],
    [5000, [{ method: 'cash', amountPiasters: 3000 }, { method: 'cash', amountPiasters: 3000 }], false, 5000, 0, 'paid', [{ method: 'cash', amountPiasters: 5000 }], 6000, 1000],
  ] as const)('calculates allocation', (total, tenders, customer, paid, due, status, entries, cash, change) => {
    expect(calculatePaymentAllocation(total, tenders, customer)).toEqual({
      ok: true, value: { paidPiasters: paid, duePiasters: due, status, ledgerEntries: entries, cashTenderedPiasters: cash, changePiasters: change },
    })
  })

  it('rejects missing customer for unpaid amount and invalid excess tenders', () => {
    expect(calculatePaymentAllocation(10000, [], false).ok).toBe(false)
    expect(calculatePaymentAllocation(10000, [{ method: 'card', amountPiasters: 12000 }], false).ok).toBe(false)
    expect(calculatePaymentAllocation(10000, [{ method: 'card', amountPiasters: 10000 }, { method: 'cash', amountPiasters: 2000 }], false).ok).toBe(false)
    expect(calculatePaymentAllocation(0, [{ method: 'cash', amountPiasters: 500 }], false).ok).toBe(false)
    expect(calculatePaymentAllocation(10000, [{ method: 'cash', amountPiasters: 0 }], false).ok).toBe(false)
  })

  it('preserves payment invariants across seeded cases', () => {
    let state = 0x13579bdfn
    const next = (max: number): number => {
      state = (state * 1664525n + 1013904223n) % 4294967296n
      return Number(state % BigInt(max))
    }
    for (let i = 0; i < 3000; i += 1) {
      const total = next(100000)
      const tenders = Array.from({ length: next(5) }, () => ({
        method: ['cash', 'card', 'wallet'][next(3)],
        amountPiasters: next(30000) + 1,
      }))
      const result = calculatePaymentAllocation(total, tenders, true)
      if (!result.ok) continue
      const tendered = tenders.reduce((sum, tender) => sum + tender.amountPiasters, 0)
      const ledger = result.value.ledgerEntries.reduce((sum, entry) => sum + entry.amountPiasters, 0)
      expect(result.value.paidPiasters + result.value.duePiasters).toBe(total)
      expect(ledger).toBe(result.value.paidPiasters)
      expect(result.value.changePiasters).toBeGreaterThanOrEqual(0)
      expect(tendered - result.value.changePiasters).toBe(result.value.paidPiasters)
    }
  })
})
