import { normalizeDigits } from '../shared/digits'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value }
}

export function fail<T>(error: string): ParseResult<T> {
  return { ok: false, error }
}

/**
 * Normalizes text: trims whitespace, folds Arabic-Indic digits to Western.
 */
export function normalizeText(val: unknown): string {
  if (val === null || val === undefined) return ''
  return normalizeDigits(String(val)).trim()
}

/**
 * Detects whether Excel serialized a long numeric barcode/SKU/phone
 * in scientific notation (e.g. 6.22E+12).
 */
export function detectScientificNotation(val: unknown): boolean {
  if (val === null || val === undefined) return false
  const str = String(val).trim()
  if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/i.test(str)) {
    return true
  }
  return false
}

/**
 * Normalizes a single barcode. Preserves leading zeros and catches
 * scientific notation corruption.
 */
export function normalizeBarcode(val: unknown): ParseResult<string> {
  if (val === null || val === undefined) {
    return fail('الباركود مطلوب')
  }

  if (detectScientificNotation(val)) {
    return fail('الباركود تحوّل لرقم علمي في إكسل، اجعل العمود نص')
  }

  const normalized = normalizeDigits(String(val))
    .trim()
    .replace(/\s+/g, '')

  if (normalized.length === 0) {
    return fail('الباركود فارغ')
  }

  if (normalized.length > 64) {
    return fail('طول الباركود يتجاوز 64 حرفاً')
  }

  return ok(normalized)
}

/**
 * Parses multiple barcodes separated by semicolon `;` or comma `,` or newline.
 */
export function parseBarcodesList(val: unknown): ParseResult<string[]> {
  if (val === null || val === undefined) return ok([])

  if (detectScientificNotation(val)) {
    return fail('الباركود تحوّل لرقم علمي في إكسل، اجعل العمود نص')
  }

  const raw = String(val).trim()
  if (raw.length === 0) return ok([])

  // Split on semicolon, comma, or newline
  const parts = raw.split(/[;,\n\r]+/u)
  const barcodes: string[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.length === 0) continue

    const res = normalizeBarcode(trimmed)
    if (!res.ok) return res

    if (!seen.has(res.value)) {
      seen.add(res.value)
      barcodes.push(res.value)
    }
  }

  return ok(barcodes)
}

/**
 * Parses a price or cost in Egyptian Pounds (EGP) into integer piasters
 * using pure string arithmetic without float multiplication.
 *
 * e.g. "12.5" -> 1250 piasters. "12,50" -> 1250 piasters.
 */
export function parsePiasters(
  val: unknown,
  options?: { allowNegative?: boolean; allowEmptyZero?: boolean },
): ParseResult<number> {
  if (val === null || val === undefined) {
    return options?.allowEmptyZero ? ok(0) : fail('السعر مطلوب')
  }

  let text: string
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return fail('قيمة رقمية غير صالحة')
    // Round to 2 decimal places as string
    text = val.toFixed(2)
  } else {
    text = normalizeDigits(String(val))
      .trim()
      .replace(/,/g, '.')
      .replace('٫', '.')
      .replace(/\s/g, '')
  }

  if (text.length === 0) {
    return options?.allowEmptyZero ? ok(0) : fail('السعر مطلوب')
  }

  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) {
    return fail('صيغة السعر غير صحيحة (مثال: 12.50)')
  }

  const isNegative = text.startsWith('-')
  if (isNegative && !options?.allowNegative) {
    return fail('لا يمكن أن يكون السعر أقل من صفر')
  }

  const unsigned = isNegative ? text.slice(1) : text
  const [whole, fraction = ''] = unsigned.split('.')
  const piasters = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))

  if (!Number.isSafeInteger(piasters)) {
    return fail('قيمة السعر تتجاوز الحد المسموح به')
  }

  return ok(isNegative ? -piasters : piasters)
}

/**
 * Parses an integer quantity or decimal weight.
 * - For qtyScale = 0: integer pieces.
 * - For qtyScale = 3: kilograms with up to 3 decimal places, stored in grams.
 */
export function parseQuantity(val: unknown, qtyScale: 0 | 3): ParseResult<number> {
  if (val === null || val === undefined) return ok(0)

  let text: string
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return fail('كمية غير صالحة')
    text = qtyScale === 3 ? val.toFixed(3) : String(Math.floor(val))
  } else {
    text = normalizeDigits(String(val))
      .trim()
      .replace(/,/g, '.')
      .replace('٫', '.')
      .replace(/\s/g, '')
  }

  if (text.length === 0) return ok(0)

  if (qtyScale === 0) {
    if (!/^\d+$/.test(text)) {
      return fail('الكمية يجب أن تكون عدداً صحيحاً للوحدات غير الموزونة')
    }
    const n = Number(text)
    if (!Number.isSafeInteger(n)) return fail('قيمة الكمية تتجاوز الحد الأقصى')
    return ok(n)
  }

  // qtyScale = 3 (weighed in kg, stored in grams)
  if (!/^\d+(\.\d{1,3})?$/.test(text)) {
    return fail('الوزن بالكجم يجب ألا يتجاوز 3 خانات عشرية (مثال: 1.250)')
  }

  const [whole, fraction = ''] = text.split('.')
  const grams = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'))

  if (!Number.isSafeInteger(grams)) return fail('قيمة الوزن تتجاوز الحد الأقصى')
  return ok(grams)
}

/**
 * Parses boolean yes/no flags in Arabic and English.
 */
export function parseBooleanFlag(val: unknown): boolean {
  if (typeof val === 'boolean') return val
  if (typeof val === 'number') return val === 1

  const text = normalizeText(val).toLowerCase()
  return ['نعم', 'true', 'yes', 'صحيح', '1', 'on'].includes(text)
}

/**
 * Parses product type (counted vs weighed) and defaults unit name.
 */
export function parseProductType(val: unknown): {
  isWeighted: boolean
  qtyScale: 0 | 3
  priceUnitQtyBase: number
  defaultUnitName: string
} {
  const text = normalizeText(val).toLowerCase()
  if (text.includes('وزن') || text.includes('weigh') || text.includes('كجم') || text.includes('كيلو')) {
    return {
      isWeighted: true,
      qtyScale: 3,
      priceUnitQtyBase: 1000,
      defaultUnitName: 'كجم',
    }
  }

  return {
    isWeighted: false,
    qtyScale: 0,
    priceUnitQtyBase: 1,
    defaultUnitName: 'قطعة',
  }
}
