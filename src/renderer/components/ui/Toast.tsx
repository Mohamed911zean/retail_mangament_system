import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { messages } from '../../i18n'
import { ToastContext, type ToastApi, type ToastKind } from '../../lib/toast'
import { CheckIcon, CloseIcon, InfoIcon } from '../icons'

/** §4.7: 4 seconds, bottom-start, dismissible. */
const TOAST_DURATION_MS = 4000

type ToastItem = { id: number; kind: ToastKind; message: string }

/**
 * Renders toasts for the whole app. Mounted once in the shell, so any screen can
 * call `useToast()({ message })` after a successful action.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<number, number>())
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback<ToastApi>(
    ({ message, kind = 'info' }) => {
      const id = nextId.current
      nextId.current += 1
      setToasts((current) => [...current, { id, kind, message }])
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), TOAST_DURATION_MS),
      )
    },
    [dismiss],
  )

  // Clear pending timers on unmount. The map is captured once: reading
  // `timers.current` inside the cleanup would be a stale-value warning, and the
  // map instance never changes.
  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => clearTimeout(timer))
      pending.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 start-4 z-40 flex w-80 flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-md p-3 text-sm shadow-md',
              // Soft tone + dark ink, exactly like `Alert`, so a toast and an
              // inline alert for the same thing look like the same message.
              toast.kind === 'success' ? 'bg-success-soft text-success-ink' : 'bg-info-soft text-info-ink',
            )}
          >
            <span className="mt-0.5 shrink-0">
              {toast.kind === 'success' ? <CheckIcon size={20} /> : <InfoIcon size={20} />}
            </span>
            <p className="flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={messages.common.dismissToast}
              title={messages.common.dismissToast}
              className="shrink-0 rounded-sm p-0.5 hover:bg-surface/50"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
