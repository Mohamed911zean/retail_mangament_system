/**
 * The fixed footer of the selling screen (design system §4.5): the money the
 * cashier is about to take, and the buttons that end the sale.
 *
 * It renders only what the domain produced — `cartTotals()` on the page computes
 * every figure with the same functions the sale service uses, so the number the
 * customer sees here is the number that gets written and printed.
 *
 * When the cart is empty the amounts render as a dash instead of vanishing, so
 * the footer keeps its height and the pay button never jumps out from under the
 * cashier's finger.
 */
import type { ReactNode } from 'react'
import type { SaleTotals } from '../../../domain/saleTotals'
import { messages } from '../../i18n'
import { formatMoney, type DigitStyle } from '../../lib/format'

export type TotalsFooterProps = {
  /** null when the cart is empty or the domain rejected it. */
  totals: SaleTotals | null
  taxEnabled: boolean
  /** Number of lines, for the caption. */
  itemCount: number
  digitStyle: DigitStyle
  /** The POS buttons, rendered at the end of the block. */
  actions?: ReactNode
}

export function TotalsFooter({ totals, taxEnabled, itemCount, digitStyle, actions }: TotalsFooterProps) {
  function row(label: string, value: ReactNode) {
    return (
      <div className="flex items-center justify-between gap-4 py-0.5">
        <span className="text-secondary">{label}</span>
        <span className="numeric text-ink">{value}</span>
      </div>
    )
  }

  // A dash rather than an empty gap: the row must still read as "nothing here yet".
  const blank = <span className="text-muted">{messages.common.emptyValue}</span>
  const amount = (piasters: number): ReactNode => <span className="numeric">{formatMoney(piasters, digitStyle)}</span>

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-h3 font-semibold text-ink">{messages.pos.cart}</span>
        <span className="text-sm text-muted">
          {messages.pos.cartCount} <span className="numeric">{itemCount}</span>
        </span>
      </div>

      {row(messages.pos.subtotal, totals === null ? blank : amount(totals.subtotal))}

      {totals !== null && totals.lineDiscount > 0 && (
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="text-secondary">{messages.pos.lineDiscount}</span>
          <span className="numeric text-ink">{'-' + formatMoney(totals.lineDiscount, digitStyle)}</span>
        </div>
      )}

      {totals !== null && totals.invoiceDiscount > 0 && (
        <div className="flex items-center justify-between gap-4 py-0.5">
          <span className="text-secondary">{messages.pos.invoiceDiscount}</span>
          <span className="numeric text-ink">{'-' + formatMoney(totals.invoiceDiscount, digitStyle)}</span>
        </div>
      )}

      {totals !== null && taxEnabled && totals.tax > 0 && row(messages.pos.tax, amount(totals.tax))}

      {totals !== null &&
        totals.roundingAdjustment !== 0 &&
        // The sign is stated explicitly on a positive adjustment: "+0.05" next to
        // a plain "-0.05" is unambiguous in a way a bare "0.05" is not.
        row(
          messages.pos.rounding,
          <span className="numeric">
            {totals.roundingAdjustment > 0
              ? '+' + formatMoney(totals.roundingAdjustment, digitStyle)
              : formatMoney(totals.roundingAdjustment, digitStyle)}
          </span>,
        )}

      <div className="mt-2 flex items-center justify-between gap-4 border-t border-line pt-3">
        <span className="text-lg font-semibold text-ink">{messages.pos.total}</span>
        {totals === null ? (
          <span className="text-display font-bold text-muted">{messages.common.emptyValue}</span>
        ) : (
          <span className="numeric text-display font-bold text-ink">{formatMoney(totals.total, digitStyle)}</span>
        )}
      </div>

      {actions !== undefined && <div className="mt-4 flex flex-col gap-2">{actions}</div>}
    </div>
  )
}
