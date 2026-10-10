import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { AlertIcon, CheckIcon, InfoIcon } from '../icons'

/**
 * Inline alert (§4.7). Soft background + matching dark text + an icon, so the
 * message is never carried by colour alone. Errors and anything involving money
 * use this (or a dialog) — never a toast, which the cashier could miss.
 */
export type AlertTone = 'success' | 'warning' | 'error' | 'info'

const TONE_CLASSES: Record<AlertTone, string> = {
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  error: 'bg-error-soft text-error-ink',
  info: 'bg-info-soft text-info-ink',
}

const TONE_ICONS: Record<AlertTone, (props: { size?: 16 | 20 | 24 }) => ReactNode> = {
  success: CheckIcon,
  warning: AlertIcon,
  error: AlertIcon,
  info: InfoIcon,
}

export function Alert({
  tone = 'info',
  children,
  className,
}: {
  tone?: AlertTone
  children: ReactNode
  className?: string
}) {
  const Icon = TONE_ICONS[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-md p-3 text-sm', TONE_CLASSES[tone], className)}>
      <span className="mt-0.5 shrink-0">
        <Icon size={20} />
      </span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
