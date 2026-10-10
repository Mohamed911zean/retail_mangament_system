import { describe, expect, it } from 'vitest'
import { formatDigits, normalizeDigits } from './digits'

// Arabic-Indic (U+0660-U+0669) and Extended Arabic-Indic (U+06F0-U+06F9) are the
// two digit sets an Arabic keyboard can produce. Both must fold into ASCII.
const arabicIndic = '٠١٢٣٤٥٦٧٨٩'
const extendedArabicIndic = '۰۱۲۳۴۵۶۷۸۹'

describe('normalizeDigits', () => {
  it('converts Arabic-Indic digits to Western digits', () => {
    expect(normalizeDigits(arabicIndic)).toBe('0123456789')
  })

  it('converts Extended Arabic-Indic digits to Western digits', () => {
    expect(normalizeDigits(extendedArabicIndic)).toBe('0123456789')
  })

  it('leaves Western digits and Arabic letters untouched', () => {
    expect(normalizeDigits('سعر 12.50 ج.م')).toBe('سعر 12.50 ج.م')
  })

  it('normalizes digits inside a mixed string', () => {
    expect(normalizeDigits('باركود ١٢٣٤')).toBe('باركود 1234')
  })

  it('returns an empty string for an empty input', () => {
    expect(normalizeDigits('')).toBe('')
  })

  it('does not touch characters directly outside the digit ranges', () => {
    // U+066A ARABIC PERCENT SIGN and U+06F9+1 (U+06FA) must survive unchanged.
    expect(normalizeDigits('٪')).toBe('٪')
    expect(normalizeDigits('ۺ')).toBe('ۺ')
  })
})

describe('formatDigits', () => {
  it('is a no-op in the default western style', () => {
    expect(formatDigits('1250')).toBe('1250')
  })

  it('converts Western digits to Arabic-Indic on request', () => {
    expect(formatDigits('1250', 'arabic')).toBe('١٢٥٠')
  })

  it('keeps separators when converting', () => {
    expect(formatDigits('12.50', 'arabic')).toBe('١٢.٥٠')
  })
})
