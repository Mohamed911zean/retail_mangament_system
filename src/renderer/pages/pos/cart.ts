/**
 * The POS cart — pure data, no React, no IPC.
 *
 * Everything a cashier builds up before pressing "دفع" lives here, so the live
 * total on screen is computed by **the same domain functions the sale service
 * uses** (`src/domain/`). That is the whole point of this module: a screen that
 * re-implemented the arithmetic would eventually disagree with the invoice it
 * just printed, and the shop would trust neither.
 *
 * Integers only, exactly as they cross IPC: money in piasters, quantities in the
 * smallest base unit. The one place a display scale appears is
 * `displayScale`/`pricedUnitQtyBase`, and it exists so a cashier can type
 * "1.5 kg" while the cart keeps 1500 grams.
 */
import type { Discount } from '../../../domain/discount'
import { calculateLineAmounts, type LineInput } from '../../../domain/lineAmounts'
import { calculateSaleTotals, type SaleTotals } from '../../../domain/saleTotals'
import type { ProductSummary, SaleLine } from '../../../shared/ipc'
import { unitsPerDisplayUnit } from '../../lib/format'

/** The discount shape the IPC contract uses (note: `percent`/`basisPoints`). */
export type CartDiscount =
  | { kind: 'fixed'; amountPiasters: number }
  | { kind: 'percent'; basisPoints: number }

export type CartLine = {
  /** Stable identity of the line: one line per product + unit. */
  id: string
  productId: string
  productName: string
  unitName: string
  /** Base-unit quantity that one application of `unitPricePiasters` covers. */
  pricedUnitQtyBase: number
  /** How the cashier types the quantity: 0 = whole units, 3 = thousandths. */
  displayScale: 0 | 3
  qtyBase: number
  unitPricePiasters: number
  taxRateBps: number
  lineDiscount?: CartDiscount
}

export type Cart = {
  lines: CartLine[]
  invoiceDiscount?: CartDiscount
}

export const emptyCart: Cart = { lines: [] }

/** The domain speaks `percentage`/`rateBps`; IPC speaks `percent`/`basisPoints`. */
function toDomainDiscount(discount: CartDiscount | undefined): Discount | undefined {
  if (discount === undefined) return undefined
  return discount.kind === 'fixed'
    ? { kind: 'fixed', amountPiasters: discount.amountPiasters }
    : { kind: 'percentage', rateBps: discount.basisPoints }
}

export function lineKey(productId: string, unitName: string): string {
  return `${productId}::${unitName}`
}

// ─── Quantities ─────────────────────────────────────────────────────────────

/**
 * The number the quantity field shows, in the line's display scale.
 *
 * For the base unit of a weighted product the two scales agree (1500 g → `1500`,
 * shown as `1.5`), and for a boxed unit it is the count of boxes (`24` pieces of
 * a 12-piece box → `2`). Returns `null` when the base quantity is not a whole
 * number of display units, which can only happen if a caller bypassed the
 * setters below.
 */
export function displayQtyValue(line: CartLine): number | null {
  const scaled = line.qtyBase * unitsPerDisplayUnit(line.displayScale)
  if (scaled % line.pricedUnitQtyBase !== 0) return null
  return scaled / line.pricedUnitQtyBase
}

/** Inverse of `displayQtyValue`; `null` when the result is not a whole number. */
export function qtyBaseFromDisplay(line: CartLine, displayValue: number): number | null {
  if (!Number.isSafeInteger(displayValue) || displayValue <= 0) return null
  const scaled = displayValue * line.pricedUnitQtyBase
  if (scaled % unitsPerDisplayUnit(line.displayScale) !== 0) return null
  return scaled / unitsPerDisplayUnit(line.displayScale)
}

// ─── Building the cart ──────────────────────────────────────────────────────

