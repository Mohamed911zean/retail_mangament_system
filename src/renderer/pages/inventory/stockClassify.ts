/**
 * PURE stock-row classification for the inventory screen. The page owns loading
 * and IPC; the badge on each row is decided here and unit-tested.
 *
 * The order matters: a corrupt or negative row is "review" first, even when it
 * would also trip the low-stock threshold.
 */

export type StockState = 'out' | 'review' | 'low' | 'ok'

/**
 * - `out`: nothing on hand.
 * - `review`: negative quantity, or a positive quantity with no positive value
 *   (zero-value or corrupt stock the owner must look at).
 * - `low`: at or below the product's positive alert threshold.
 * - `ok`: everything else.
 */
export function classifyStock(onHandQty: number, onHandValuePiasters: number, lowStockThresholdQty: number): StockState {
  if (onHandQty === 0) return 'out'
  if (onHandQty < 0 || onHandValuePiasters <= 0) return 'review'
  if (lowStockThresholdQty > 0 && onHandQty <= lowStockThresholdQty) return 'low'
  return 'ok'
}
