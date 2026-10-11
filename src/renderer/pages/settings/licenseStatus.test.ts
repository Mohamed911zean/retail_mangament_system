import { describe, expect, it } from 'vitest'
import { licenseDaysLeft } from './licenseStatus'

const dayMs = 24 * 60 * 60 * 1000

describe('licenseDaysLeft', () => {
  it('rounds a partial day up to one', () => {
    expect(licenseDaysLeft(1000 * dayMs + 1, 1000 * dayMs)).toBe(1)
    expect(licenseDaysLeft(1000 * dayMs + dayMs, 1000 * dayMs)).toBe(1)
  })

  it('counts whole days and goes negative past expiry', () => {
    expect(licenseDaysLeft(1000 * dayMs + 10 * dayMs, 1000 * dayMs)).toBe(10)
    expect(licenseDaysLeft(1000 * dayMs - dayMs, 1000 * dayMs)).toBe(-1)
  })
})
