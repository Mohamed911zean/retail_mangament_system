import { BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  PrinterInfo,
  PrintSaleReceiptResult,
  PrintTestReceiptResult,
  SaleReceiptData,
} from '../../shared/printing'
import { createReceiptHtml, createSaleReceiptHtml } from './receipt-template'

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

/**
 * Writes the receipt to the print cache and prints it silently through the
 * Windows driver (AGENTS.md §7 — no raw ESC/POS, because Arabic code pages are
 * unreliable on cheap thermal printers).
 *
 * The HTML goes through a hidden window that has the same hardening as the app
 * window and no preload at all: a receipt template is data, and it must not be
 * able to reach Node even if a client overlay edits it badly.
 */
async function printHtml(
  parentWindow: BrowserWindow,
  userDataDirectory: string,
  printerName: string,
  fileName: string,
  html: string,
): Promise<void> {
  const printers = await listPrinters(parentWindow)
  const printer = printers.find((candidate) => candidate.name === printerName)
  if (!printer) {
    throw new Error('The selected printer is not installed.')
  }

  const printDirectory = join(userDataDirectory, 'print-cache')
  const receiptPath = join(printDirectory, fileName)
  mkdirSync(printDirectory, { recursive: true })
  writeFileSync(receiptPath, html, 'utf8')

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
      throw new Error('The Windows printer driver rejected the receipt.')
    }
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.destroy()
    }
  }
}

export async function printTestReceipt(
  parentWindow: BrowserWindow,
  userDataDirectory: string,
  printerName: string,
): Promise<PrintTestReceiptResult> {
  await printHtml(
    parentWindow,
    userDataDirectory,
    printerName,
    'test-receipt.html',
    createReceiptHtml({
      shopName: 'نقطة البيع',
      invoiceNumber: 'TEST-0001',
      printedAt: new Date().toLocaleString('en-GB', { hour12: false }),
      totalPiasters: 1250,
    }),
  )
  return { printerName }
}

/**
 * Prints a sale that is already committed. The file name is fixed per invoice,
 * so reprinting overwrites the cached copy rather than filling the disk with one
 * HTML file per attempt.
 */
export async function printSaleReceipt(
  parentWindow: BrowserWindow,
  userDataDirectory: string,
  printerName: string,
  saleId: string,
  receipt: SaleReceiptData,
): Promise<PrintSaleReceiptResult> {
  const safeInvoice = receipt.invoiceNumber.replace(/[^0-9A-Za-z_-]/gu, '_')
  await printHtml(
    parentWindow,
    userDataDirectory,
    printerName,
    `sale-${safeInvoice}.html`,
    createSaleReceiptHtml(receipt),
  )
  return { saleId, printerName }
}
