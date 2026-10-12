import { useCallback, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Table primitives (§4.3): sticky header on `gray-100`, 44px comfortable rows,
 * 1px dividers, hover/selected row on `brand-50`.
 *
 * Numeric columns must use `numeric` (direction ltr, aligned to the end,
 * tabular digits) so a minus sign or a percent never flips in RTL.
 */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-auto rounded-lg border border-line bg-surface', className)}>
      <table className="w-full border-collapse text-dense">{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-panel">{children}</thead>
}

export function TRow({
  children,
  selected = false,
  onClick,
  className,
}: {
  children: ReactNode
  selected?: boolean
  onClick?: () => void
  className?: string
}) {
  // A clickable row is also a keyboard row: without this, selecting a backup
  // or a cart line is mouse-only. Keys from inner controls are ignored — Space
  // inside a quantity field must edit the number, not select the row.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (onClick === undefined || event.target !== event.currentTarget) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onClick()
      }
    },
    [onClick],
  )
  return (
    <tr
      onClick={onClick}
      onKeyDown={onClick === undefined ? undefined : handleKeyDown}
      tabIndex={onClick === undefined ? undefined : 0}
      aria-selected={onClick === undefined ? undefined : selected}
      className={cn(
        'border-b border-line last:border-b-0',
        selected ? 'bg-brand-50' : 'hover:bg-brand-50',
        onClick !== undefined && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function TH({
  children,
  numeric = false,
  end = false,
  className,
}: {
  children?: ReactNode
  numeric?: boolean
  /** End-aligned header for action columns whose buttons sit at the row end. */
  end?: boolean
  className?: string
}) {
  return (
    <th scope="col" className={cn('border-b border-line px-3 py-2 font-semibold text-strong', end ? 'text-end' : 'text-start', 'text-dense', numeric && 'numeric', className)}>
      {children}
    </th>
  )
}

export function TD({
  children,
  numeric = false,
  className,
  colSpan,
}: {
  children?: ReactNode
  numeric?: boolean
  className?: string
  colSpan?: number
}) {
  return (
    <td colSpan={colSpan} className={cn('px-3 py-2 align-middle text-ink', numeric && 'numeric', className)}>
      {children}
    </td>
  )
}

/** Empty state inside a table body: one icon, one sentence, one action. */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-muted">
        {children}
      </td>
    </tr>
  )
}

/** Totals row: bold, on `brand-50`. */
export function TFoot({ children }: { children: ReactNode }) {
  return <tfoot className="bg-brand-50 font-semibold text-ink">{children}</tfoot>
}
