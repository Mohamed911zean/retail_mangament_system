import type { BackupInfo } from '../../shared/backup'
import type { PrinterInfo, SaleReceiptData } from '../../shared/printing'
import type { LicenseStatus } from '../../shared/license/api'

/**
 * Everything the IPC layer needs from the Electron shell, behind one interface.
 *
 * Keeping Electron out of `operations.ts` lets the whole IPC surface run under
 * Vitest with a fake platform (no window, no printers, no licence files), and
 * leaves `register.ts` as the only file that touches `electron`.
 */
export type Platform = {
  version: string
  listPrinters: () => Promise<PrinterInfo[]>
  printTestReceipt: (printerName: string) => Promise<unknown>
  /** Prints a receipt that the caller has already built from stored rows. */
  printSaleReceipt: (printerName: string, saleId: string, receipt: SaleReceiptData) => Promise<unknown>
  listBackups: () => BackupInfo[]
  createBackup: () => Promise<BackupInfo>
  restoreBackup: (fileName: string) => Promise<BackupInfo[]>
  licenseStatus: () => Promise<LicenseStatus>
  activateLicense: (key: string) => Promise<LicenseStatus>
  /** False when the licence puts the app in read-only mode. */
  isWriteAllowed: () => Promise<boolean>
  /** Logs an unexpected main-process failure (never shown to the user raw). */
  reportUnexpectedError?: (context: string, error: unknown) => void
}
