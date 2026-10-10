/**
 * The only helpers allowed to turn a stored value into text (design system §6.4).
 *
 * Everything in the database is an integer: money in piasters, quantities in the
 * product's smallest unit. This module is the single place that formats them, so
 * a price can never be rendered two different ways on two screens.
 *
 * Digits are Western (0-9) by default — what shop owners expect on prices — and a
 * setting may switch the display to Arabic-Indic digits. Never rely on `Intl`
 * `ar-EG` defaults for this: they vary between Chromium builds.
 */
import { formatDigits, normalizeDigits } from '../../shared/digits'

export type DigitStyle = 'western' | 'arabic'

const CURRENCY_SUFFIX = 'ج.م'

/** `1250` → `12.50 ج.م`. Negative amounts keep a leading minus, never a flipped one. */
export function formatMoney(piasters: number, style: DigitStyle = 'western'): string {
  if (!Number.isSafeInteger(piasters)) throw new Error(`formatMoney expects integer piasters, got ${piasters}`)
  const sign = piasters < 0 ? '-' : ''
  const absolute = Math.abs(piasters)
  const whole = Math.floor(absolute / 100)
  const fraction = absolute % 100
  const text = `${sign}${whole}.${String(fraction).padStart(2, '0')}`
  return `${formatDigits(text, style)} ${CURRENCY_SUFFIX}`
}

/**
 * Splits money into the parts a POS screen wants to style separately
 * (the number and the currency), still as text.
 */
export function formatMoneyParts(piasters: number, style: DigitStyle = 'western'): { amount: string; currency: string } {
  const formatted = formatMoney(piasters, style)
  return { amount: formatted.slice(0, formatted.length - CURRENCY_SUFFIX.length - 1), currency: CURRENCY_SUFFIX }
}

/** Number of stored units per display unit, for a product's `qtyScale`. */
const UNITS_PER_DISPLAY_UNIT: Record<number, number> = { 0: 1, 3: 1000 }

export function unitsPerDisplayUnit(qtyScale: number): number {
  return UNITS_PER_DISPLAY_UNIT[qtyScale] ?? 10 ** qtyScale
}

/**
 * A discount rate, from basis points: `1250` → `12.5%`.
 *
 * Assembled from the integer parts rather than `rateBps / 100`, so a rate such
 * as `12.33%` cannot pick up a floating-point tail on its way to the screen. A
 * trailing zero is dropped (`1250` → `12.5%`, not `12.50%`) because that is how
 * a cashier says a discount out loud.
 */
export function formatRatePercent(rateBps: number, style: DigitStyle = 'western'): string {
  if (!Number.isSafeInteger(rateBps)) throw new Error(`formatRatePercent expects integer basis points, got ${rateBps}`)
  const sign = rateBps < 0 ? '-' : ''
  const absolute = Math.abs(rateBps)
  const whole = Math.floor(absolute / 100)
  const fraction = absolute % 100
  const tail = fraction === 0 ? '' : fraction % 10 === 0 ? `.${fraction / 10}` : `.${String(fraction).padStart(2, '0')}`
  return `${formatDigits(`${sign}${whole}${tail}`, style)}%`
}

/**
 * Renders a stored integer quantity for the cashier.
 *
 * A `qtyScale` of 3 means the stored integer is thousandths, so `1500` shows as
 * `1.5` (kg) and `1000` as `1`. Trailing zeros are dropped and a whole value has
 * no decimal point, which is what a shop owner reads quickest.
 */
export function formatQty(value: number, qtyScale: number, unitName: string, style: DigitStyle = 'western'): string {
  const formatted = formatQtyValue(value, qtyScale, style)
  return unitName.length === 0 ? formatted : `${formatted} ${unitName}`
}

/**
 * The number alone, without the unit name — for a quantity input, where the unit
 * is part of the field's label instead.
 */
