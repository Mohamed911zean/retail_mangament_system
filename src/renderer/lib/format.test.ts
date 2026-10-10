import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyParts,
  formatQty,
  formatQtyValue,
  formatTime,
  parseMoneyToPiasters,
  parseQtyToUnits,
  unitsPerDisplayUnit,
} from './format'

describe('formatMoney', () => {
  // Hand-checked: 1250 piasters / 100 = 12 EGP with a remainder of 50 piasters,
  // so the display is "12.50 ج.م".
  it('renders integer piasters as two decimals', () => {
    expect(formatMoney(1250)).toBe('12.50 ج.م')
  })

  it('keeps a whole pound amount at two decimals', () => {
    expect(formatMoney(1200)).toBe('12.00 ج.م')
  })

  it('renders zero', () => {
    expect(formatMoney(0)).toBe('0.00 ج.م')
  })

  it('renders an amount below one pound with a leading zero', () => {
    expect(formatMoney(5)).toBe('0.05 ج.م')
  })

  it('renders a negative balance with a leading minus', () => {
    // -500 piasters = -5.00 (the shop owes the customer).
    expect(formatMoney(-500)).toBe('-5.00 ج.م')
  })

  it('switches to Arabic-Indic digits on request without moving the minus', () => {
    expect(formatMoney(-500, 'arabic')).toBe('-٥.٠٠ ج.م')
  })

  it('refuses a fractional piaster value instead of rounding silently', () => {
    expect(() => formatMoney(12.5)).toThrow(/integer piasters/u)
  })

  it('splits the number from the currency for separate styling', () => {
    expect(formatMoneyParts(1250)).toEqual({ amount: '12.50', currency: 'ج.م' })
  })
})

describe('formatQty', () => {
  it.each([1, 2, 9])('renders a counted quantity as a plain integer (scale %i)', () => {
    expect(formatQty(7, 0, 'قطعة')).toBe('7 قطعة')
  })

  it('renders thousandths as a decimal weight', () => {
    // qtyScale 3, so the stored integer is grams: 1500 g = 1.5 kg.
    expect(formatQty(1500, 3, 'كجم')).toBe('1.5 كجم')
  })

  it('drops trailing zeros for a whole weight', () => {
    expect(formatQty(2000, 3, 'كجم')).toBe('2 كجم')
  })

  it('keeps three decimals when they carry meaning', () => {
    // 1505 g = 1.505 kg.
    expect(formatQty(1505, 3, 'كجم')).toBe('1.505 كجم')
  })

  it('renders a weight below one unit', () => {
    // 5 g = 0.005 kg.
    expect(formatQty(5, 3, 'كجم')).toBe('0.005 كجم')
  })

  it('renders a negative quantity (a return) with a leading minus', () => {
    expect(formatQty(-1500, 3, 'كجم')).toBe('-1.5 كجم')
  })

  it('omits the unit when there is no unit name', () => {
    expect(formatQty(3, 0, '')).toBe('3')
  })

  it('reports the stored units per display unit', () => {
    expect(unitsPerDisplayUnit(0)).toBe(1)
    expect(unitsPerDisplayUnit(3)).toBe(1000)
  })

  it('refuses a fractional stored quantity', () => {
    expect(() => formatQty(1.5, 3, 'كجم')).toThrow(/integer/u)
  })
})

describe('formatQtyValue', () => {
  it('drops the unit name so a quantity field can supply its own', () => {
    expect(formatQtyValue(1500, 3)).toBe('1.5')
    expect(formatQtyValue(7, 0)).toBe('7')
  })
})

