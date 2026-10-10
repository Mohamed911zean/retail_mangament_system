/**
 * Product search over the list already loaded into the screen — pure, so it can
 * be tested without a window.
 *
 * Searching happens in the renderer, not the database, on purpose: on a weak PC
 * a round trip per keystroke is what makes a POS feel slow, and a small shop's
 * catalogue (hundreds of items) fits in memory comfortably. The list is loaded
 * once when the screen opens and refreshed after a sale changes stock.
 *
 * Arabic-Indic digits are folded to Western first, because a barcode read off a
 * phone screen or typed on an Arabic keyboard arrives as `١٢٣`.
 */
import { normalizeDigits } from '../../../shared/digits'
import type { ProductSummary } from '../../../shared/ipc'

/** How many matches the grid renders before it stops and asks for a narrower search. */
export const RESULT_LIMIT = 60

export function normalizeQuery(query: string): string {
  return normalizeDigits(query).trim().toLowerCase()
}

/**
 * A match is either the name/SKU containing the query, or a barcode starting
 * with it — a scanner types a barcode left to right, so a prefix already matches
 * while the digits are still arriving.
 */
export function matchesProduct(product: ProductSummary, query: string): boolean {
  const needle = normalizeQuery(query)
  if (needle.length === 0) return true
  if (product.name.toLowerCase().includes(needle)) return true
  if (product.sku !== null && product.sku.toLowerCase().includes(needle)) return true
  return product.barcodes.some((barcode) => normalizeQuery(barcode).startsWith(needle))
}

export type FilteredProducts = { items: ProductSummary[]; truncated: boolean }

export function filterProducts(products: readonly ProductSummary[], query: string, limit = RESULT_LIMIT): FilteredProducts {
  const matches = products.filter((product) => matchesProduct(product, query))
  return { items: matches.slice(0, limit), truncated: matches.length > limit }
}

/**
 * The product a scanned code belongs to, by exact barcode or SKU.
 *
 * Exact, unlike the search above: `Enter` after a scan must add one specific
 * item, and a prefix match there would add the wrong product the moment a
 * cashier types a name and presses Enter.
 */
export function findExactBarcode(products: readonly ProductSummary[], code: string): ProductSummary | undefined {
  const needle = normalizeQuery(code)
  if (needle.length === 0) return undefined
  return products.find(
    (product) =>
      product.barcodes.some((barcode) => normalizeQuery(barcode) === needle) ||
      (product.sku !== null && product.sku.toLowerCase() === needle),
  )
}
