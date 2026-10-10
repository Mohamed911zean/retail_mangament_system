import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { arabicServiceMessages } from '../services/messages-ar'

/**
 * AGENTS.md §3 rule 7: every user-visible failure must show a clear Arabic
 * message. Services report failures through `serviceErr` with a code, which
 * becomes the i18n key `errors.<code>`; this test walks the main-process sources
 * and fails when a code is raised that has no Arabic text behind it, so a new
 * error can never reach the cashier as a raw key.
 */

const mainRoot = join(process.cwd(), 'src', 'main')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return []
    return [path]
  })
}

/** Placeholders used in doc comments, e.g. a doc that writes `serviceErr('code')`. */
const PLACEHOLDERS = new Set(['code'])

/** Every error code raised through `serviceErr` anywhere in the main process. */
function raisedErrorCodes(): Set<string> {
  const codes = new Set<string>()
  const pattern = /serviceErr\(\s*'([a-z_]+)'/gu
  for (const file of sourceFiles(mainRoot)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(pattern)) {
      if (!PLACEHOLDERS.has(match[1])) codes.add(match[1])
    }
  }
  return codes
}

/** Codes the IPC runner raises itself, which never pass through `serviceErr`. */
const runnerCodes = ['not_authenticated', 'read_only_mode', 'internal_error', 'unknown_channel']

const arabic = JSON.parse(readFileSync(join(process.cwd(), 'src', 'renderer', 'i18n', 'ar.json'), 'utf8')) as {
  errors: Record<string, string>
}

describe('Arabic error messages', () => {
  it('finds service error codes to check', () => {
    expect(raisedErrorCodes().size).toBeGreaterThan(20)
  })

  it('has an Arabic message for every error code the app can show', () => {
    const missing = [...raisedErrorCodes(), ...runnerCodes].filter((code) => {
      const text = arabic.errors[code]
      return typeof text !== 'string' || text.trim().length === 0
    })
    expect(missing, `missing errors.* entries in src/renderer/i18n/ar.json: ${missing.join(', ')}`).toEqual([])
  })

  it('never leaves an English placeholder in an Arabic message', () => {
    for (const [code, text] of Object.entries(arabic.errors)) {
      expect(/[A-Za-z]{3,}/u.test(text), `errors.${code} is not Arabic: ${text}`).toBe(false)
    }
  })

  it('keeps the main-process message table in sync with ar.json', () => {
    for (const [key, text] of Object.entries(arabicServiceMessages)) {
      const code = key.replace('errors.', '')
      expect(arabic.errors[code], `ar.json is missing ${key}`).toBe(text)
    }
    // and the other way around, so a code added to one file cannot be forgotten
    const table = new Set(Object.keys(arabicServiceMessages))
    const missing = [...raisedErrorCodes()].filter((code) => !table.has(`errors.${code}`))
    expect(missing, `src/main/services/messages-ar.ts is missing: ${missing.join(', ')}`).toEqual([])
  })
})
