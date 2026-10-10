import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Spinner,
  Table,
  TableEmpty,
  TD,
  TH,
  THead,
  TRow,
} from '../../components/ui'
import { UsersIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { formatMoney } from '../../lib/format'
import type { Preferences } from '../../lib/preferences'
import { useToast } from '../../lib/toast'
import type { CurrentUser, CustomerInput, CustomerSummary, LedgerEntrySummary } from '../../../shared/ipc'
import type { PaymentMethod } from '../../../shared/settings'
import { canManageCustomers, filterCustomers } from './customerFilter'
import { CustomerDialog } from './CustomerDialog'
import { CustomerDetailsDialog } from './CustomerDetailsDialog'

/**
 * The customers screen (screen 3): the account book next to the cash drawer.
 *
 * Balances arrive derived from the main process with every row — the screen
 * never computes what a customer owes. A receipt settles credit; a reversal
 * compensates a receipt; both live in the account dialog, not in this list.
 */
export type CustomersPageProps = {
  user: CurrentUser
  preferences: Preferences
}

export function CustomersPage({ user, preferences }: CustomersPageProps) {
  const toast = useToast()
  const digitStyle = preferences.digitStyle

  const [customers, setCustomers] = useState<CustomerSummary[] | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<readonly PaymentMethod[]>(['cash'])
  const [failed, setFailed] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<CustomerSummary | 'create' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [entries, setEntries] = useState<LedgerEntrySummary[] | null>(null)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const canManage = canManageCustomers(user.role)
  const canReverse = user.permissions.includes('document.void')

  // The account book is IPC data the page cannot render without asking.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true
    setCustomers(null)
    setFailed(false)
    void (async () => {
      try {
        const [info, listed] = await Promise.all([unwrap(window.api.app.getInfo()), unwrap(window.api.customers.list())])
        if (!alive) return
        setPaymentMethods(info.settings.payment_methods)
        setCustomers(listed)
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [reloadTick])
  /* eslint-enable react-hooks/set-state-in-effect */

  const visible = useMemo(() => filterCustomers(customers ?? [], query), [customers, query])

  const activeCustomer = detailsId === null ? null : (customers ?? []).find((customer) => customer.id === detailsId) ?? null

  async function refresh(): Promise<void> {
    setCustomers(await unwrap(window.api.customers.list()))
  }

  async function openDetails(customerId: string): Promise<void> {
    setDetailsId(customerId)
    setEntries(null)
    setDetailsError(null)
    try {
      setEntries(await unwrap(window.api.payments.listEntries({ customerId })))
    } catch (error) {
      setDetailsError(translate(errorKey(error)))
    }
  }

  async function refreshDetails(customerId: string): Promise<void> {
    setEntries(await unwrap(window.api.payments.listEntries({ customerId })))
  }

  async function handleSave(input: CustomerInput): Promise<void> {
    setSaving(true)
    setFormError(null)
    try {
      if (editor === null || editor === 'create') {
        await unwrap(window.api.customers.create(input))
      } else {
        await unwrap(window.api.customers.update(editor.id, input))
      }
      setEditor(null)
      toast({ message: messages.customers.saved, kind: 'success' })
      await refresh()
    } catch (error) {
      setFormError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleReceive(customerId: string, amountPiasters: number, method: PaymentMethod, referenceText: string | null): Promise<void> {
    setSaving(true)
    setDetailsError(null)
    try {
      await unwrap(window.api.payments.receipt({ customerId, amountPiasters, method, referenceText }))
      toast({ message: messages.customers.paymentSaved, kind: 'success' })
      await refreshDetails(customerId)
      await refresh()
    } catch (error) {
      setDetailsError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleReverse(entryId: string, reason: string | null): Promise<void> {
    if (detailsId === null) return
    setSaving(true)
    setDetailsError(null)
    try {
      await unwrap(window.api.payments.reverseReceipt({ entryId, reason }))
      toast({ message: messages.customers.reversedToast, kind: 'success' })
      await refreshDetails(detailsId)
      await refresh()
    } catch (error) {
      setDetailsError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  function limitText(customer: CustomerSummary): string {
    if (customer.creditLimitPiasters === null) return messages.customers.limitUnlimited
    if (customer.creditLimitPiasters === 0) return messages.customers.limitNone
    return formatMoney(customer.creditLimitPiasters, digitStyle)
  }

  function renderBody() {
    if (failed) {
      return (
        <Card>
          <div className="flex flex-col items-start gap-3">
            <Alert tone="error">{messages.customers.loadError}</Alert>
            <Button variant="outline" onClick={() => setReloadTick((tick) => tick + 1)}>
              {messages.common.retry}
            </Button>
          </div>
        </Card>
      )
    }
    if (customers === null) {
      return (
        <Card>
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        </Card>
      )
    }
    return (
      <Table>
        <THead>
          <TRow>
            <TH>{messages.customers.name}</TH>
            <TH numeric>{messages.customers.balance}</TH>
            <TH>{messages.customers.creditLimit}</TH>
            {canManage && <TH>{messages.customers.actions}</TH>}
          </TRow>
        </THead>
        <tbody>
          {visible.length === 0 ? (
            <TableEmpty colSpan={canManage ? 4 : 3}>
              <EmptyState
                icon={<UsersIcon size={24} />}
                title={messages.customers.emptyTitle}
                description={messages.customers.emptyBody}
                action={
                  canManage ? (
                    <Button variant="primary" onClick={() => setEditor('create')}>
                      {messages.customers.addCustomer}
                    </Button>
                  ) : undefined
                }
              />
            </TableEmpty>
          ) : (
            visible.map((customer) => (
              <TRow key={customer.id}>
                <TD>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-strong">{customer.name}</p>
                    {customer.phone !== null && <p className="numeric text-sm text-muted">{customer.phone}</p>}
                  </div>
                </TD>
                <TD numeric>
                  {customer.balancePiasters === 0 ? (
                    <Badge tone="success">{messages.customers.settled}</Badge>
                  ) : customer.balancePiasters < 0 ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="numeric">{formatMoney(-customer.balancePiasters, digitStyle)}</span>
                      <Badge tone="info">{messages.customers.overpaid}</Badge>
                    </span>
                  ) : (
                    formatMoney(customer.balancePiasters, digitStyle)
                  )}
                </TD>
                <TD>{limitText(customer)}</TD>
                {canManage && (
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => void openDetails(customer.id)}>
                        {messages.customers.details}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditor(customer)}>
                        {messages.customers.edit}
                      </Button>
                    </div>
                  </TD>
                )}
              </TRow>
            ))
          )}
        </tbody>
      </Table>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-52 flex-1">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery('')}
            placeholder={messages.customers.searchPlaceholder}
            autoFocus
          />
        </div>
        {canManage && (
          <Button
            variant="primary"
            onClick={() => {
              setFormError(null)
              setEditor('create')
            }}
          >
            {messages.customers.addCustomer}
          </Button>
        )}
      </div>

      {renderBody()}

      <CustomerDialog
        open={editor !== null}
        customer={editor === null || editor === 'create' ? null : editor}
        digitStyle={digitStyle}
        saving={saving}
        errorText={formError}
        onClose={() => setEditor(null)}
        onSave={(input) => void handleSave(input)}
      />

      <CustomerDetailsDialog
        open={detailsId !== null}
        customer={activeCustomer}
        entries={entries}
        paymentMethods={paymentMethods}
        digitStyle={digitStyle}
        saving={saving}
        errorText={detailsError}
        canReverse={canReverse}
        onClose={() => setDetailsId(null)}
        onReceive={(customerId, amountPiasters, method, referenceText) => void handleReceive(customerId, amountPiasters, method, referenceText)}
        onReverse={(entryId, reason) => void handleReverse(entryId, reason)}
      />
    </div>
  )
}
