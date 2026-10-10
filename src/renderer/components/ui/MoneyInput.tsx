import { useRef, useState, type Ref } from 'react'
import { cn } from '../../lib/cn'
import { messages } from '../../i18n'
import { formatMoneyParts, parseMoneyToPiasters, type DigitStyle } from '../../lib/format'
import { controlClasses } from './Field'

/**
 * Money field (§4.2). The component owns the *text* the cashier is typing and
 * hands the parent integer piasters, so `12.5` and `١٢٫٥` both arrive as `1250`
 * and no float ever reaches a service.
 *
 * Rules it enforces:
 * - The value is never re-rendered mid-keystroke. Reformatting on every change
 *   moves the caret and eats digits when someone types fast on a POS keyboard;
 *   the canonical `12.50` appears on blur instead.
 * - Text that cannot be parsed is *not* dropped — it stays on screen and simply
 *   does not emit, so a half-typed `12.` does not wipe the previous amount.
 * - A fraction finer than a piaster is rejected by the parser, never rounded.
 */
export type MoneyInputProps = {
  id?: string
  /** Current amount in integer piasters. */
  value: number
  onChange: (piasters: number) => void
  /** Reject a minus sign (the usual case for a price or a cash payment). */
  allowNegative?: boolean
  error?: boolean
  disabled?: boolean
  size?: 'md' | 'lg'
  autoFocus?: boolean
  digitStyle?: DigitStyle
  showCurrency?: boolean
  className?: string
  ref?: Ref<HTMLInputElement>
}

function toText(piasters: number, style: DigitStyle): string {
  return formatMoneyParts(piasters, style).amount
}

export function MoneyInput({
  id,
  value,
  onChange,
  allowNegative = false,
  error = false,
  disabled = false,
  size = 'md',
  autoFocus = false,
  digitStyle = 'western',
  showCurrency = true,
  className,
  ref,
}: MoneyInputProps) {
  const [text, setText] = useState(() => toText(value, digitStyle))
  // The value we last sent up. Comparing against it means an external change
  // (a quick-cash button, a reset after payment) reformats the field, while our
  // own keystrokes never do.
  const lastEmitted = useRef(value)

  if (value !== lastEmitted.current) {
    lastEmitted.current = value
    // Reformat during render, not in an effect: an effect would paint the stale
    // text for one frame, which the cashier can see as the amount flickering.
    setText(toText(value, digitStyle))
  }

  function commit(next: string) {
    setText(next)
    const parsed = parseMoneyToPiasters(next)
    if (parsed === null) return
    if (!allowNegative && parsed < 0) return
    lastEmitted.current = parsed
    onChange(parsed)
  }

  function handleBlur() {
    const parsed = parseMoneyToPiasters(text)
    if (parsed === null || (!allowNegative && parsed < 0)) {
      setText(toText(lastEmitted.current, digitStyle))
      return
    }
    setText(toText(parsed, digitStyle))
    if (parsed !== lastEmitted.current) {
      lastEmitted.current = parsed
      onChange(parsed)
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        ref={ref}
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
        className={cn(
          controlClasses(error, size === 'lg' ? 'h-12' : 'h-10'),
          'numeric',
          showCurrency && 'pe-12',
          className,
        )}
      />
      {showCurrency && (
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted">
          {messages.common.currency}
        </span>
      )}
    </div>
  )
}
