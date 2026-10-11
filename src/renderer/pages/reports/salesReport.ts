/**
 * PURE report shaping for the reports screen. The main process owns the ledger
 * reads and the profit/stock math; everything here turns already-finalized
 * rows into day buckets, date ranges and CSV text for display and export.
 *
 * Days are device-local midnights. The shop PC is expected to run on
 * Africa/Cairo time (schema §2.2 displays Cairo time), so local days *are*
 * Cairo days on a correctly configured device.
 */

export type DayBucket = {
  /** `2026-10-11`, device-local. */
  dayKey: string
  /** Local midnight at the start of the day, for display. */
  dayStartMs: number
  salesCount: number
  revenuePiasters: number
  paidPiasters: number
  duePiasters: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dayStart(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getTime()
}

/**
 * Groups completed sales by device-local day, oldest first. Voided invoices
 * are not revenue and are left out; the totals cover exactly what is shown.
 * Returns null when a sum would leave safe-integer range (corrupt input —
 * `db:verify` is the tool that explains it).
 */
export function bucketSalesByDay(
  rows: readonly { createdAt: number; totalPiasters: number; paidPiasters: number; duePiasters: number; status: string }[],
): DayBucket[] | null {
  const buckets = new Map<string, { dayStartMs: number; salesCount: number; revenue: bigint; paid: bigint; due: bigint }>()
  for (const row of rows) {
    if (row.status !== 'completed') continue
    if (!Number.isSafeInteger(row.createdAt) || !Number.isSafeInteger(row.totalPiasters) || !Number.isSafeInteger(row.paidPiasters) || !Number.isSafeInteger(row.duePiasters)) {
      return null
    }
    const date = new Date(row.createdAt)
    const key = ymd(date)
    const entry = buckets.get(key) ?? { dayStartMs: dayStart(date.getFullYear(), date.getMonth() + 1, date.getDate()), salesCount: 0, revenue: 0n, paid: 0n, due: 0n }
    entry.salesCount += 1
    entry.revenue += BigInt(row.totalPiasters)
    entry.paid += BigInt(row.paidPiasters)
    entry.due += BigInt(row.duePiasters)
    buckets.set(key, entry)
  }
  const ordered = [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  const result: DayBucket[] = []
  for (const [dayKey, entry] of ordered) {
    if (entry.revenue > max || entry.paid > max || entry.due > max) return null
    result.push({
      dayKey,
      dayStartMs: entry.dayStartMs,
      salesCount: entry.salesCount,
      revenuePiasters: Number(entry.revenue),
      paidPiasters: Number(entry.paid),
      duePiasters: Number(entry.due),
    })
  }
  return result
}

export type DatePreset = 'today' | 'yesterday' | 'last7' | 'month'

/** Half-open [fromMs, toMs) device-local range for a preset, ending tonight. */
export function presetRange(preset: DatePreset, nowMs: number): { fromMs: number; toMs: number } {
  const now = new Date(nowMs)
  const tonight = dayStart(now.getFullYear(), now.getMonth() + 1, now.getDate()) + 24 * 60 * 60 * 1000
  if (preset === 'today') return { fromMs: tonight - 24 * 60 * 60 * 1000, toMs: tonight }
  if (preset === 'yesterday') return { fromMs: tonight - 2 * 24 * 60 * 60 * 1000, toMs: tonight - 24 * 60 * 60 * 1000 }
  if (preset === 'last7') return { fromMs: tonight - 7 * 24 * 60 * 60 * 1000, toMs: tonight }
  return { fromMs: dayStart(now.getFullYear(), now.getMonth() + 1, 1), toMs: tonight }
}

/** Reads a `<input type="date">` value into local-midnight ms, or null. */
export function parseDateInput(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text.trim())
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const built = new Date(year, month - 1, day)
  if (built.getFullYear() !== year || built.getMonth() !== month - 1 || built.getDate() !== day) return null
  return built.getTime()
}

/** Formats ms back into a `<input type="date">` value. */
export function formatDateInput(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Builds CSV text for Excel: a BOM so Arabic opens correctly, `;` separators
 * (the list separator on Arabic-locale Windows), and quoting only when a field
 * contains the separator, a quote or a line break.
 */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (field: string | number): string => {
    const text = String(field)
    if (text.includes(';') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
      return `"${text.replace(/"/gu, '""')}"`
    }
    return text
  }
  const lines = [headers.map(escape).join(';'), ...rows.map((row) => row.map(escape).join(';'))]
  // fromCharCode keeps the BOM visible in source: no invisible characters.
  return `${String.fromCharCode(0xfeff)}${lines.join('\r\n')}`
}
