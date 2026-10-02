import { contextBridge } from 'electron'
import { ipcRenderer } from 'electron'
import type { PrintingApi } from '../shared/printing'
import type { BackupApi } from '../shared/backup'
import type { LicenseApi } from '../shared/license/api'

const api: PrintingApi & BackupApi & LicenseApi = {
  version: '0.1.0',
  listPrinters: () => ipcRenderer.invoke('printing:list-printers'),
  printTestReceipt: (printerName) => ipcRenderer.invoke('printing:print-test-receipt', printerName),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: (fileName) => ipcRenderer.invoke('backup:restore', fileName),
  getLicenseStatus: () => ipcRenderer.invoke('license:get-status'),
  activateLicense: (key) => ipcRenderer.invoke('license:activate', key),
}

contextBridge.exposeInMainWorld('api', api)