describe('parseQtyToUnits', () => {
  it('converts a typed weight into thousandths', () => {
    // 1.5 kg = 1500 g, stored as 1500 at qtyScale 3.
    expect(parseQtyToUnits('1.5', 3)).toBe(1500)
  })

  it('accepts a whole weight', () => {
    expect(parseQtyToUnits('2', 3)).toBe(2000)
  })

  it('accepts the maximum precision of the scale', () => {
    expect(parseQtyToUnits('1.505', 3)).toBe(1505)
  })

  it('accepts Arabic-Indic digits and the Arabic decimal separator', () => {
    expect(parseQtyToUnits('١٫٥', 3)).toBe(1500)
  })

  it('rejects a fraction when the product is counted in whole pieces', () => {
    // qtyScale 0 stores pieces; silently truncating 1.5 to 1 would lose money.
    expect(parseQtyToUnits('1.5', 0)).toBeNull()
  })

  it('rejects more decimals than the scale can store', () => {
    expect(parseQtyToUnits('1.5005', 3)).toBeNull()
  })

  it('rejects empty and non-numeric text', () => {
    expect(parseQtyToUnits('', 3)).toBeNull()
    expect(parseQtyToUnits('abc', 3)).toBeNull()
    expect(parseQtyToUnits('.5', 3)).toBeNull()
  })

  it('keeps a negative sign (a return)', () => {
    expect(parseQtyToUnits('-1.5', 3)).toBe(-1500)
  })

  it('round-trips through formatQtyValue', () => {
    const units = parseQtyToUnits('0.75', 3)
    expect(units).toBe(750)
    expect(formatQtyValue(units ?? 0, 3)).toBe('0.75')
  })
})

describe('parseMoneyToPiasters', () => {
  it('converts a decimal amount to piasters', () => {
    expect(parseMoneyToPiasters('12.50')).toBe(1250)
  })

  it('treats one decimal place as tens of piasters', () => {
    // 12.5 EGP = 12 EGP + 50 piasters = 1250.
    expect(parseMoneyToPiasters('12.5')).toBe(1250)
  })

  it('accepts a whole amount', () => {
    expect(parseMoneyToPiasters('12')).toBe(1200)
  })

  it('accepts Arabic-Indic digits and the Arabic decimal separator', () => {
    expect(parseMoneyToPiasters('١٢٫٥')).toBe(1250)
  })

  it('rejects more than two decimals rather than rounding', () => {
    expect(parseMoneyToPiasters('12.505')).toBeNull()
  })

  it('rejects empty and non-numeric text', () => {
    expect(parseMoneyToPiasters('')).toBeNull()
    expect(parseMoneyToPiasters('١٢abc')).toBeNull()
    expect(parseMoneyToPiasters('.5')).toBeNull()
  })

  it('keeps a negative amount sign', () => {
    expect(parseMoneyToPiasters('-5')).toBe(-500)
  })

  it('round-trips through formatMoney', () => {
    const piasters = parseMoneyToPiasters('99.99')
    expect(piasters).toBe(9999)
    expect(formatMoney(piasters ?? 0)).toBe('99.99 ج.م')
  })
})

describe('date formatting', () => {
  // 2026-10-09 14:05 local time.
  const epoch = new Date(2026, 9, 9, 14, 5, 0).getTime()

  it('renders the Gregorian date as yyyy/mm/dd', () => {
    expect(formatDate(epoch)).toBe('2026/10/09')
  })

  it('renders a 12-hour clock with the afternoon marker', () => {
    expect(formatTime(epoch)).toBe('2:05 م')
  })

  it('renders midnight as 12 ص, not 0 ص', () => {
    expect(formatTime(new Date(2026, 9, 9, 0, 30).getTime())).toBe('12:30 ص')
  })

  it('renders noon as 12 م', () => {
    expect(formatTime(new Date(2026, 9, 9, 12, 0).getTime())).toBe('12:00 م')
  })

  it('combines date and time', () => {
    expect(formatDateTime(epoch)).toBe('2026/10/09 2:05 م')
  })
})

describe('formatBytes', () => {
  it('shows plain bytes below one kilobyte', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('converts to kilobytes at 1024', () => {
    // 2048 bytes / 1024 = 2 KB.
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('rounds to one decimal', () => {
    // 1536 / 1024 = 1.5 KB.
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('converts to megabytes past 1024 KB', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('refuses a negative size instead of printing nonsense', () => {
    expect(() => formatBytes(-1)).toThrow(/non-negative/u)
  })
})
