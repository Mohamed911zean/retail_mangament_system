import type { AppApi } from '../shared/printing'

declare global {
  interface Window {
    api: AppApi
  }
}

export {}
