import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, Field, MoneyInput, Select, Spinner, TextInput } from '../../components/ui'
import { Badge } from '../../components/ui'
import { ReceiptIcon } from '../../components/icons'
import { messages } from '../../i18n'
import { formatDateTime, formatMoney, type DigitStyle } from '../../lib/format'
import type { LedgerEntrySummary } from '../../../shared/ipc'
import type { PaymentMethod } from '../../../shared/settings'
import type { SupplierRow } from '../../../shared/rows'

/**
 * One supplier's account: the derived balance, the statement rows, a payment
 * form and per-row reversals.
 *
 * Nothing here invents money: the balance and the rows arrive from the main
 * process, and a reversal is a compensating entry the service writes — the row
 * only asks for it.
 */
export type SupplierDetailsDialogProps = {
  open: boolean
  supplier: SupplierRow | null
  /** Null while loading; the derived payable balance in piasters. */
  balancePiasters: number | null
  entries: LedgerEntrySummary[] | null
  paymentMethods: readonly PaymentMethod[]
  digitStyle: DigitStyle
  saving: boolean
  /** Already-translated server error from the last pay/reverse attempt. */
  errorText: string | null
  /** `document.void` — without it the reversal buttons stay hidden. */
  canReverse: boolean
  onClose: () => void
  onPay: (supplierId: string, amountPiasters: number, method: PaymentMethod, referenceText: string | null) => void
  onReverse: (entryId: string, reason: string | null) => void
}

export function SupplierDetailsDialog({
  open,
  supplier,
  balancePiasters,
  entries,
  paymentMethods,
  digitStyle,
  saving,
  errorText,
  canReverse,
  onClose,
  onPay,
  onReverse,
}: SupplierDetailsDialogProps) {
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [confirmEntryId, setConfirmEntryId] = useState<string | null>(null)
  const [reverseReason, setReverseReason] = useState('')

  // Opening a different supplier resets the payment draft and any open confirm.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setAmount(0)
      setReference('')
      setConfirmEntryId(null)
      setReverseReason('')
    }
  }, [open, supplier?.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  function pay(): void {
    if (supplier === null || amount <= 0) return
    onPay(supplier.id, amount, paymentMethods.includes(method) ? method : 'cash', reference.trim().length === 0 ? null : reference.trim())
  }

  return (
    <Dialog open={open} onClose={onClose} title={messages.suppliers.details} size="md">
      {supplier === null ? null : (
        <div className="flex flex-col gap-4">
          {errorText !== null && <Alert tone="error">{errorText}</Alert>}

          <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-panel px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-h3 font-semibold text-ink" title={supplier.name}>{supplier.name}</p>
              {supplier.phone !== null && <p className="numeric text-sm text-muted">{supplier.phone}</p>}
            </div>
            <div className="shrink-0 text-end">
              <p className="text-sm text-muted">{messages.suppliers.balance}</p>
              {balancePiasters === null ? (
                <Spinner />
              ) : balancePiasters === 0 ? (
                <Badge tone="success">{messages.suppliers.settled}</Badge>
              ) : (
                <p className="numeric text-h3 font-semibold text-ink">{formatMoney(balancePiasters, digitStyle)}</p>
              )}
            </div>
          </div>

          <section aria-label={messages.suppliers.paySupplier} className="flex flex-col gap-3 rounded-lg border border-line p-4">
            <h3 className="text-h3 font-semibold text-ink">{messages.suppliers.paySupplier}</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label={messages.suppliers.paymentAmount} htmlFor="supplier-pay-amount">
                <MoneyInput id="supplier-pay-amount" value={amount} onChange={setAmount} digitStyle={digitStyle} />
              </Field>
              <Field label={messages.purchases.payMethod} htmlFor="supplier-pay-method">
                <Select
                  id="supplier-pay-method"
                  value={method}
                  onChange={(value) => setMethod(value === 'card' ? 'card' : value === 'wallet' ? 'wallet' : 'cash')}
                  options={paymentMethods.map((entry) => ({ value: entry, label: messages.paymentMethods[entry] }))}
                />
              </Field>
            </div>
            <Field label={messages.suppliers.paymentReference} htmlFor="supplier-pay-reference">
              <TextInput
                id="supplier-pay-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={300}
              />
            </Field>
            <div>
              <Button variant="primary" loading={saving} disabled={amount <= 0} onClick={pay}>
                {messages.suppliers.paySupplier}
              </Button>
            </div>
          </section>

          <section aria-label={messages.suppliers.entries} className="flex flex-col gap-2">
            <h3 className="text-h3 font-semibold text-ink">{messages.suppliers.entries}</h3>
            {entries === null ? (
              <div className="flex items-center justify-center p-6">
                <Spinner />
              </div>
            ) : entries.length === 0 ? (
              <EmptyState icon={<ReceiptIcon size={24} />} title={messages.suppliers.entriesEmpty} />
            ) : (
              <ul className="flex flex-col gap-2">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-2 rounded-md border border-line px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base text-strong">
                          {entry.reversesEntryId !== null
                            ? messages.suppliers.entryReversal
                            : entry.entryType === 'purchase_payment'
                              ? messages.suppliers.entryPurchase
                              : messages.suppliers.entryPayment}
                        </p>
                        <p className="numeric text-sm text-muted">
                          {formatDateTime(entry.occurredAt, digitStyle)}
                          {entry.paymentMethod !== null && ` · ${messages.paymentMethods[entry.paymentMethod as PaymentMethod] ?? entry.paymentMethod}`}
                        </p>
                        {entry.referenceText !== null && <p className="truncate text-sm text-secondary" title={entry.referenceText}>{entry.referenceText}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="numeric text-base font-semibold text-ink">{formatMoney(entry.amountPiasters, digitStyle)}</span>
                        {entry.reversed || entry.reversesEntryId !== null ? (
                          <Badge tone="neutral">{messages.suppliers.reversed}</Badge>
                        ) : (
                          // Only account-level payments reverse; document payments
                          // belong to their invoice, not to this list.
                          entry.entryType === 'supplier_payment' &&
                          canReverse && (
                            <Button variant="ghost" size="sm" onClick={() => setConfirmEntryId(entry.id)}>
                              {messages.suppliers.reversePayment}
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                    {confirmEntryId === entry.id && (
                      <div className="flex items-end gap-2 border-t border-line pt-2">
                        <div className="flex-1">
                          <Field label={messages.suppliers.reverseReason} htmlFor={`reverse-reason-${entry.id}`}>
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
