import { cn } from '../../lib/cn'

/**
 * A small CSS-only spinner. Used inside buttons and for page loading; a table
 * uses skeleton rows instead (§4.7). No animation library and no layout shift:
 * the element is always the same size.
 */
export function Spinner({ size = 20, className }: { size?: 16 | 20 | 24; className?: string }) {
  const border = size <= 16 ? 'border-2' : 'border-[3px]'
  return (
    <span
      role="status"
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn('inline-block animate-spin rounded-full border-current border-e-transparent align-[-2px]', border, className)}
    />
  )
}
