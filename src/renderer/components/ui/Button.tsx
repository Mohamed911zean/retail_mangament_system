import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../../lib/cn'
import { Spinner } from './Spinner'

/**
 * Button (design system §4.1).
 *
 * Variants: primary (brand), secondary, outline, ghost, danger. There is
 * deliberately no success/warning variant — those colours mean *status*, not
 * "click me", so they only appear in badges and alerts.
 *
 * Sizes: sm 32 · md 40 · lg 48 · pos 56. POS actions use `pos` so a cashier can
 * hit them without aiming.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'pos'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-surface hover:bg-brand-800 active:bg-brand-900',
  secondary: 'bg-brand-100 text-brand-700 hover:bg-brand-200 active:bg-brand-300',
  outline: 'bg-surface text-ink border border-line-control hover:bg-panel active:bg-line',
  ghost: 'bg-transparent text-strong hover:bg-panel active:bg-line',
  danger: 'bg-error text-surface hover:bg-error-ink',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-base',
  lg: 'h-12 gap-2 px-5 text-base',
  pos: 'h-14 gap-2 px-6 text-lg font-semibold',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Blocks the button and shows a spinner; the label stays for context. */
  loading?: boolean
  /** Full width, for dialogs and forms. */
  block?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-normal whitespace-nowrap',
        'disabled:cursor-not-allowed disabled:bg-panel disabled:text-line-control',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        block && 'w-full',
        className,
      )}
    >
      {loading && <Spinner size={16} />}
      {children}
    </button>
  )
}

export type IconButtonProps = Omit<ButtonProps, 'children'> & {
  /** Arabic label: an icon-only button must always describe itself (§3.6). */
  label: string
  children: ReactNode
}

export function IconButton({ label, className, children, size = 'md', ...rest }: IconButtonProps) {
  const box = size === 'sm' ? 'h-8 w-8' : size === 'pos' ? 'h-14 w-14' : 'h-10 w-10'
  return (
    <Button {...rest} size={size} aria-label={label} title={label} className={cn('px-0', box, className)}>
      {children}
    </Button>
  )
}
