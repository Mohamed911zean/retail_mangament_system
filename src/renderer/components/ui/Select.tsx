import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { messages } from '../../i18n'

/**
 * Select (§4.2). For short, fixed lists only (< 8 options) — anything longer
 * (products, customers, suppliers) uses the searchable combobox in the POS
 * screen, because a cashier should never scroll a dropdown while a queue waits.
 */
export type SelectOption = { value: string; label: string }

export function Select({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  error = false,
  className,
}: {
  id?: string
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  error?: boolean
  className?: string
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-invalid={error || undefined}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'h-10 w-full rounded-md border bg-surface px-3 text-base text-ink',
        'disabled:cursor-not-allowed disabled:bg-panel disabled:text-line-control',
        error ? 'border-error' : 'border-line-control',
        className,
      )}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/**
 * Toggle (§4.2). The state is shown by position **and** by the label text
 * ("مفعّل" / "متوقف"), never by colour alone.
 */
export function Toggle({
  id,
  checked,
  onChange,
  labelOn = messages.common.on,
  labelOff = messages.common.off,
  disabled = false,
  label,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  labelOn?: string
  labelOff?: string
  disabled?: boolean
  label: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="text-base text-ink">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'inline-flex h-8 w-16 shrink-0 items-center gap-2 rounded-md border px-2 text-sm',
          'disabled:cursor-not-allowed disabled:bg-panel disabled:text-line-control',
          checked ? 'border-brand-700 bg-brand-100 text-brand-700' : 'border-line-control bg-surface text-secondary',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('h-4 w-4 rounded-full border', checked ? 'border-brand-700 bg-brand-700' : 'border-line-control bg-panel')}
        />
        <span>{checked ? labelOn : labelOff}</span>
      </button>
    </div>
  )
}
