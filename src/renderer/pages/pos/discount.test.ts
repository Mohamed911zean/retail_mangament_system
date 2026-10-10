import { describe, expect, it } from 'vitest'
import { parsePercentToBps } from './discount'

describe('parsePercentToBps', () => {
  it('reads whole and fractional percentages into basis points', () => {
    expect(parsePercentToBps('5')).toBe(500)
    expect(parsePercentToBps('5.5')).toBe(550)
    expect(parsePercentToBps('12.55')).toBe(1255)
    expect(parsePercentToBps('100')).toBe(10000)
  })

  it('accepts Arabic-Indic digits and the Arabic decimal separator', () => {
    expect(parsePercentToBps('٥')).toBe(500)
    expect(parsePercentToBps('5٫5')).toBe(550)
  })

  it('trims surrounding whitespace', () => {
    expect(parsePercentToBps(' 5 ')).toBe(500)
  })

  it('refuses zero, over-100%, over-precise and non-numeric input', () => {
    expect(parsePercentToBps('')).toBeNull()
    expect(parsePercentToBps('0')).toBeNull()
    expect(parsePercentToBps('abc')).toBeNull()
    expect(parsePercentToBps('101')).toBeNull()
    expect(parsePercentToBps('100.01')).toBeNull()
    expect(parsePercentToBps('5.555')).toBeNull()
  })
})
