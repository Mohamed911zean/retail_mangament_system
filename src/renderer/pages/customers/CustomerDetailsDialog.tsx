import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Dialog, EmptyState, Field, MoneyInput, Select, Spinner, TextInput } from '../../components/ui'
import { UsersIcon } from '../../components/icons'
import { messages } from '../../i18n'
import { formatDateTime, formatMoney, type DigitStyle } from '../../lib/format'
import type { CustomerSummary, LedgerEntrySummary } from '../../../shared/ipc'
import type { PaymentMethod } from '../../../shared/settings'

/**
 * One customer's account: the derived balance, the credit limit, the statement
 * rows, a receipt form and per-row reversals.
 *
 * A receipt against credit is what settles the balance; a reversal is a
 * compensating entry the service writes. The rows only ask for either.
 */
export type CustomerDetailsDialogProps = {
  open: boolean
  customer: CustomerSummary | null
  entries: LedgerEntrySummary[] | null
  paymentMethods: readonly PaymentMethod[]
  digitStyle: DigitStyle
  saving: boolean
  /** Already-translated server error from the last receipt/reverse attempt. */
  errorText: string | null
  /** `document.void` — without it the reversal buttons stay hidden. */
  canReverse: boolean
  onClose: () => void
  onReceive: (customerId: string, amountPiasters: number, method: PaymentMethod, referenceText: string | null) => void
  onReverse: (entryId: string, reason: string | null) => void
}

