import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { messages } from '../../i18n'
import { CloseIcon } from '../icons'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Dialog (§4.7). Written by hand rather than pulled from a library: the whole
 * behaviour we need is a focus trap, `Esc`, and a backdrop, which is far less
 * code than any accessibility kit and adds no dependency to a 2 GB-RAM target.
 *
 * - Focus is trapped while open and restored to the element that opened it.
 * - `Esc` and a backdrop click close it, unless `dismissible` is false — a
 *   payment waiting on the printer must not be closed by a stray keystroke.
 * - The cancel action is never rendered `danger`; only real destructive
 *   confirms use that colour, and they name the object in the title.
 */
export type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  /** One sentence under the title, in Arabic, saying what will happen. */
  description?: string
  /** `sm` (480) for confirms, `md` (720) for forms. */
  size?: 'sm' | 'md'
  children?: ReactNode
  /** Buttons; the primary action should be last so it sits at the end side. */
  footer?: ReactNode
  dismissible?: boolean
  /** Focused when the dialog opens; defaults to the first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'sm',
  children,
  footer,
  dismissible = true,
  initialFocus,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  // The effect below must run **only when the dialog opens**. Reading the latest
  // props through refs keeps it that way: with `onClose`/`dismissible` in the
  // dependency list, every parent re-render would tear the effect down and
  // re-focus the first control — typing one character in a dialog input would
  // throw the caret back to the top of the form.
  const closeRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  const initialFocusRef = useRef(initialFocus)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    closeRef.current = onClose
    dismissibleRef.current = dismissible
    initialFocusRef.current = initialFocus
  })

  useEffect(() => {
    if (!open) return

    restoreFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target =
      initialFocusRef.current?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? panelRef.current
    target?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable === undefined || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      restoreFocusTo.current?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the backdrop closes: a
        // drag that began inside the form (selecting text) must not.
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description !== undefined ? descriptionId : undefined}
        className={cn(
          'flex max-h-full w-full flex-col rounded-xl border border-line bg-surface shadow-md',
          size === 'sm' ? 'max-w-[480px]' : 'max-w-[720px]',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div>
            <h2 id={titleId} className="text-h3 font-semibold text-ink">
              {title}
            </h2>
            {description !== undefined && (
              <p id={descriptionId} className="mt-1 text-sm text-secondary">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label={messages.common.close}
              title={messages.common.close}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-panel hover:text-strong"
            >
              <CloseIcon size={16} />
            </button>
          )}
        </header>

        {children !== undefined && <div className="flex-1 overflow-auto p-5">{children}</div>}

        {footer !== undefined && <footer className="flex items-center justify-end gap-2 border-t border-line p-5">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
