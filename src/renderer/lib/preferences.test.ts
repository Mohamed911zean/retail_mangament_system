import { describe, expect, it } from 'vitest'
import { defaultPreferences, parsePreferences } from './preferences'

describe('parsePreferences', () => {
  it('returns the defaults when nothing was ever stored', () => {
    expect(parsePreferences(null)).toEqual(defaultPreferences)
  })

  it('reads a stored preference back', () => {
    expect(parsePreferences(JSON.stringify({ liteMode: true, digitStyle: 'arabic' }))).toEqual({
      liteMode: true,
      digitStyle: 'arabic',
      receiptPrinter: '',
      autoPrintReceipt: true,
    })
  })

  it('survives a corrupted value instead of throwing at boot', () => {
    expect(parsePreferences('{not json')).toEqual(defaultPreferences)
    expect(parsePreferences('"a string"')).toEqual(defaultPreferences)
    expect(parsePreferences('null')).toEqual(defaultPreferences)
  })

  it('ignores fields of the wrong type and keeps the rest', () => {
    // A hand-edited store, or a value written by a future version.
    expect(parsePreferences(JSON.stringify({ liteMode: 'yes', digitStyle: 'arabic' }))).toEqual({
      liteMode: false,
      digitStyle: 'arabic',
      receiptPrinter: '',
      autoPrintReceipt: true,
    })
  })

  it('rejects an unknown digit style rather than passing it through', () => {
    expect(parsePreferences(JSON.stringify({ digitStyle: 'klingon' })).digitStyle).toBe('western')
  })

  it('fills in a field that a partial value is missing', () => {
    expect(parsePreferences(JSON.stringify({ liteMode: true }))).toEqual({
      liteMode: true,
      digitStyle: 'western',
      receiptPrinter: '',
      autoPrintReceipt: true,
    })
  })

  it('remembers the chosen receipt printer, empty meaning none chosen yet', () => {
    expect(parsePreferences(JSON.stringify({ receiptPrinter: 'EPSON TM-T20' })).receiptPrinter).toBe('EPSON TM-T20')
    expect(parsePreferences(JSON.stringify({ receiptPrinter: '' })).receiptPrinter).toBe('')
  })

  it('drops a printer name that is not a string rather than printing to nowhere', () => {
    expect(parsePreferences(JSON.stringify({ receiptPrinter: 42 })).receiptPrinter).toBe('')
  })

  it('keeps auto-print on by default but honours a stored off', () => {
    // Auto-print is the shop's normal behaviour, so an absent value means on.
    expect(parsePreferences(JSON.stringify({})).autoPrintReceipt).toBe(true)
    expect(parsePreferences(JSON.stringify({ autoPrintReceipt: false })).autoPrintReceipt).toBe(false)
    expect(parsePreferences(JSON.stringify({ autoPrintReceipt: 'no' })).autoPrintReceipt).toBe(true)
  })
})
