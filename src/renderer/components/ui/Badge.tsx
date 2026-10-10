import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Badge / chip (§4.4): soft background, dark text, optional icon, radius 6.
 * The status vocabulary is fixed — مدفوع, آجل, جزئي, مرتجع, ملغي, مخزون منخفض,
 * نفد, قارب على الانتهاء, منتهي الصلاحية.
 */
export type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  error: 'bg-error-soft text-error-ink',
  info: 'bg-info-soft text-info-ink',
  neutral: 'bg-panel text-secondary',
}

export function Badge({ tone = 'neutral', children, icon }: { tone?: BadgeTone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-normal whitespace-nowrap', TONE_CLASSES[tone])}>
      {icon}
      {children}
    </span>
  )
}
