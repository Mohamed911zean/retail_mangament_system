import { normalizeDigits } from '../shared/digits'

/**
 * Normalizes a barcode string:
 * - Trims whitespace
 * - Converts Arabic-Indic and Persian digits to Western digits (0-9)
 * - Removes inner whitespace, hyphens, and underscores
 */
export function normalize(raw: string): string {
  if (!raw) return ''
  const trimmed = normalizeDigits(raw.trim())
  return trimmed.replace(/[\s\-_]/g, '')
}

export const normalizeBarcode = normalize

/** Standard GS1 barcode lengths that use the modulo-10 check digit algorithm */
export const STANDARD_BARCODE_LENGTHS = [8, 12, 13, 14] as const
export type StandardBarcodeLength = (typeof STANDARD_BARCODE_LENGTHS)[number]

/**
 * Calculates GS1 check digit for a string of numeric payload digits (without check digit).
 * Moving from right to left immediately before the check digit, weights alternate between 3 and 1.
 */
export function computeGs1CheckDigit(payload: string): number {
  if (!/^\d+$/.test(payload)) return -1
  let sum = 0
  let weight = 3
  for (let i = payload.length - 1; i >= 0; i--) {
    const digit = payload.charCodeAt(i) - 48
    sum += digit * weight
    weight = weight === 3 ? 1 : 3
  }
  return (10 - (sum % 10)) % 10
}

export type CheckDigitResult = 'valid' | 'invalid_check' | 'not_standard_length'

/**
 * Validates check digit of standard retail barcodes (EAN-8, UPC-A, EAN-13, GTIN-14).
 * Returns 'valid', 'invalid_check', or 'not_standard_length'.
 */
export function validateCheckDigit(code: string): CheckDigitResult {
  const normalized = normalize(code)
  if (!/^\d+$/.test(normalized)) {
    return 'not_standard_length'
  }
  if (!STANDARD_BARCODE_LENGTHS.includes(normalized.length as StandardBarcodeLength)) {
    return 'not_standard_length'
  }
  const payload = normalized.slice(0, -1)
  const actualCheck = normalized.charCodeAt(normalized.length - 1) - 48
  const expectedCheck = computeGs1CheckDigit(payload)
  return actualCheck === expectedCheck ? 'valid' : 'invalid_check'
}

/** Returns true if code has standard GS1 length (8, 12, 13, 14 digits) */
export function isStandardBarcodeLength(code: string): boolean {
  const normalized = normalize(code)
  return /^\d+$/.test(normalized) && STANDARD_BARCODE_LENGTHS.includes(normalized.length as StandardBarcodeLength)
}

/** Returns true if barcode has a standard length and passes the check digit */
export function isCheckDigitValid(code: string): boolean {
  return validateCheckDigit(code) === 'valid'
}

/** Converts 12-digit UPC-A to 13-digit EAN-13 with leading zero */
export function upcAToEan13(code: string): string {
  const normalized = normalize(code)
  if (normalized.length === 12 && /^\d{12}$/.test(normalized)) {
    return `0${normalized}`
  }
  return normalized
}
