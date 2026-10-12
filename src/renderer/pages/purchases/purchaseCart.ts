import { calculateLineSubtotal } from '../../../domain/pricing'
import { calculatePaymentAllocation, type Tender } from '../../../domain/payments'
import type { PaymentMethod } from '../../../shared/settings'

/**
 * PURE invoice builder for the purchase screen. The page owns loading and IPC;
 * everything here is integer math over values already on screen.
 *
 * A purchase line is priced exactly like a frozen invoice line:
 * `round_half_up(unitCost × qty, pricedUnitQtyBase)` — the same domain helper
 * the purchase service runs, so the screen and the saved invoice agree.
 */

export type PurchaseDraftLine = {
  id: string
  productId: string
  productName: string
  unitName: string
  pricedUnitQtyBase: number
  qtyBase: number
  unitCostPiasters: number
}

export type PurchaseTenderDraft = { method: PaymentMethod; amountPiasters: number }

/** `12` units at 100 piasters each → 1200. Falls back to 0 only for domain-flagged input. */
export function lineTotal(line: Pick<PurchaseDraftLine, 'unitCostPiasters' | 'qtyBase' | 'pricedUnitQtyBase'>): number {
  const result = calculateLineSubtotal(line.unitCostPiasters, line.qtyBase, line.pricedUnitQtyBase)
  return result.ok ? result.value : 0
}

export function invoiceTotal(lines: readonly Pick<PurchaseDraftLine, 'unitCostPiasters' | 'qtyBase' | 'pricedUnitQtyBase'>[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0)
}

export type PurchasePaymentCheck =
  | { ok: true; paidPiasters: number; duePiasters: number; status: 'paid' | 'partial' | 'credit' }
  | { ok: false; code: string }

/**
 * What the invoice will record: paid now, left as supplier balance, and the
 * payment status. An empty tender list with a supplier means fully on credit;
 * without a supplier the service refuses anything unpaid.
 */
export function checkPurchasePayment(totalPiasters: number, tenders: readonly PurchaseTenderDraft[], supplierId: string | null): PurchasePaymentCheck {
  const wire: Tender[] = tenders.map((tender) => ({ method: tender.method, amountPiasters: tender.amountPiasters }))
  const result = calculatePaymentAllocation(totalPiasters, wire, supplierId !== null)
  if (!result.ok) return { ok: false, code: result.error.code }
  return { ok: true, paidPiasters: result.value.paidPiasters, duePiasters: result.value.duePiasters, status: result.value.status }
}

/**
 * Reads an expiry date the buyer typed as `yyyy/MM/dd` into UTC epoch
 * milliseconds, or null when it is not a real calendar date. Month and day
 * must exist (no 2026/02/30), so the constructed date is read back and
 * compared rather than trusted.
 */
export function parseExpiryDate(text: string): number | null {
  const trimmed = text.trim()
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/u.exec(trimmed)
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const built = new Date(Date.UTC(year, month - 1, day))
  if (built.getUTCFullYear() !== year || built.getUTCMonth() !== month - 1 || built.getUTCDate() !== day) return null
  return built.getTime()
}

/**
 * Expiry conversion for the native date picker (`yyyy-mm-dd`). Stored values
 * are UTC midnights (see `parseExpiryDate`), so both directions use UTC field
 * accessors: local getters would shift the day on timezones ahead of UTC and
 * silently store the wrong date. Past dates convert like any other — whether
 * they are accepted is the service's decision, not the picker's.
 */

/** Stored ms (or null) → picker value. */
export function expiryMsToPickerValue(expiryAtMs: number | null): string {
  if (expiryAtMs === null) return ''
  if (!Number.isSafeInteger(expiryAtMs)) return ''
  const date = new Date(expiryAtMs)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Picker value → stored ms, or null for empty/invalid input. */
export function pickerValueToExpiryMs(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text.trim())
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const built = new Date(Date.UTC(year, month - 1, day))
  if (built.getUTCFullYear() !== year || built.getUTCMonth() !== month - 1 || built.getUTCDate() !== day) return null
  return built.getTime()
}
