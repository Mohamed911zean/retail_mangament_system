import type { BadgeTone } from '../../components/ui'

/**
 * PURE presentation mapping for the treasury screen. The reconciliation words
 * come from `ar.json`; the colour contract (never colour alone) lives here and
 * is unit-tested, so a future rebrand cannot silently drop the signal.
 */

export type Reconciliation = 'balanced' | 'over' | 'short'

/** Badge tone per reconciliation: match is calm, anything else asks for eyes. */
export function reconciliationTone(reconciliation: Reconciliation): BadgeTone {
  if (reconciliation === 'balanced') return 'success'
  if (reconciliation === 'over') return 'info'
  return 'warning'
}

/** Signed difference text from integer piasters, without currency. */
export function signedDifference(differencePiasters: number): string {
  if (differencePiasters === 0) return '0'
  const sign = differencePiasters > 0 ? '+' : '-'
  return `${sign}${Math.abs(differencePiasters)}`
}
