import { createContext, useContext } from 'react'

/**
 * Toast contract (design system §4.7).
 *
 * Only two kinds exist on purpose: a toast is a *confirmation* that disappears
 * on its own, so it may only carry success or neutral information. Errors and
 * anything to do with money are never toasts — they need an inline alert or a
 * dialog that stays until the cashier acknowledges it.
 */
export type ToastKind = 'success' | 'info'

export type ToastOptions = {
  message: string
  kind?: ToastKind
}

export type ToastApi = (toast: ToastOptions) => void

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (api === null) throw new Error('useToast must be called inside <ToastProvider>.')
  return api
}
