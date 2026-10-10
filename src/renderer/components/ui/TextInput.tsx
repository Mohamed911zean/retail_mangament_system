import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../../lib/cn'
import { messages } from '../../i18n'
import { CloseIcon, SearchIcon } from '../icons'
import { controlClasses } from './Field'

/**
 * Text input (§4.2). Height 40 by default, or 48 with `size="lg"` for
 * POS-critical fields. It never strips what the cashier typed — digit
 * normalization happens when the value is committed, not per keystroke.
 */
export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  error?: boolean
  size?: 'md' | 'lg'
  ref?: Ref<HTMLInputElement>
}

export function TextInput({ error = false, size = 'md', className, ...rest }: TextInputProps) {
  return (
    <input
      {...rest}
      aria-invalid={error || undefined}
      className={cn(controlClasses(error, size === 'lg' ? 'h-12' : 'h-10'), className)}
    />
  )
}

export type SearchInputProps = Omit<TextInputProps, 'type'> & {
  /** Called when the clear button is pressed; the button shows only if set. */
  onClear?: () => void
  clearLabel?: string
  /** Start-side icon; defaults to the search glyph. */
  icon?: ReactNode
  ref?: Ref<HTMLInputElement>
}

/**
 * Search / barcode field (§4.2). Large, with an inline icon at the start side
 * and a clear button when it has text. The POS screen keeps it auto-focused so
 * a barcode scanner (a keyboard wedge) can always type into it.
 */
export function SearchInput({ onClear, clearLabel, icon, className, value, size, ...rest }: SearchInputProps) {
  const hasValue = typeof value === 'string' && value.length > 0
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted">
        {icon ?? <SearchIcon size={20} />}
      </span>
      <input
        {...rest}
        value={value}
        type="search"
        enterKeyHint="done"
        className={cn(controlClasses(false, 'h-12 ps-11 pe-10'), className)}
      />
      {onClear !== undefined && hasValue && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel ?? messages.common.clear}
          title={clearLabel ?? messages.common.clear}
          className="absolute inset-y-0 end-2 my-auto flex h-7 w-7 items-center justify-center rounded-sm text-muted hover:bg-panel hover:text-strong"
        >
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  )
}
