import { cn } from '../../lib/cn'

/**
 * Empty state (§4.7): a small icon, one sentence and one action. Used inside
 * tables and cards, so a first-time user always knows what to do next.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 p-8 text-center', className)}>
      {icon !== undefined && <span className="text-line-control">{icon}</span>}
      <p className="text-base font-semibold text-strong">{title}</p>
      {description !== undefined && <p className="text-sm text-muted">{description}</p>}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  )
}
