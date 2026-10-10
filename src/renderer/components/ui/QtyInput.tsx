import { useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { messages } from '../../i18n'
import { formatQtyValue, parseQtyToUnits, unitsPerDisplayUnit, type DigitStyle } from '../../lib/format'
import { MinusIcon, PlusIcon } from '../icons'
import { controlClasses } from './Field'

/**
 * Quantity field (§4.2, §6.2). Same contract as `MoneyInput`: the text is local,
 * the value handed up is an integer in the product's smallest unit.
 *
 * A `qtyScale` of 3 means the cashier types kilograms and the cart stores grams;
 * a stepped button moves by one display unit (1 kg, 1 piece), so the common
 * "add one more" case never requires the keyboard.
 */
export type QtyInputProps = {
  id?: string
  /** Current quantity in the smallest unit. */
  value: number
  onChange: (units: number) => void
  qtyScale: number
  /** Shown after the number and read by screen readers (قطعة، كجم). */
  unitName: string
  /** How much the ± buttons move, in smallest units. Defaults to one display unit. */
  stepUnits?: number
  allowNegative?: boolean
  /** Hides the ± buttons where the keyboard is the point (a count sheet). */
  showStepper?: boolean
  error?: boolean
  disabled?: boolean
  size?: 'md' | 'lg'
  autoFocus?: boolean
  digitStyle?: DigitStyle
  className?: string
}

export function QtyInput({
  id,
  value,
  onChange,
  qtyScale,
  unitName,
  stepUnits,
  allowNegative = false,
  showStepper = true,
  error = false,
  disabled = false,
  size = 'md',
  autoFocus = false,
  digitStyle = 'western',
  className,
}: QtyInputProps) {
  const [text, setText] = useState(() => formatQtyValue(value, qtyScale, digitStyle))
  const lastEmitted = useRef(value)
  const step = stepUnits ?? unitsPerDisplayUnit(qtyScale)

  if (value !== lastEmitted.current) {
    lastEmitted.current = value
    setText(formatQtyValue(value, qtyScale, digitStyle))
  }

  function emit(units: number) {
    if (!allowNegative && units < 0) units = 0
    lastEmitted.current = units
    setText(formatQtyValue(units, qtyScale, digitStyle))
    onChange(units)
  }

  function commit(next: string) {
    setText(next)
    const parsed = parseQtyToUnits(next, qtyScale)
    if (parsed === null) return
    if (!allowNegative && parsed < 0) return
    lastEmitted.current = parsed
    onChange(parsed)
  }

  function handleBlur() {
    const parsed = parseQtyToUnits(text, qtyScale)
    if (parsed === null || (!allowNegative && parsed < 0)) {
      setText(formatQtyValue(lastEmitted.current, qtyScale, digitStyle))
      return
    }
    setText(formatQtyValue(parsed, qtyScale, digitStyle))
    if (parsed !== lastEmitted.current) {
      lastEmitted.current = parsed
      onChange(parsed)
    }
  }

  const stepper = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line-control bg-surface text-strong hover:bg-panel disabled:cursor-not-allowed disabled:bg-panel disabled:text-line-control'

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {showStepper && (
        <button
          type="button"
          disabled={disabled || (!allowNegative && value <= 0)}
          onClick={() => emit(value - step)}
          aria-label={`${messages.common.decrease} ${unitName}`}
          title={`${messages.common.decrease} ${unitName}`}
          className={stepper}
        >
          <MinusIcon size={20} />
        </button>
      )}
      <div className="relative flex-1">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          dir="ltr"
          autoFocus={autoFocus}
          disabled={disabled}
          value={text}
          onChange={(event) => commit(event.target.value.replace(/\s/gu, ''))}
          onBlur={handleBlur}
          aria-invalid={error || undefined}
          className={cn(controlClasses(error, size === 'lg' ? 'h-12' : 'h-10'), 'numeric', 'pe-12')}
        />
        {unitName.length > 0 && (
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted">{unitName}</span>
        )}
      </div>
      {showStepper && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => emit(value + step)}
          aria-label={`${messages.common.increase} ${unitName}`}
          title={`${messages.common.increase} ${unitName}`}
          className={stepper}
        >
          <PlusIcon size={20} />
        </button>
      )}
    </div>
  )
}