export function CustomerDetailsDialog({
  open,
  customer,
  entries,
  paymentMethods,
  digitStyle,
  saving,
  errorText,
  canReverse,
  onClose,
  onReceive,
  onReverse,
}: CustomerDetailsDialogProps) {
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [confirmEntryId, setConfirmEntryId] = useState<string | null>(null)
  const [reverseReason, setReverseReason] = useState('')

  // Opening a different customer resets the receipt draft and any open confirm.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setAmount(0)
      setReference('')
      setConfirmEntryId(null)
      setReverseReason('')
    }
  }, [open, customer?.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  function receive(): void {
    if (customer === null || amount <= 0) return
    onReceive(customer.id, amount, paymentMethods.includes(method) ? method : 'cash', reference.trim().length === 0 ? null : reference.trim())
  }

  function entryLabel(entry: LedgerEntrySummary): string {
    if (entry.reversesEntryId !== null) return messages.customers.entryReversal
    if (entry.entryType === 'customer_receipt') return messages.customers.entryReceipt
    if (entry.entryType === 'sale_return_refund') return messages.customers.entryRefund
    return messages.customers.entrySalePayment
  }

  return (
    <Dialog open={open} onClose={onClose} title={messages.customers.details} size="md">
      {customer === null ? null : (
        <div className="flex flex-col gap-4">
          {errorText !== null && <Alert tone="error">{errorText}</Alert>}

          <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-panel px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-h3 font-semibold text-ink" title={customer.name}>{customer.name}</p>
              {customer.phone !== null && <p className="numeric text-sm text-muted">{customer.phone}</p>}
              <p className="text-sm text-secondary">
                {messages.customers.creditLimit}:{' '}
                {customer.creditLimitPiasters === null ? (
                  messages.customers.limitUnlimited
                ) : customer.creditLimitPiasters === 0 ? (
                  messages.customers.limitNone
                ) : (
                  <span className="numeric">{formatMoney(customer.creditLimitPiasters, digitStyle)}</span>
                )}
              </p>
            </div>
            <div className="shrink-0 text-end">
              <p className="text-sm text-muted">{messages.customers.balance}</p>
              {customer.balancePiasters === 0 ? (
                <Badge tone="success">{messages.customers.settled}</Badge>
              ) : customer.balancePiasters < 0 ? (
                <span className="flex flex-col items-end gap-1">
                  <span className="numeric text-h3 font-semibold text-ink">{formatMoney(-customer.balancePiasters, digitStyle)}</span>
                  <Badge tone="info">{messages.customers.overpaid}</Badge>
                </span>
              ) : (
                <p className="numeric text-h3 font-semibold text-ink">{formatMoney(customer.balancePiasters, digitStyle)}</p>
              )}
            </div>
          </div>

          <section aria-label={messages.customers.receivePayment} className="flex flex-col gap-3 rounded-lg border border-line p-4">
            <h3 className="text-h3 font-semibold text-ink">{messages.customers.receivePayment}</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label={messages.customers.paymentAmount} htmlFor="customer-receive-amount">
                <MoneyInput id="customer-receive-amount" value={amount} onChange={setAmount} digitStyle={digitStyle} />
              </Field>
              <Field label={messages.purchases.payMethod} htmlFor="customer-receive-method">
                <Select
                  id="customer-receive-method"
                  value={method}
                  onChange={(value) => setMethod(value === 'card' ? 'card' : value === 'wallet' ? 'wallet' : 'cash')}
                  options={paymentMethods.map((entry) => ({ value: entry, label: messages.paymentMethods[entry] }))}
                />
              </Field>
            </div>
            <Field label={messages.customers.paymentReference} htmlFor="customer-receive-reference">
              <TextInput
                id="customer-receive-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={300}
              />
            </Field>
            <div>
              <Button variant="primary" loading={saving} disabled={amount <= 0} onClick={receive}>
                {messages.customers.receivePayment}
              </Button>
            </div>
          </section>

          <section aria-label={messages.customers.entries} className="flex flex-col gap-2">
            <h3 className="text-h3 font-semibold text-ink">{messages.customers.entries}</h3>
            {entries === null ? (
              <div className="flex items-center justify-center p-6">
                <Spinner />
              </div>
            ) : entries.length === 0 ? (
              <EmptyState icon={<UsersIcon size={24} />} title={messages.customers.entriesEmpty} />
            ) : (
              <ul className="flex flex-col gap-2">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-2 rounded-md border border-line px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base text-strong">{entryLabel(entry)}</p>
                        <p className="numeric text-sm text-muted">
                          {formatDateTime(entry.occurredAt, digitStyle)}
                          {entry.paymentMethod !== null && ` · ${messages.paymentMethods[entry.paymentMethod as PaymentMethod] ?? entry.paymentMethod}`}
                        </p>
                        {entry.referenceText !== null && <p className="truncate text-sm text-secondary" title={entry.referenceText}>{entry.referenceText}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="numeric text-base font-semibold text-ink">{formatMoney(entry.amountPiasters, digitStyle)}</span>
                        {entry.reversed || entry.reversesEntryId !== null ? (
                          <Badge tone="neutral">{messages.customers.reversed}</Badge>
                        ) : (
                          // Only account-level receipts reverse; document payments
                          // and refunds belong to their invoice, not to this list.
                          entry.entryType === 'customer_receipt' &&
                          canReverse && (
                            <Button variant="ghost" size="sm" onClick={() => setConfirmEntryId(entry.id)}>
                              {messages.customers.reverseReceipt}
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                    {confirmEntryId === entry.id && (
                      <div className="flex items-end gap-2 border-t border-line pt-2">
                        <div className="flex-1">
                          <Field label={messages.customers.reverseReason} htmlFor={`reverse-reason-${entry.id}`}>
                            <TextInput
                              id={`reverse-reason-${entry.id}`}
                              value={reverseReason}
                              onChange={(event) => setReverseReason(event.target.value)}
                              maxLength={300}
                              autoFocus
                            />
                          </Field>
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setConfirmEntryId(null)
                            onReverse(entry.id, reverseReason.trim().length === 0 ? null : reverseReason.trim())
                            setReverseReason('')
                          }}
                        >
                          {messages.common.yes}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmEntryId(null)}>
                          {messages.common.no}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialog>
  )
}
