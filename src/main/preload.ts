import { contextBridge } from 'electron'

const api = {
  version: '0.1.0',
}

contextBridge.exposeInMainWorld('api', api)
