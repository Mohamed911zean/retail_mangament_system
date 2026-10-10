export type PrinterInfo = {
  name: string
  displayName: string
  description: string
  status: number
  isDefault: boolean
}

export type PrintTestReceiptResult = {
  printerName: string
}

export type PrintSaleReceiptResult = {
  saleId: string
  printerName: string
}

/**
 * One receipt line, already resolved to text where text is unavoidable.
 *
 * Money stays an integer in piasters all the way to the template, which formats
 * it. `qtyText` is the exception: the quantity the customer reads is a *display*
 * amount (1.5 kg), so main converts the stored integer once, with integer maths,
 * and hands over the string.
 */
export type SaleReceiptItemData = {
  productName: string
  qtyText: string
  unitName: string
  unitPricePiasters: number
  lineTotalPiasters: number
}

/** Everything the sale receipt template needs. No ids, no paths, no prices of cost. */
export type SaleReceiptData = {
  shopName: string
  invoiceNumber: string
  /** Sale time, formatted for print (`yyyy/mm/dd hh:mm`). */
  occurredAtText: string
  items: SaleReceiptItemData[]
  subtotalPiasters: number
  /** Line discounts + invoice discount, already summed. */
  discountPiasters: number
  taxPiasters: number
  roundingAdjustmentPiasters: number
  totalPiasters: number
  paidPiasters: number
  duePiasters: number
  changePiasters: number
  customerName: string | null
}

export type PrintingApi = {
  listPrinters: () => Promise<PrinterInfo[]>
  printTestReceipt: (printerName: string) => Promise<PrintTestReceiptResult>
  /** Reprints/prints a committed sale; the sale is loaded in main from `saleId`. */
  printSaleReceipt: (printerName: string, saleId: string) => Promise<PrintSaleReceiptResult>
}
