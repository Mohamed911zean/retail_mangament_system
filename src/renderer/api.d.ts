import type { PrintingApi } from '../shared/printing'

declare global {
  interface Window {
    api: PrintingApi
  }
}

export {}
