/**
 * The payment dialog (design system §4.5): how the money arrives.
 *
 * The arithmetic is not here — it is in `payment.ts`, unit tested, so the change
 * the cashier reads out loud is the same number the sale service will record.
 * This component only presents that state and collects the tenders.
 *
 * Cash is modelled as **one accumulating tender** rather than a list of notes:
 * that is how a drawer works. The note buttons add to it, "المبلغ بالضبط" sets it,
 * and the field edits it directly.
 */
import { useEffect, useState, type KeyboardEvent } from 'react'
import { Alert, Button, Dialog, Field, MoneyInput } from '../../components/ui'
import { messages } from '../../i18n'
import { formatMoney, type DigitStyle } from '../../lib/format'
import type { CustomerSummary, PaymentMethod, SaleTender } from '../../../shared/ipc'
import {
  EGYPTIAN_NOTES_PIASTERS,
  addCash,
  cashTendered,
  changeDue,
  checkPayment,
  exceedsCreditLimit,
  nonCashTendered,
  remainingDue,
  setCash,
  setMethodTender,
  tenderedTotal,
  toTenders,
  type TenderDraft,
} from './payment'

/** The methods a cashier can split across; cash is handled by the note buttons. */
const SPLIT_METHODS: readonly PaymentMethod[] = ['card', 'wallet']

export type PaymentDialogProps = {
  open: boolean
  totalPiasters: number
  customer: CustomerSummary | null
  creditEnabled: boolean
  /**
   * The methods the shop accepts, from Settings. A shop that takes cash only
   * must not be offered a card field: the money would be recorded against a
   * method that never arrives.
   */
  methods: readonly PaymentMethod[]
  /**
   * True while the customer picker is stacked on top of this dialog. `Dialog`
   * listens for `Esc` in the capture phase, so with two dialogs open a single
   * `Esc` would close both and throw away the tenders already entered.
   */
  nestedOpen: boolean
  saving: boolean
  /** Already-translated Arabic from a failed sale save, or null. */
  errorText: string | null
  digitStyle: DigitStyle
  onClose: () => void
  onChooseCustomer: () => void
  onConfirm: (tenders: SaleTender[]) => void
}

