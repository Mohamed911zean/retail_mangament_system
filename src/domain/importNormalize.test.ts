import { describe, expect, it } from 'vitest'
import {
  detectScientificNotation,
  normalizeBarcode,
  normalizeText,
  parseBarcodesList,
  parseBooleanFlag,
  parsePiasters,
  parseProductType,
  parseQuantity,
} from './importNormalize'

describe('importNormalize domain module', () => {
  describe('normalizeText', () => {
    it('trims whitespace and folds Arabic-Indic digits to Western', () => {
      expect(normalizeText('  سعر ١٢٥.٥٠  ')).toBe('سعر 125.50')
      expect(normalizeText(null)).toBe('')
      expect(normalizeText(undefined)).toBe('')
    })
  })

  describe('detectScientificNotation', () => {
    it('detects scientific notation strings produced by Excel', () => {
      expect(detectScientificNotation('6.22E+12')).toBe(true)
      expect(detectScientificNotation('6.22e12')).toBe(true)
      expect(detectScientificNotation('1.5E-3')).toBe(true)
      expect(detectScientificNotation('+2.4E+10')).toBe(true)
    })

    it('returns false for normal barcodes and text', () => {
      expect(detectScientificNotation('6221234567890')).toBe(false)
      expect(detectScientificNotation('0123456789')).toBe(false)
      expect(detectScientificNotation('ITEM-123')).toBe(false)
      expect(detectScientificNotation('')).toBe(false)
      expect(detectScientificNotation(null)).toBe(false)
    })
  })

  describe('normalizeBarcode', () => {
    it('preserves leading zeros and Westernizes digits', () => {
      const res = normalizeBarcode('  ٠٠١٢٣٤٥  ')
      expect(res.ok).toBe(true)
      if (res.ok) expect(res.value).toBe('0012345')
    })

    it('rejects scientific notation with clear Arabic message', () => {
      const res = normalizeBarcode('6.22E+12')
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error).toBe('الباركود تحوّل لرقم علمي في إكسل، اجعل العمود نص')
      }
    })

    it('rejects empty or whitespace-only barcodes', () => {
      const res = normalizeBarcode('   ')
      expect(res.ok).toBe(false)
    })
  })

  describe('parseBarcodesList', () => {
    it('splits on semicolons, commas, and newlines and deduplicates', () => {
      const res = parseBarcodesList('622111; 622222, 622333\n622111')
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.value).toEqual(['622111', '622222', '622333'])
      }
    })

    it('handles empty input gracefully', () => {
      const res = parseBarcodesList('')
      expect(res.ok).toBe(true)
      if (res.ok) expect(res.value).toEqual([])
    })

    it('flags scientific notation in any part', () => {
      const res = parseBarcodesList('622111; 6.22E+12')
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('رقم علمي')
    })
  })

  describe('parsePiasters', () => {
    it('parses whole and decimal prices without float roundoff', () => {
      // 12.50 EGP = 1250 piasters
      expect(parsePiasters('12.5')).toEqual({ ok: true, value: 1250 })
      expect(parsePiasters('12.50')).toEqual({ ok: true, value: 1250 })
      expect(parsePiasters('12,50')).toEqual({ ok: true, value: 1250 })
      expect(parsePiasters('١٢٫٥٠')).toEqual({ ok: true, value: 1250 })
      expect(parsePiasters('100')).toEqual({ ok: true, value: 10000 })
      expect(parsePiasters('0.75')).toEqual({ ok: true, value: 75 })
      expect(parsePiasters('0.05')).toEqual({ ok: true, value: 5 })
      expect(parsePiasters(25.5)).toEqual({ ok: true, value: 2550 })
    })

    it('rejects negative values when not allowed', () => {
      const res = parsePiasters('-10')
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toBe('لا يمكن أن يكون السعر أقل من صفر')
    })

    it('allows negative values when option is set', () => {
      expect(parsePiasters('-10.25', { allowNegative: true })).toEqual({ ok: true, value: -1025 })
    })

    it('handles empty / zero depending on options', () => {
      expect(parsePiasters('', { allowEmptyZero: true })).toEqual({ ok: true, value: 0 })
      expect(parsePiasters('', { allowEmptyZero: false }).ok).toBe(false)
    })
  })

  describe('parseQuantity', () => {
    it('parses piece quantities (qtyScale = 0)', () => {
      expect(parseQuantity('15', 0)).toEqual({ ok: true, value: 15 })
      expect(parseQuantity('١٥', 0)).toEqual({ ok: true, value: 15 })
      expect(parseQuantity(15, 0)).toEqual({ ok: true, value: 15 })
      // Rejects decimals for whole pieces
      expect(parseQuantity('1.5', 0).ok).toBe(false)
    })

    it('parses weighed quantities in kilograms to grams (qtyScale = 3)', () => {
      // 1.5 kg = 1500 g
      expect(parseQuantity('1.5', 3)).toEqual({ ok: true, value: 1500 })
      expect(parseQuantity('0.350', 3)).toEqual({ ok: true, value: 350 })
      expect(parseQuantity('2', 3)).toEqual({ ok: true, value: 2000 })
      expect(parseQuantity(2.5, 3)).toEqual({ ok: true, value: 2500 })
      // Rejects more than 3 decimal digits
      expect(parseQuantity('1.2345', 3).ok).toBe(false)
    })
  })

  describe('parseBooleanFlag', () => {
    it('recognizes various Arabic and English affirmations', () => {
      expect(parseBooleanFlag('نعم')).toBe(true)
      expect(parseBooleanFlag('صحيح')).toBe(true)
      expect(parseBooleanFlag('true')).toBe(true)
      expect(parseBooleanFlag('yes')).toBe(true)
      expect(parseBooleanFlag(1)).toBe(true)
      expect(parseBooleanFlag('1')).toBe(true)

      expect(parseBooleanFlag('لا')).toBe(false)
      expect(parseBooleanFlag('false')).toBe(false)
      expect(parseBooleanFlag(0)).toBe(false)
      expect(parseBooleanFlag('')).toBe(false)
    })
  })

  describe('parseProductType', () => {
    it('recognizes weighed products', () => {
      const res = parseProductType('بالوزن')
      expect(res.isWeighted).toBe(true)
      expect(res.qtyScale).toBe(3)
      expect(res.priceUnitQtyBase).toBe(1000)
      expect(res.defaultUnitName).toBe('كجم')
    })

    it('recognizes counted products', () => {
      const res = parseProductType('عادي')
      expect(res.isWeighted).toBe(false)
      expect(res.qtyScale).toBe(0)
      expect(res.priceUnitQtyBase).toBe(1)
      expect(res.defaultUnitName).toBe('قطعة')
    })
  })
})
