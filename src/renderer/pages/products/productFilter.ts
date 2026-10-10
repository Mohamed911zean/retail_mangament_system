import { normalizeDigits } from '../../../shared/digits'
import type { PermissionCode, Role } from '../../../shared/permissions'
import type { ProductSummary } from '../../../shared/ipc'

/**
 * PURE list helpers for the products screen. The page owns loading and IPC;
 * everything here is a decidable function of values already on screen, so it is
 * unit-tested instead of clicked through.
 */

/**
 * A cashier types what they see: an Arabic name fragment, a SKU in any case, or
 * a barcode off a scanner. Digits are folded first, so a barcode typed on an
 * Arabic keyboard still matches.
 */
export function filterProducts(products: readonly ProductSummary[], query: string, categoryId: string | null): ProductSummary[] {
  const needle = normalizeDigits(query).trim().toLowerCase()
  return products.filter((product) => {
    if (categoryId !== null && product.categoryId !== categoryId) return false
    if (needle.length === 0) return true
    if (product.name.toLowerCase().includes(needle)) return true
    if (product.sku !== null && product.sku.toLowerCase().includes(needle)) return true
    return product.barcodes.some((barcode) => normalizeDigits(barcode).toLowerCase().includes(needle))
  })
}

/**
 * The catalog service refuses every mutation from a cashier
 * (`actor.role === 'cashier'`), so the screen hides the buttons for that role.
 * The main process re-checks regardless — this is a convenience, not a defence.
 */
export function canManageCatalog(role: Role): boolean {
  return role !== 'cashier'
}

/** Price and cost edits are additionally gated by their permission codes. */
export function canEditPrice(permissions: readonly PermissionCode[]): boolean {
  return permissions.includes('product.price_change')
}

export function canEditCost(permissions: readonly PermissionCode[]): boolean {
  return permissions.includes('product.cost_change')
}

/** A threshold of zero means "no alert"; otherwise a low on-hand quantity warns. */
export function isLowStock(onHandQty: number, lowStockThresholdQty: number): boolean {
  return lowStockThresholdQty > 0 && onHandQty > 0 && onHandQty <= lowStockThresholdQty
}