export function PaymentDialog({
  open,
  totalPiasters,
  customer,
  creditEnabled,
  methods,
  nestedOpen,
  saving,
  errorText,
  digitStyle,
  onClose,
  onChooseCustomer,
  onConfirm,
}: PaymentDialogProps) {
  const [tenders, setTenders] = useState<TenderDraft[]>([])

  // A new invoice starts from nothing: a tender left over from the previous sale
  // would silently pre-pay the next one.
  useEffect(() => {
    if (open) setTenders([])
  }, [open])

  const cashEnabled = methods.includes('cash')
  const splitMethods = SPLIT_METHODS.filter((method) => methods.includes(method))

  const due = remainingDue(totalPiasters, tenders)
  const change = changeDue(totalPiasters, tenders)
  const cash = cashTendered(tenders)
  const check = checkPayment({
    totalPiasters,
    tenders,
    customerId: customer === null ? null : customer.id,
    creditEnabled,
  })
  const canConfirm = check.ok && !saving

  function confirm(): void {
    if (!canConfirm) return
    onConfirm(toTenders(tenders))
  }

  function handleCashKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Enter') return
    event.preventDefault()
    confirm()
  }

  function renderReason() {
    if (check.ok) return null
    if (check.reason === 'nothing_to_pay') return <Alert tone="warning">{messages.pos.paymentNothing}</Alert>
    if (check.reason === 'needs_full_payment') return <Alert tone="warning">{messages.pos.paymentNeedsFull}</Alert>
    return <Alert tone="warning">{messages.pos.paymentNeedsCustomer}</Alert>
  }

  // Two literal classes rather than a concatenated one: Tailwind only emits
  // classes it can see written out, so `'numeric ' + tone` would silently
  // produce an unstyled amount in the production build.
  function summaryRow(label: string, value: number, tone: 'default' | 'error' = 'default') {
    return (
      <div className="flex items-center justify-between gap-4 py-0.5">
        <span className="text-secondary">{label}</span>
        <span className={tone === 'error' ? 'numeric text-error-ink' : 'numeric text-ink'}>{formatMoney(value, digitStyle)}</span>
      </div>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={messages.pos.paymentTitle}
      size="md"
      // A payment waiting on the printer must not be closed by a stray keystroke,
      // and neither must one whose customer picker is stacked on top of it.
      dismissible={!saving && !nestedOpen}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {messages.common.cancel}
          </Button>
          <Button variant="primary" size="lg" loading={saving} disabled={!canConfirm} onClick={confirm}>
            {messages.pos.paymentConfirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-secondary">{messages.pos.paymentDue}</span>
          <span className="numeric text-display font-bold text-ink">{formatMoney(totalPiasters, digitStyle)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onChooseCustomer}>
            {messages.pos.customerChoose}
          </Button>
          {customer === null ? (
            <span className="text-sm text-muted">{messages.pos.customerNone}</span>
          ) : (
            <span className="text-sm text-ink">
              {customer.name}
              <span className="ms-2 text-muted">
                {messages.pos.customerBalance} <span className="numeric">{formatMoney(customer.balancePiasters, digitStyle)}</span>
              </span>
            </span>
          )}
        </div>

        {!creditEnabled && <Alert tone="info">{messages.pos.customerCreditOff}</Alert>}

        {cashEnabled && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-strong">{messages.pos.paymentNotes}</span>
            <div className="flex flex-wrap gap-2">
              {EGYPTIAN_NOTES_PIASTERS.map((note) => (
                <Button key={note} variant="outline" size="lg" onClick={() => setTenders(addCash(tenders, note))}>
                  <span className="numeric">{formatMoney(note, digitStyle)}</span>
                </Button>
              ))}
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setTenders(setCash(tenders, Math.max(0, totalPiasters - nonCashTendered(tenders))))}
              >
                {messages.pos.paymentExact}
              </Button>
              <Button variant="ghost" size="lg" onClick={() => setTenders(setCash(tenders, 0))}>
                {messages.pos.paymentClearCash}
              </Button>
            </div>
          </div>
        )}

        {/* Enter confirms from the cash field: a cashier on a numeric keypad never
            reaches for the mouse. MoneyInput is a closed component, so the handler
            sits on the wrapper and lets the keydown bubble up. */}
        {cashEnabled && (
          <div onKeyDown={handleCashKeyDown}>
            <Field label={messages.pos.paymentTendered} htmlFor="pos-payment-cash">
              <MoneyInput
                id="pos-payment-cash"
                value={cash}
                onChange={(piasters) => setTenders(setCash(tenders, piasters))}
                size="lg"
                autoFocus
                digitStyle={digitStyle}
              />
            </Field>
          </div>
        )}

        {splitMethods.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">{messages.pos.paymentSplitHint}</span>
            <div className="grid grid-cols-2 gap-3">
              {splitMethods.map((method) => (
                <Field key={method} label={messages.paymentMethods[method]} htmlFor={'pos-payment-' + method}>
                  <MoneyInput
                    id={'pos-payment-' + method}
                    value={tenderedTotal(tenders.filter((tender) => tender.method === method))}
                    onChange={(piasters) => setTenders(setMethodTender(tenders, method, piasters))}
                    digitStyle={digitStyle}
                  />
                </Field>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-md border border-line p-3">
          {summaryRow(messages.pos.paymentTendered, tenderedTotal(tenders))}
          {change > 0 && (
            <div className="flex items-center justify-between gap-4 py-0.5">
              <span className="text-secondary">{messages.pos.paymentChange}</span>
              <span className="numeric text-success-ink">{formatMoney(change, digitStyle)}</span>
            </div>
          )}
          {due > 0 && summaryRow(messages.pos.paymentRemaining, due, 'error')}
        </div>

        {renderReason()}
        {exceedsCreditLimit(customer, due) && <Alert tone="warning">{messages.pos.paymentCreditLimit}</Alert>}
        {errorText !== null && <Alert tone="error">{errorText}</Alert>}
      </div>
    </Dialog>
  )
}
