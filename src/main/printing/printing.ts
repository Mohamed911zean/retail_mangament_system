import { BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PrinterInfo, PrintTestReceiptResult } from '../../shared/printing'
import { createReceiptHtml } from './receipt-template'

export async function listPrinters(window: BrowserWindow): Promise<PrinterInfo[]> {
  const printers = await window.webContents.getPrintersAsync()
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName,
    description: printer.description ?? '',
    status: 0,
    isDefault: false,
  }))
}

export async function printTestReceipt(
  parentWindow: BrowserWindow,
  userDataDirectory: string,
  printerName: string,
): Promise<PrintTestReceiptResult> {
  const printers = await listPrinters(parentWindow)
  const printer = printers.find((candidate) => candidate.name === printerName)
  if (!printer) {
    throw new Error('The selected printer is not installed.')
  }

  const printDirectory = join(userDataDirectory, 'print-cache')
  const receiptPath = join(printDirectory, 'test-receipt.html')
  mkdirSync(printDirectory, { recursive: true })
  writeFileSync(
    receiptPath,
    createReceiptHtml({
      shopName: 'نقطة البيع',
      invoiceNumber: 'TEST-0001',
      printedAt: new Date().toLocaleString('en-GB', { hour12: false }),
      totalPiasters: 1250,
    }),
    'utf8',
  )

  const printWindow = new BrowserWindow({
    parent: parentWindow,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  try {
    await printWindow.loadFile(receiptPath)
    const printed = await new Promise<boolean>((resolve) => {
      printWindow.webContents.print(
        {
          silent: true,
          deviceName: printer.name,
          printBackground: true,
        },
        (success) => resolve(success),
      )
    })

    if (!printed) {
      throw new Error('The Windows printer driver rejected the test receipt.')
    }

    return { printerName: printer.name }
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.destroy()
    }
  }
}
