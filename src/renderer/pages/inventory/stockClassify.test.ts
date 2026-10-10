import { describe, expect, it } from 'vitest'
import { classifyStock } from './stockClassify'

describe('classifyStock', () => {
  it('marks empty rows as out', () => {
    expect(classifyStock(0, 0, 10)).toBe('out')
  })

  it('sends negative quantities to review before anything else', () => {
    expect(classifyStock(-3, -300, 10)).toBe('review')
    expect(classifyStock(-3, 0, 0)).toBe('review')
  })

  it('sends positive quantities with no positive value to review', () => {
    expect(classifyStock(5, 0, 10)).toBe('review')
    expect(classifyStock(5, -100, 10)).toBe('review')
  })

  it('warns at or below a positive threshold', () => {
    expect(classifyStock(10, 1000, 10)).toBe('low')
    expect(classifyStock(5, 500, 10)).toBe('low')
    expect(classifyStock(11, 1100, 10)).toBe('ok')
  })

  it('ignores a zero threshold', () => {
    expect(classifyStock(1, 100, 0)).toBe('ok')
  })
})
