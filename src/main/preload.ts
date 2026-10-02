import { contextBridge } from 'electron'
import { ipcRenderer } from 'electron'
import type { PrintingApi } from '../shared/printing'
import type { BackupApi } from '../shared/backup'

const api: PrintingApi & BackupApi = {
  version: '0.1.0',
  listPrinters: () => ipcRenderer.invoke('printing:list-printers'),
  printTestReceipt: (printerName) => ipcRenderer.invoke('printing:print-test-receipt', printerName),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: (fileName) => ipcRenderer.invoke('backup:restore', fileName),
}

contextBridge.exposeInMainWorld('api', api)