/** `unitIndex` is an index into `product.units`; `-1` means the base unit. */
export function cartLineFor(product: ProductSummary, unitIndex: number, qtyBase: number): CartLine {
  const unit = unitIndex >= 0 ? product.units[unitIndex] : undefined
  const pricedUnitQtyBase = unit?.baseQtyPerUnit ?? product.priceUnitQtyBase
  return {
    // Two lines of the same product in different units are legitimate (a box and
    // a single piece), so the unit is part of the identity.
    id: lineKey(product.id, unit?.unitName ?? product.baseUnitName),
    productId: product.id,
    productName: product.name,
    unitName: unit?.unitName ?? product.baseUnitName,
    pricedUnitQtyBase,
    // An extra unit is counted in whole units: nobody sells 0.4 of a box.
    displayScale: unit === undefined ? product.qtyScale : 0,
    qtyBase,
    unitPricePiasters: unit?.sellingPricePiasters ?? product.sellingPricePiasters,
    taxRateBps: product.taxRateBps,
  }
}

/** Adds a quantity, merging into the existing line for that product + unit. */
export function addProduct(cart: Cart, product: ProductSummary, unitIndex: number, qtyBase: number): Cart {
  const addition = cartLineFor(product, unitIndex, qtyBase)
  const existing = cart.lines.findIndex((line) => line.id === addition.id)
  if (existing === -1) return { ...cart, lines: [...cart.lines, addition] }

  const lines = [...cart.lines]
  const current = lines[existing]
  lines[existing] = { ...current, qtyBase: current.qtyBase + qtyBase }
  return { ...cart, lines }
}

export function setLineQty(cart: Cart, lineId: string, qtyBase: number): Cart {
  if (!Number.isSafeInteger(qtyBase) || qtyBase <= 0) return cart
  return { ...cart, lines: cart.lines.map((line) => (line.id === lineId ? { ...line, qtyBase } : line)) }
}

export function setLinePrice(cart: Cart, lineId: string, unitPricePiasters: number): Cart {
  if (!Number.isSafeInteger(unitPricePiasters) || unitPricePiasters < 0) return cart
  return { ...cart, lines: cart.lines.map((line) => (line.id === lineId ? { ...line, unitPricePiasters } : line)) }
}

/**
 * Switches a line to another unit. The quantity resets to exactly one of the new
 * unit rather than being converted: 3 pieces becoming 0.25 of a box is not a
 * quantity any cashier asked for, and guessing is worse than a predictable 1.
 */
export function setLineUnit(cart: Cart, lineId: string, product: ProductSummary, unitIndex: number): Cart {
  return {
    ...cart,
    lines: cart.lines.map((line) => {
      if (line.id !== lineId) return line
      const next = cartLineFor(product, unitIndex, 1)
      return { ...next, qtyBase: next.pricedUnitQtyBase }
    }),
  }
}

export function removeLine(cart: Cart, lineId: string): Cart {
  return { ...cart, lines: cart.lines.filter((line) => line.id !== lineId) }
}

export function setLineDiscount(cart: Cart, lineId: string, discount: CartDiscount | undefined): Cart {
  return {
    ...cart,
    lines: cart.lines.map((line) => {
      if (line.id !== lineId) return line
      // `undefined` must remove the key, not store `undefined` under it.
      if (discount === undefined) {
        const { lineDiscount: _dropped, ...rest } = line
        return rest
      }
      return { ...line, lineDiscount: discount }
    }),
  }
}

export function setInvoiceDiscount(cart: Cart, discount: CartDiscount | undefined): Cart {
  if (discount === undefined) {
    const { invoiceDiscount: _dropped, ...rest } = cart
    return rest
  }
  return { ...cart, invoiceDiscount: discount }
}

// ─── Totals and the payload sent to main ────────────────────────────────────

export type CartTotalsOptions = {
  taxEnabled: boolean
  cashRoundingStep: number
}

