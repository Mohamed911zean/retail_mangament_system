import { describe, expect, it } from 'vitest'
import { messages, translate } from './index'

describe('translate', () => {
  it('resolves a dotted key to the same string the JSON holds', () => {
    expect(translate('errors.insufficient_stock')).toBe(messages.errors.insufficient_stock)
  })

  it('resolves a nested key two levels deep', () => {
    expect(translate('auth.login')).toBe(messages.auth.login)
  })

  it('falls back to the generic error for an unknown key', () => {
    // A missing key is a bug, but the screen must still say something useful.
    expect(translate('errors.this_code_does_not_exist')).toBe(messages.errors.internal_error)
  })

  it('falls back when the key points at a branch, not a string', () => {
    expect(translate('errors')).toBe(messages.errors.internal_error)
  })

  it('accepts an explicit fallback', () => {
    expect(translate('nope.nothing', 'نص بديل')).toBe('نص بديل')
  })

  it('never returns an empty string from a defined key', () => {
    expect(translate('common.currency').length).toBeGreaterThan(0)
  })
})
