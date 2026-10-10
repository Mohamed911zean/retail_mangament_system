import type { SaleReceiptData, SaleReceiptItemData } from '../../shared/printing'
import type { MoneyLedgerRow, SaleItemRow, SaleRow } from '../../shared/rows'

/**
 * Turns stored rows into the flat data a receipt template renders.
 *
 * Pure and separate from both the template and the printer, so the numbers on a
 * reprinted receipt can be asserted in a unit test without a printer, a window
 * or Electron.
 */

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

/** `yyyy/mm/dd hh:mm` in the machine's time zone — the shop's own clock. */
export function formatReceiptTimestamp(epochMs: number): string {
  const date = new Date(epochMs)
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * The quantity a customer reads, from the stored integer.
 *
 * `qtyBase / pricedUnitQtyBase` is the number of priced units: 1500 g of a
 * product priced per kilogram is `1.5`, and 24 pieces of a 12-piece box is `2`.
 * At most three decimals are printed; a denominator that is not a power of ten
 * (a box of 7) is therefore rounded for display only — the invoice itself keeps
 * the exact integer.
 */
export function formatQuantityUnits(qtyBase: number, pricedUnitQtyBase: number): string {
  if (!Number.isSafeInteger(qtyBase) || qtyBase < 0) {
    throw new Error(`formatQuantityUnits expects a non-negative integer quantity, got ${qtyBase}`)
  }
  if (!Number.isSafeInteger(pricedUnitQtyBase) || pricedUnitQtyBase <= 0) {
    throw new Error(`formatQuantityUnits expects a positive integer unit size, got ${pricedUnitQtyBase}`)
  }

  const whole = Math.floor(qtyBase / pricedUnitQtyBase)
  const remainder = qtyBase % pricedUnitQtyBase
  if (remainder === 0) return String(whole)

  const digits = Math.round((remainder * 1000) / pricedUnitQtyBase)
  // A rounded-up fraction of 1000 is a carry, not a four-digit fraction.
  if (digits === 1000) return String(whole + 1)

  const fraction = String(digits).padStart(3, '0').replace(/0+$/u, '')
  return fraction.length === 0 ? String(whole) : `${whole}.${fraction}`
}

export type BuildSaleReceiptInput = {
  sale: SaleRow
  items: SaleItemRow[]
  /** Money rows of the sale, used only for the cash change. */
  payments: MoneyLedgerRow[]
  shopName: string
  customerName: string | null
}

export function buildSaleReceiptData(input: BuildSaleReceiptInput): SaleReceiptData {
  const items: SaleReceiptItemData[] = input.items.map((item) => ({
    productName: item.productNameSnapshot,
    qtyText: formatQuantityUnits(item.qtyBase, item.pricedUnitQtyBase),
    unitName: item.unitNameSnapshot,
    unitPricePiasters: item.unitPricePiasters,
    lineTotalPiasters: item.finalLineTotalPiasters,
  }))

  const { sale } = input
  const changePiasters = input.payments.reduce((sum, row) => sum + (row.changePiasters ?? 0), 0)

  return {
    shopName: input.shopName,
    invoiceNumber: sale.invoiceNumber,
    occurredAtText: formatReceiptTimestamp(sale.createdAt),
    items,
    subtotalPiasters: sale.subtotalPiasters,
    discountPiasters: sale.lineDiscountPiasters + sale.invoiceDiscountPiasters,
    taxPiasters: sale.taxPiasters,
    roundingAdjustmentPiasters: sale.roundingAdjustmentPiasters,
    totalPiasters: sale.totalPiasters,
    paidPiasters: sale.paidPiasters,
    duePiasters: sale.duePiasters,
    changePiasters,
    customerName: input.customerName,
  }
}