export function formatQtyValue(value: number, qtyScale: number, style: DigitStyle = 'western'): string {
  if (!Number.isSafeInteger(value)) throw new Error(`formatQtyValue expects an integer in the smallest unit, got ${value}`)
  const perUnit = unitsPerDisplayUnit(qtyScale)

  let text = String(Math.abs(value))
  if (perUnit > 1) {
    const whole = Math.floor(Math.abs(value) / perUnit)
    const fraction = String(Math.abs(value) % perUnit)
      .padStart(String(perUnit).length - 1, '0')
      .replace(/0+$/u, '')
    text = fraction.length === 0 ? String(whole) : `${whole}.${fraction}`
  }

  return formatDigits(`${value < 0 ? '-' : ''}${text}`, style)
}

/**
 * Parses a quantity typed by the cashier into the stored smallest unit.
 *
 * A `qtyScale` of 3 means `1.5` becomes `1500`; a scale of 0 means the field is
 * whole pieces and `1.5` is rejected rather than silently rounded down — a
 * cashier who typed a fraction meant something, and guessing is worse than
 * asking. Returns `null` for anything unparseable, so the caller can keep the
 * raw text on screen instead of fighting the keystrokes.
 */
export function parseQtyToUnits(input: string, qtyScale: number): number | null {
  const text = normalizeDigits(input).replace(/\s/gu, '').replace('٫', '.')
  if (text.length === 0) return null

  const perUnit = unitsPerDisplayUnit(qtyScale)
  const decimals = qtyScale <= 0 ? 0 : String(perUnit).length - 1
  const pattern = decimals === 0 ? /^-?\d+$/u : new RegExp(`^-?\\d+(\\.\\d{1,${decimals}})?$`, 'u')
  if (!pattern.test(text)) return null

  const negative = text.startsWith('-')
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.')
  const units = Number(whole) * perUnit + (decimals === 0 ? 0 : Number(fraction.padEnd(decimals, '0')))
  if (!Number.isSafeInteger(units)) return null
  return negative ? -units : units
}

// ─── Dates ──────────────────────────────────────────────────────────────────

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

/** Gregorian `yyyy/mm/dd`, the format the design system mandates. */
export function formatDate(epochMs: number, style: DigitStyle = 'western'): string {
  const date = new Date(epochMs)
  return formatDigits(`${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`, style)
}

/** 12-hour clock with an Arabic ص/م marker. */
export function formatTime(epochMs: number, style: DigitStyle = 'western'): string {
  const date = new Date(epochMs)
  const hours = date.getHours()
  const marker = hours < 12 ? 'ص' : 'م'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${formatDigits(`${hour12}:${pad(date.getMinutes())}`, style)} ${marker}`
}

export function formatDateTime(epochMs: number, style: DigitStyle = 'western'): string {
  return `${formatDate(epochMs, style)} ${formatTime(epochMs, style)}`
}

/**
 * Human-readable size, for backup files and logs. Binary units (1 KB = 1024 B)
 * because that is what Windows shows in Explorer, and one decimal is enough to
 * tell a 300 KB backup from a 3 MB one.
 */
export function formatBytes(bytes: number, style: DigitStyle = 'western'): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error(`formatBytes expects a non-negative integer, got ${bytes}`)
  if (bytes < 1024) return `${formatDigits(String(bytes), style)} B`
  const kilobytes = bytes / 1024
  if (kilobytes < 1024) return `${formatDigits(`${kilobytes.toFixed(1)}`, style)} KB`
  return `${formatDigits(`${(kilobytes / 1024).toFixed(1)}`, style)} MB`
}

/**
 * Parses a money field typed by the cashier into integer piasters.
 * Arabic-Indic digits are folded to Western first, and only up to two decimals
 * are accepted, so `12.5` becomes `1250` and `12.505` is rejected.
 */
export function parseMoneyToPiasters(input: string): number | null {
  // Arabic-Indic digits and the Arabic decimal separator are what an Arabic
  // keyboard produces; fold them first, then accept only a plain decimal.
  const text = normalizeDigits(input).replace(/\s/gu, '').replace('٫', '.')
  if (text.length === 0) return null
  if (!/^-?\d+(\.\d{1,2})?$/u.test(text)) return null
  const negative = text.startsWith('-')
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.')
  const piasters = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(piasters)) return null
  return negative ? -piasters : piasters
}
