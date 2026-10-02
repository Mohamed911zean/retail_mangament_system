import { contextBridge } from 'electron'
import { ipcRenderer } from 'electron'
import type { PrintingApi } from '../shared/printing'

const api: PrintingApi = {
  version: '0.1.0',
  listPrinters: () => ipcRenderer.invoke('printing:list-printers'),
  printTestReceipt: (printerName) => ipcRenderer.invoke('printing:print-test-receipt', printerName),
}

contextBridge.exposeInMainWorld('api', api)
