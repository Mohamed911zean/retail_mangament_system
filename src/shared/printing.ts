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

export type PrintingApi = {
  version: string
  listPrinters: () => Promise<PrinterInfo[]>
  printTestReceipt: (printerName: string) => Promise<PrintTestReceiptResult>
}
