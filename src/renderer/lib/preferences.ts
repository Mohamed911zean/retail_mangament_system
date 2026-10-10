/**
 * UI-only preferences.
 *
 * These are *not* business settings: nothing here changes money, stock or
 * documents, so they do not belong in the database (which would mean a migration
 * and a backup every time someone flips a switch). They live in the renderer's
 * `localStorage`, which Electron stores in the app's userData folder and keeps
 * across restarts.
 *
 * The parse step is pure so it can be unit tested in Node, where there is no
 * `localStorage` — a corrupted or stale value must never stop the app booting.
 */
import type { DigitStyle } from './format'

export type Preferences = {
  /** §3.4: disables transitions and shadows for very weak PCs. */
  liteMode: boolean
  /** §3.3: Western digits by default; a shop may prefer Arabic-Indic. */
  digitStyle: DigitStyle
  /**
   * The Windows printer a receipt goes to, by driver name; empty until the shop
   * picks one. It lives here rather than in the database because it is a property
   * of *this* PC's driver list, not of the shop's books — and because it must
   * never require a migration and a backup.
   */
  receiptPrinter: string
  /** §7: print the receipt as soon as a sale is saved, without a second click. */
  autoPrintReceipt: boolean
}

export const defaultPreferences: Preferences = {
  liteMode: false,
  digitStyle: 'western',
  receiptPrinter: '',
  autoPrintReceipt: true,
}

const STORAGE_KEY = 'small_erp.preferences.v1'

/** Parses whatever was in storage; anything unknown falls back to the default. */
export function parsePreferences(raw: string | null): Preferences {
  if (raw === null) return { ...defaultPreferences }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ...defaultPreferences }
  }

  if (typeof value !== 'object' || value === null) return { ...defaultPreferences }
  const candidate = value as Record<string, unknown>
  return {
    liteMode: typeof candidate.liteMode === 'boolean' ? candidate.liteMode : defaultPreferences.liteMode,
    digitStyle: candidate.digitStyle === 'arabic' ? 'arabic' : 'western',
    receiptPrinter: typeof candidate.receiptPrinter === 'string' ? candidate.receiptPrinter : defaultPreferences.receiptPrinter,
    autoPrintReceipt:
      typeof candidate.autoPrintReceipt === 'boolean' ? candidate.autoPrintReceipt : defaultPreferences.autoPrintReceipt,
  }
}

export function readPreferences(): Preferences {
  try {
    return parsePreferences(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return { ...defaultPreferences }
  }
}

export function writePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // A full or disabled store must not break the screen the user is on.
  }
}

/**
 * Applies the parts of the preferences that CSS owns. Lite mode is a single
 * attribute on `<html>`; every token that needs to change already reacts to it.
 */
export function applyPreferences(preferences: Preferences): void {
  document.documentElement.dataset.lite = preferences.liteMode ? 'true' : 'false'
}
