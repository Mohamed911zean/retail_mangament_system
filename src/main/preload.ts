import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('smallErp', {
  version: '0.1.0',
})
