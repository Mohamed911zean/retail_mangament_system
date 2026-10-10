/**
 * Contrast gate (design system §3.2 / §10).
 *
 * Reads the colour tokens straight out of `src/renderer/styles/tokens.css`, so
 * changing a value in the stylesheet — or in a client overlay — is checked here
 * rather than discovered by a shop owner squinting at a receipt screen.
 *
 * Run with `npm run check:contrast`. Exits non-zero on any failing pair, so it
 * can be wired into the build later without changing this file.
 *
 * Only *text* pairs fail the build. Control borders are deliberately excluded:
 * §3.2 accepts `gray-400` at 2.56:1 as a border because the control is also
 * white-filled and carries a 3:1 focus ring — a border is not read as text.
 */
import { readFileSync } from 'node:fs'

type Pair = {
  fg: string
  bg: string
  /** Minimum ratio: 4.5 for body text, 3 for large text (≥ 24px or ≥ 19px bold). */
  min: number
  label: string
}

const TOKENS_PATH = 'src/renderer/styles/tokens.css'

/** `--name: #rrggbb;` → name/hex, ignoring comments and non-hex values. */
function readTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>()
  const pattern = /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/gu
  for (const match of css.matchAll(pattern)) tokens.set(match[1], match[2].toLowerCase())
  return tokens
}

function channel(value: number): number {
  const normalized = value / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

const PAIRS: Pair[] = [
  // Body text on the two backgrounds a page actually uses.
  { fg: '--gray-900', bg: '--gray-0', min: 4.5, label: 'main text on white' },
  { fg: '--gray-900', bg: '--bg-app', min: 4.5, label: 'main text on app background' },
  { fg: '--gray-800', bg: '--gray-0', min: 4.5, label: 'strong text on white' },
  { fg: '--gray-600', bg: '--gray-0', min: 4.5, label: 'secondary text on white' },
  { fg: '--gray-500', bg: '--gray-0', min: 4.5, label: 'muted text / placeholder on white' },
  { fg: '--gray-600', bg: '--gray-100', min: 4.5, label: 'secondary text on table header' },

  // Primary button and brand surfaces.
  { fg: '--gray-0', bg: '--brand-700', min: 4.5, label: 'white on primary button' },
  { fg: '--gray-0', bg: '--brand-800', min: 4.5, label: 'white on primary hover' },
  { fg: '--gray-0', bg: '--brand-900', min: 4.5, label: 'white on primary pressed' },
  { fg: '--gray-0', bg: '--brand-600', min: 4.5, label: 'white on link / focus' },
  { fg: '--brand-700', bg: '--brand-100', min: 4.5, label: 'brand text on secondary button' },
  { fg: '--brand-700', bg: '--brand-50', min: 4.5, label: 'brand text on active nav item' },

  // Status: solid fill with white text, and the soft badge/alert pairs.
  { fg: '--gray-0', bg: '--success-solid', min: 4.5, label: 'white on success' },
  { fg: '--success-soft-text', bg: '--success-soft-bg', min: 4.5, label: 'success badge text' },
  { fg: '--gray-900', bg: '--warning-solid', min: 4.5, label: 'dark text on warning (amber)' },
  { fg: '--warning-soft-text', bg: '--warning-soft-bg', min: 4.5, label: 'warning badge text' },
  { fg: '--gray-0', bg: '--error-solid', min: 4.5, label: 'white on error' },
  { fg: '--error-soft-text', bg: '--error-soft-bg', min: 4.5, label: 'error text' },
  { fg: '--gray-0', bg: '--info-solid', min: 4.5, label: 'white on info' },
  { fg: '--info-soft-text', bg: '--info-soft-bg', min: 4.5, label: 'info badge text' },
]

const tokens = readTokens(readFileSync(TOKENS_PATH, 'utf8'))
const failures: string[] = []

for (const pair of PAIRS) {
  const fg = tokens.get(pair.fg)
  const bg = tokens.get(pair.bg)
  if (fg === undefined || bg === undefined) {
    failures.push(`${pair.label}: token missing (${pair.fg} / ${pair.bg})`)
    continue
  }
  const ratio = contrast(fg, bg)
  const rounded = ratio.toFixed(2)
  const pass = ratio >= pair.min
  if (!pass) failures.push(`${pair.label}: ${rounded}:1 < ${pair.min}:1 (${fg} on ${bg})`)
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${rounded.padStart(5)}:1  (min ${pair.min})  ${pair.label}`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contrast failure(s):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`\nAll ${PAIRS.length} contrast pairs pass.`)