/** `null` when the domain rejects the cart (an impossible amount or a bad rate). */
export function cartTotals(cart: Cart, options: CartTotalsOptions): SaleTotals | null {
  if (cart.lines.length === 0) return null

  const lineInputs: LineInput[] = cart.lines.map((line) => ({
    unitPricePiasters: line.unitPricePiasters,
    qtyBase: line.qtyBase,
    pricedUnitQtyBase: line.pricedUnitQtyBase,
    ...(line.lineDiscount === undefined ? {} : { lineDiscount: toDomainDiscount(line.lineDiscount) }),
    taxRateBps: line.taxRateBps,
  }))

  const amounts = calculateLineAmounts(
    lineInputs,
    toDomainDiscount(cart.invoiceDiscount) ?? { kind: 'fixed', amountPiasters: 0 },
    options.taxEnabled,
  )
  if (!amounts.ok) return null

  const totals = calculateSaleTotals(amounts.value, options.cashRoundingStep)
  if (!totals.ok) return null
  return totals.value
}

/** The per-line money, in the same order as `cart.lines` — what the cart shows. */
export function cartLineTotals(cart: Cart, options: CartTotalsOptions): (LineAmountView | null)[] {
  const lineInputs: LineInput[] = cart.lines.map((line) => ({
    unitPricePiasters: line.unitPricePiasters,
    qtyBase: line.qtyBase,
    pricedUnitQtyBase: line.pricedUnitQtyBase,
    ...(line.lineDiscount === undefined ? {} : { lineDiscount: toDomainDiscount(line.lineDiscount) }),
    taxRateBps: line.taxRateBps,
  }))
  const amounts = calculateLineAmounts(
    lineInputs,
    toDomainDiscount(cart.invoiceDiscount) ?? { kind: 'fixed', amountPiasters: 0 },
    options.taxEnabled,
  )
  if (!amounts.ok) return cart.lines.map(() => null)
  return amounts.value.map((amount) => ({
    subtotalPiasters: amount.lineSubtotal,
    discountPiasters: amount.lineDiscount,
    totalPiasters: amount.finalLineTotal,
  }))
}

export type LineAmountView = {
  subtotalPiasters: number
  discountPiasters: number
  totalPiasters: number
}

/** The sale payload: exactly the shape `sales:complete` validates. */
export function toSaleLines(cart: Cart): SaleLine[] {
  return cart.lines.map((line) => ({
    productId: line.productId,
    unitNameSnapshot: line.unitName,
    pricedUnitQtyBase: line.pricedUnitQtyBase,
    qtyBase: line.qtyBase,
    unitPricePiasters: line.unitPricePiasters,
    ...(line.lineDiscount === undefined ? {} : { lineDiscount: line.lineDiscount }),
  }))
}

/** One line per product + unit, merging duplicates (a recalled hold may repeat). */
export function cartFromSaleLines(
  lines: SaleLine[],
  products: readonly ProductSummary[],
): Cart {
  const cart = lines.reduce<Cart>((current, line) => {
    const product = products.find((candidate) => candidate.id === line.productId)
    if (product === undefined) return current
    const next: CartLine = {
      id: lineKey(line.productId, line.unitNameSnapshot),
      productId: line.productId,
      productName: product.name,
      unitName: line.unitNameSnapshot,
      pricedUnitQtyBase: line.pricedUnitQtyBase,
      displayScale: line.unitNameSnapshot === product.baseUnitName ? product.qtyScale : 0,
      qtyBase: line.qtyBase,
      unitPricePiasters: line.unitPricePiasters,
      taxRateBps: product.taxRateBps,
      ...(line.lineDiscount === undefined ? {} : { lineDiscount: line.lineDiscount }),
    }
    const existing = current.lines.findIndex((candidate) => candidate.id === next.id)
    if (existing === -1) return { ...current, lines: [...current.lines, next] }
    const merged = [...current.lines]
    merged[existing] = { ...merged[existing], qtyBase: merged[existing].qtyBase + next.qtyBase }
    return { ...current, lines: merged }
  }, emptyCart)

  return cart
}
