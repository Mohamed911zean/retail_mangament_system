import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Card (§4.4): white surface, 1px border, radius 14. A shadow is optional and
 * off by default — borders are cheaper to paint on a weak PC and Lite mode
 * removes shadows anyway.
 */
export function Card({
  children,
  className,
  as: Element = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return <Element className={cn('rounded-lg border border-line bg-surface p-5', className)}>{children}</Element>
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-h3 font-semibold text-ink">{title}</h3>
        {description !== undefined && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  )
}

/** Stat card (§4.4): a label, a big value and an optional delta chip. */
export function StatCard({ label, value, hint, className }: { label: string; value: string; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface p-4', className)}>
      <p className="text-sm text-secondary">{label}</p>
      <p className="mt-1 text-h1 font-bold text-ink numeric">{value}</p>
      {hint}
    </div>
  )
}
