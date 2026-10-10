/**
 * The customer picker (design system §4.5, F9).
 *
 * Attaching a customer is what turns an unpaid remainder into a debt, so this
 * dialog also shows the balance and the credit limit: a cashier should see that
 * a customer is already over their limit *before* the invoice is rung up, not
 * after the service refuses it.
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Dialog, EmptyState, SearchInput, Spinner } from '../../components/ui'
import { messages } from '../../i18n'
import { unwrap } from '../../lib/ipc'
import { formatMoney, type DigitStyle } from '../../lib/format'
import { normalizeDigits } from '../../../shared/digits'
import type { CustomerSummary } from '../../../shared/ipc'

export type CustomerDialogProps = {
  open: boolean
  selected: CustomerSummary | null
  creditEnabled: boolean
  digitStyle: DigitStyle
  onClose: () => void
  /** null means "no customer": a plain cash sale. */
  onSelect: (customer: CustomerSummary | null) => void
}

export function CustomerDialog({ open, selected, creditEnabled, digitStyle, onClose, onSelect }: CustomerDialogProps) {
  const [customers, setCustomers] = useState<CustomerSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    let alive = true
    setCustomers(null)
    setFailed(false)

    async function load(): Promise<void> {
      try {
        const list = await unwrap(window.api.customers.list())
        if (alive) setCustomers(list)
      } catch {
        if (alive) setFailed(true)
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [open, reloadTick])

  // A customer is looked up by the number they call from as often as by name, so
  // the phone is searched too — with Arabic-Indic digits folded, since that is
  // what an Arabic keyboard produces.
  const visible = useMemo(() => {
    if (customers === null) return null
    const needle = normalizeDigits(query).trim().toLowerCase()
    if (needle.length === 0) return customers
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(needle) ||
        (customer.phone !== null && normalizeDigits(customer.phone).toLowerCase().includes(needle)),
    )
  }, [customers, query])

  function renderBody() {
    if (failed) {
      return (
        <div className="flex flex-col items-start gap-3">
          <Alert tone="error">{messages.pos.customerLoadError}</Alert>
          <Button variant="outline" onClick={() => setReloadTick((tick) => tick + 1)}>
            {messages.common.retry}
          </Button>
        </div>
      )
    }
    if (visible === null) {
      return (
        <div className="flex items-center justify-center gap-2 p-8 text-muted">
          <Spinner />
          <span>{messages.pos.customerLoading}</span>
        </div>
      )
    }
    if (visible.length === 0) {
      return <EmptyState title={messages.pos.customerEmpty} />
    }
    return (
      <div className="flex flex-col gap-2">
        {visible.map((customer) => {
          const overLimit = customer.creditLimitPiasters !== null && customer.balancePiasters > customer.creditLimitPiasters
          const isSelected = selected !== null && selected.id === customer.id
          return (
            <button
              key={customer.id}
              type="button"
              onClick={() => onSelect(customer)}
              className={
                isSelected
                  ? 'flex flex-col items-start gap-1 rounded-lg border border-brand-700 bg-brand-50 p-3 text-start'
                  : 'flex flex-col items-start gap-1 rounded-lg border border-line bg-surface p-3 text-start hover:bg-brand-50'
              }
            >
              <span className="text-base text-strong">{customer.name}</span>
              {customer.phone !== null && <span className="numeric text-sm text-muted">{customer.phone}</span>}
              <span className="text-sm text-secondary">
                {messages.pos.customerBalance} <span className="numeric">{formatMoney(customer.balancePiasters, digitStyle)}</span>
                {customer.creditLimitPiasters !== null && (
                  <>
                    {' · '}
                    {messages.pos.customerCreditLimit}{' '}
                    <span className="numeric">{formatMoney(customer.creditLimitPiasters, digitStyle)}</span>
                  </>
                )}
              </span>
              {overLimit && <Badge tone="error">{messages.pos.paymentCreditLimit}</Badge>}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title={messages.pos.customerTitle} size="md">
      <div className="flex flex-col gap-3">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
          placeholder={messages.pos.customerSearch}
        />

        {/* "No customer" comes first and is always available: a plain cash sale is
            the common case, and sending the customer elsewhere would be worse. */}
        <Button
          variant={selected === null ? 'secondary' : 'outline'}
          block
          onClick={() => onSelect(null)}
          className="justify-start"
        >
          {messages.pos.customerNone}
        </Button>

        {!creditEnabled && <Alert tone="info">{messages.pos.customerCreditOff}</Alert>}

        <div className="max-h-96 overflow-y-auto pe-1">{renderBody()}</div>
      </div>
    </Dialog>
  )
}
