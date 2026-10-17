import { describe, expect, it } from 'vitest'
import {
  computeGs1CheckDigit,
  isCheckDigitValid,
  isStandardBarcodeLength,
  normalize,
  normalizeBarcode,
  upcAToEan13,
  validateCheckDigit,
} from './barcodeValidation'

describe('barcodeValidation', () => {
  describe('normalize', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalize('  6223001234567  ')).toBe('6223001234567')
    })

    it('converts Arabic-Indic digits to Western digits', () => {
      expect(normalize('٦٢٢٣٠٠١٢٣٤٥٦٧')).toBe('6223001234567')
    })

    it('converts Persian digits to Western digits', () => {
      expect(normalize('۶۲۲۳۰۰۱۲۳۴۵۶۷')).toBe('6223001234567')
    })

    it('removes spaces, dashes, and underscores', () => {
      expect(normalize('622-300_123 4567')).toBe('6223001234567')
    })

    it('handles empty or blank inputs safely', () => {
      expect(normalize('')).toBe('')
      expect(normalize('   ')).toBe('')
    })

    it('aliases normalizeBarcode to normalize', () => {
      expect(normalizeBarcode(' 12345 ')).toBe(normalize(' 12345 '))
    })
  })

  describe('computeGs1CheckDigit', () => {
    it('computes check digit for 12-digit EAN-13 payload (hand-checked vector 1)', () => {
      // '200012300350' -> check digit 4
      expect(computeGs1CheckDigit('200012300350')).toBe(4)
    })

    it('computes check digit for 12-digit EAN-13 payload (hand-checked vector 2)', () => {
      // '200012304200' -> check digit 8
      expect(computeGs1CheckDigit('200012304200')).toBe(8)
    })

    it('computes check digit for 11-digit UPC-A payload', () => {
      // '01234567890' -> check digit 5
      expect(computeGs1CheckDigit('01234567890')).toBe(5)
    })

    it('computes check digit for 7-digit EAN-8 payload', () => {
      // '9638507' -> check digit 4
      expect(computeGs1CheckDigit('9638507')).toBe(4)
    })

    it('computes check digit for 13-digit GTIN-14 payload', () => {
      // '1200012300350' -> check digit 1
      expect(computeGs1CheckDigit('1200012300350')).toBe(1)
    })

    it('returns -1 for non-numeric payload', () => {
      expect(computeGs1CheckDigit('1234ABC')).toBe(-1)
    })
  })

  describe('validateCheckDigit', () => {
    it('validates standard EAN-13 barcodes with correct check digit', () => {
      expect(validateCheckDigit('2000123003504')).toBe('valid')
      expect(validateCheckDigit('2000123042008')).toBe('valid')
      expect(validateCheckDigit('6223001234562')).toBe('valid')
    })

    it('validates EAN-13 with Arabic digits', () => {
      expect(validateCheckDigit('٢٠٠٠١٢٣٠٠٣٥٠٤')).toBe('valid')
    })

    it('detects invalid check digit on EAN-13', () => {
      expect(validateCheckDigit('2000123003505')).toBe('invalid_check')
      expect(validateCheckDigit('2000123042001')).toBe('invalid_check')
    })

    it('validates standard UPC-A barcodes (12 digits)', () => {
      expect(validateCheckDigit('012345678905')).toBe('valid')
      expect(validateCheckDigit('012345678906')).toBe('invalid_check')
    })

    it('validates standard EAN-8 barcodes (8 digits)', () => {
      expect(validateCheckDigit('96385074')).toBe('valid')
      expect(validateCheckDigit('96385079')).toBe('invalid_check')
    })

    it('validates GTIN-14 barcodes (14 digits)', () => {
      expect(validateCheckDigit('12000123003501')).toBe('valid')
      expect(validateCheckDigit('12000123003502')).toBe('invalid_check')
    })

    it('returns not_standard_length for non-standard lengths', () => {
      expect(validateCheckDigit('12345')).toBe('not_standard_length')
      expect(validateCheckDigit('1234567')).toBe('not_standard_length')
      expect(validateCheckDigit('123456789')).toBe('not_standard_length')
      expect(validateCheckDigit('12345678901')).toBe('not_standard_length')
      expect(validateCheckDigit('123456789012345')).toBe('not_standard_length')
      expect(validateCheckDigit('')).toBe('not_standard_length')
    })

    it('returns not_standard_length for barcodes with letters', () => {
      expect(validateCheckDigit('CODE128BARCODE')).toBe('not_standard_length')
    })
  })

  describe('isStandardBarcodeLength and isCheckDigitValid', () => {
    it('checks standard lengths correctly', () => {
      expect(isStandardBarcodeLength('2000123003504')).toBe(true)
      expect(isStandardBarcodeLength('012345678905')).toBe(true)
      expect(isStandardBarcodeLength('96385074')).toBe(true)
      expect(isStandardBarcodeLength('12000123003501')).toBe(true)
      expect(isStandardBarcodeLength('12345')).toBe(false)
    })

    it('checks check digit validity boolean', () => {
      expect(isCheckDigitValid('2000123003504')).toBe(true)
      expect(isCheckDigitValid('2000123003505')).toBe(false)
      expect(isCheckDigitValid('12345')).toBe(false)
    })
  })

  describe('upcAToEan13', () => {
    it('prepends leading zero to 12-digit UPC-A', () => {
      expect(upcAToEan13('012345678905')).toBe('0012345678905')
    })

    it('leaves 13-digit EAN-13 untouched', () => {
      expect(upcAToEan13('2000123003504')).toBe('2000123003504')
    })

    it('leaves non-12-digit barcodes unchanged', () => {
      expect(upcAToEan13('12345')).toBe('12345')
    })
  })
})
