/**
 * The i18n entry point. `ar.json` is the only place a user-visible string may
 * live (AGENTS.md §1, design system §5) — components import `messages` and never
 * spell Arabic text inline.
 *
 * There is no plural/gender machinery on purpose: Arabic UI copy in this app is
 * short, fixed phrases, and a hand-written phrase always beats a wrong
 * auto-generated plural. If a sentence needs a number, put the number in it.
 */
import ar from './ar.json'

/** Every user-visible string, typed from the JSON file. */
export const messages = ar

/**
 * Resolves a dotted key such as `errors.insufficient_stock` to its Arabic text.
 *
 * The main process sends error *codes*, not Arabic, so this is the one place an
 * error becomes a sentence. A missing key is a bug, but not one worth breaking
 * the screen over: the caller gets a generic "unexpected error" message rather
 * than an empty red box.
 */
export function translate(key: string, fallback: string = messages.errors.internal_error): string {
  let node: unknown = ar as unknown
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return fallback
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : fallback
}
