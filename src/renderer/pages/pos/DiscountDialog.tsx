/**
 * The discount dialog (design system §4.5, F8): one dialog for both a line
 * discount and the invoice discount, because a cashier should not have to learn
 * two screens for the same idea.
 *
 * It refuses an impossible discount before the sale is written. The domain would
 * reject the same input with `invalid_discount` — a rate over 100% or a discount
 * larger than the amount — but that refusal belongs on the screen where the
 * number is typed, not at the end of a queue.
 */
import { useEffect, useState } from 'react'
import { Button, Dialog, Field, MoneyInput, Select, TextInput } from '../../components/ui'
import { messages } from '../../i18n'
import { formatMoney, type DigitStyle } from '../../lib/format'
import { normalizeDigits } from '../../../shared/digits'
import type { CartDiscount } from './cart'

type DiscountKind = CartDiscount['kind']

/**
 * Reads a percentage the cashier typed into basis points, or null when it is not
 * a usable rate.
 *
 * Accepts `٥` and `5.5` alike — an Arabic keyboard produces Arabic-Indic digits
 * and the Arabic decimal separator — and refuses anything finer than one basis
 * point, above 100%, or not a number at all.
 */
export function parsePercentToBps(text: string): number | null {
  const normalized = normalizeDigits(text).trim().replace('٫', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null
  const basisPoints = Math.round(Number(normalized) * 100)
  if (basisPoints <= 0 || basisPoints > 10000) return null
  return basisPoints
}

/** The inverse, for seeding the field: `1250` → `12.5`. */
function rateToText(rateBps: number): string {
  const whole = Math.floor(rateBps / 100)
  const fraction = rateBps % 100
  if (fraction === 0) return String(whole)
  return fraction % 10 === 0 ? `${whole}.${fraction / 10}` : `${whole}.${String(fraction).padStart(2, '0')}`
}

export type DiscountDialogProps = {
  open: boolean
  /** Arabic title chosen by the caller: a line discount or the invoice discount. */
  title: string
  current: CartDiscount | undefined
  /** The amount the discount is applied to, in piasters — the ceiling for a fixed discount. */
  maxPiasters: number
  digitStyle: DigitStyle
  onClose: () => void
  /** undefined removes an existing discount. */
  onApply: (discount: CartDiscount | undefined) => void
}

export function DiscountDialog({ open, title, current, maxPiasters, digitStyle, onClose, onApply }: DiscountDialogProps) {
  const [kind, setKind] = useState<DiscountKind>('fixed')
  const [amountPiasters, setAmountPiasters] = useState(0)
  const [percentText, setPercentText] = useState('')

  useEffect(() => {
    if (!open) return
    if (current === undefined) {
      setKind('fixed')
      setAmountPiasters(0)
      setPercentText('')
      return
    }
    if (current.kind === 'fixed') {
      setKind('fixed')
      setAmountPiasters(current.amountPiasters)
      setPercentText('')
      return
    }
    setKind('percent')
    setPercentText(rateToText(current.basisPoints))
    setAmountPiasters(0)
    // `current` is handed straight out of the cart state, so its identity changes
    // only when the discount itself does — never on a parent re-render while the
    // cashier is typing.
  }, [open, current])

  const percentBps = parsePercentToBps(percentText)
  const valid = kind === 'fixed' ? amountPiasters > 0 && amountPiasters <= maxPiasters : percentBps !== null

  function apply(): void {
    if (!valid) return
    onApply(kind === 'fixed' ? { kind: 'fixed', amountPiasters } : { kind: 'percent', basisPoints: percentBps ?? 0 })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          {current !== undefined && (
            <Button variant="outline" onClick={() => onApply(undefined)}>
              {messages.pos.discountRemove}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {messages.common.cancel}
          </Button>
          <Button variant="primary" disabled={!valid} onClick={apply}>
            {messages.pos.discountApply}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={messages.pos.discountTitle} htmlFor="pos-discount-kind">
          <Select
            id="pos-discount-kind"
            value={kind}
            options={[
              { value: 'fixed', label: messages.pos.discountFixed },
              { value: 'percent', label: messages.pos.discountPercent },
            ]}
            onChange={(value) => setKind(value === 'percent' ? 'percent' : 'fixed')}
          />
        </Field>

        {kind === 'fixed' ? (
          <Field
            label={messages.pos.discountAmount}
            htmlFor="pos-discount-amount"
            error={amountPiasters > maxPiasters ? messages.pos.discountInvalid : undefined}
          >
            <MoneyInput
              id="pos-discount-amount"
              value={amountPiasters}
              onChange={setAmountPiasters}
              size="lg"
              autoFocus
              digitStyle={digitStyle}
              error={amountPiasters > maxPiasters}
            />
          </Field>
        ) : (
          <Field
            label={messages.pos.discountRate}
            htmlFor="pos-discount-rate"
            error={percentText.length > 0 && percentBps === null ? messages.pos.discountInvalid : undefined}
          >
            <TextInput
              id="pos-discount-rate"
              value={percentText}
              onChange={(event) => setPercentText(event.target.value)}
              inputMode="decimal"
              dir="ltr"
              autoFocus
              size="lg"
              className="numeric"
              error={percentText.length > 0 && percentBps === null}
              placeholder={messages.pos.discountPercent}
            />
          </Field>
        )}

        {/* Says what the discount comes out of, so a cashier can see the ceiling
            of a fixed amount without doing arithmetic in their head. */}
        <div className="flex items-center justify-between gap-4 border-t border-line pt-3 text-sm text-muted">
          <span>{messages.pos.subtotal}</span>
          <span className="numeric">{formatMoney(maxPiasters, digitStyle)}</span>
        </div>
      </div>
    </Dialog>
  )
}
