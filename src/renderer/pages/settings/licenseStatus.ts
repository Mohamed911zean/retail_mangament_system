/**
 * PURE licence countdown for the settings screen. Whole days from `nowMs` to
 * `expiresAtMs`, rounding up so "tomorrow morning" reads as one day, never
 * zero. Negative means already past expiry.
 */
export function licenseDaysLeft(expiresAtMs: number, nowMs: number): number {
  const dayMs = 24 * 60 * 60 * 1000
  return Math.ceil((expiresAtMs - nowMs) / dayMs)
}
