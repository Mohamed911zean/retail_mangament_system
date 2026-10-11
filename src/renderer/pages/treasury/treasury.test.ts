import { describe, expect, it } from 'vitest'
import { reconciliationTone, signedDifference } from './treasury'

describe('reconciliationTone', () => {
  it('maps each reconciliation to a distinct tone', () => {
    expect(reconciliationTone('balanced')).toBe('success')
    expect(reconciliationTone('over')).toBe('info')
    expect(reconciliationTone('short')).toBe('warning')
  })
})

describe('signedDifference', () => {
  it('signs integer piasters without currency', () => {
    expect(signedDifference(0)).toBe('0')
    expect(signedDifference(250)).toBe('+250')
    expect(signedDifference(-250)).toBe('-250')
  })
})
