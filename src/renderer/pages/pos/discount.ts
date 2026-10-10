import { normalizeDigits } from '../../../shared/digits'

/**
 * Reads a percentage the cashier typed into basis points, or null when it is
 * not a usable rate.
 *
 * Accepts `٥` and `5.5` alike — an Arabic keyboard produces Arabic-Indic digits
 * and the Arabic decimal separator — and refuses anything finer than one basis
 * point, above 100%, or not a number at all.
 */
export function parsePercentToBps(text: string): number | null {
  const normalized = normalizeDigits(text).trim().replace('٫', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null
  const basisPoints = Math.round(Number(normalized) * 100)
  if (basisPoints <= 0 || basisPoints > 10000) return null
  return basisPoints
}
