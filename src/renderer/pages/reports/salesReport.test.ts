import { describe, expect, it } from 'vitest'
import { bucketSalesByDay, formatDateInput, parseDateInput, presetRange, toCsv } from './salesReport'

const day = new Date(2026, 9, 11, 10, 0, 0).getTime()
const hour = 60 * 60 * 1000

describe('bucketSalesByDay', () => {
  it('groups completed sales by local day, oldest first', () => {
    const buckets = bucketSalesByDay([
      { createdAt: day, totalPiasters: 3000, paidPiasters: 3000, duePiasters: 0, status: 'completed' },
      { createdAt: day + 2 * hour, totalPiasters: 1500, paidPiasters: 500, duePiasters: 1000, status: 'completed' },
      { createdAt: day + 26 * hour, totalPiasters: 2000, paidPiasters: 2000, duePiasters: 0, status: 'completed' },
    ])
    expect(buckets).not.toBeNull()
    if (buckets === null) return
    expect(buckets).toHaveLength(2)
    expect(buckets[0].salesCount).toBe(2)
    expect(buckets[0].revenuePiasters).toBe(4500)
    expect(buckets[0].paidPiasters).toBe(3500)
    expect(buckets[0].duePiasters).toBe(1000)
    expect(buckets[1].salesCount).toBe(1)
  })

  it('leaves voided invoices out of revenue', () => {
    const buckets = bucketSalesByDay([
      { createdAt: day, totalPiasters: 9999, paidPiasters: 0, duePiasters: 0, status: 'voided' },
      { createdAt: day, totalPiasters: 100, paidPiasters: 100, duePiasters: 0, status: 'completed' },
    ])
    expect(buckets).not.toBeNull()
    if (buckets === null) return
    expect(buckets).toHaveLength(1)
    expect(buckets[0].revenuePiasters).toBe(100)
  })

  it('returns null on unsafe input instead of inventing a total', () => {
    // Two maximal rows sum past safe range; a single one is still exact.
    expect(
      bucketSalesByDay([
        { createdAt: day, totalPiasters: Number.MAX_SAFE_INTEGER, paidPiasters: Number.MAX_SAFE_INTEGER, duePiasters: 0, status: 'completed' },
        { createdAt: day, totalPiasters: 1, paidPiasters: 1, duePiasters: 0, status: 'completed' },
      ]),
    ).toBeNull()
    const single = bucketSalesByDay([
      { createdAt: day, totalPiasters: Number.MAX_SAFE_INTEGER, paidPiasters: Number.MAX_SAFE_INTEGER, duePiasters: 0, status: 'completed' },
    ])
    expect(single?.[0].revenuePiasters).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('date presets and inputs', () => {
  it('returns a half-open range ending tonight that contains now', () => {
    const now = new Date(2026, 9, 11, 15, 30, 0).getTime()
    for (const preset of ['today', 'yesterday', 'last7', 'month'] as const) {
      const range = presetRange(preset, now)
      expect(range.fromMs).toBeLessThan(range.toMs)
      if (preset !== 'yesterday') {
        expect(range.fromMs).toBeLessThanOrEqual(now)
        expect(range.toMs).toBeGreaterThan(now)
      } else {
        expect(range.toMs).toBeLessThanOrEqual(now)
      }
    }
  })

  it('round-trips a date input value', () => {
    expect(formatDateInput(parseDateInput('2026-10-11') ?? 0)).toBe('2026-10-11')
    expect(parseDateInput('2026-02-30')).toBeNull()
    expect(parseDateInput('tomorrow')).toBeNull()
  })
})

describe('toCsv', () => {
  it('starts with a BOM and quotes fields that need it', () => {
    const csv = toCsv(['البيان', 'المبلغ'], [['مبيعات; نقدي', 3000], ['خصم "خاص"', 150]])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"مبيعات; نقدي";3000')
    expect(csv).toContain('"خصم ""خاص""";150')
  })
})
