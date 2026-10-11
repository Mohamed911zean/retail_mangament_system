import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, SearchInput, Spinner, Table, TableEmpty, TD, TH, THead, TRow, TextInput } from '../../components/ui'
import { WalletIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { formatDateTime, formatMoney } from '../../lib/format'
import type { Preferences } from '../../lib/preferences'
import { useToast } from '../../lib/toast'
import type { CurrentUser, ExpenseInput } from '../../../shared/ipc'
import type { PaymentMethod } from '../../../shared/settings'
import type { ExpenseRow, ShiftRow } from '../../../shared/rows'
import { reconciliationTone, type Reconciliation } from './treasury'
import { ExpenseDialog } from './ExpenseDialog'
import { CashMoveDialog } from './CashMoveDialog'

/**
 * The treasury screen (screen 5): shop expenses, manual drawer moves, and the
 * shift history with its counted-vs-expected difference.
 *
 * Opening and closing a shift stays in the POS screen, where the cashier
 * already is. This page records what happens *during* the shift and reads back
 * what closing reconciled — it never re-decides those numbers.
 */
export type TreasuryPageProps = {
  user: CurrentUser
  preferences: Preferences
}

export function TreasuryPage({ user, preferences }: TreasuryPageProps) {
  const toast = useToast()
  const digitStyle = preferences.digitStyle

  const [tab, setTab] = useState<'expenses' | 'shifts'>('expenses')
  const [openShift, setOpenShift] = useState<ShiftRow | null>(null)
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null)
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null)
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map())
  const [paymentMethods, setPaymentMethods] = useState<readonly PaymentMethod[]>(['cash'])
  const [failed, setFailed] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const [query, setQuery] = useState('')
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [expenseError, setExpenseError] = useState<string | null>(null)
  const [cashMove, setCashMove] = useState<{ direction: 'in' | 'out' } | null>(null)
  const [cashError, setCashError] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<ExpenseRow | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [triedVoid, setTriedVoid] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const canVoid = user.permissions.includes('document.void')

  // The drawer state is IPC data the page cannot render without asking.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true
    setOpenShift(null)
    setShifts(null)
    setExpenses(null)
    setFailed(false)
    void (async () => {
      try {
        const [info, current, history, allExpenses, users] = await Promise.all([
          unwrap(window.api.app.getInfo()),
          unwrap(window.api.shifts.current()),
          unwrap(window.api.shifts.list()),
          unwrap(window.api.shifts.listExpenses()),
          unwrap(window.api.users.list()),
        ])
        if (!alive) return
        setPaymentMethods(info.settings.payment_methods)
        setOpenShift(current)
        setShifts(history)
        setExpenses(allExpenses)
        setUserNames(new Map(users.map((entry) => [entry.id, entry.displayName])))
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [reloadTick])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function refresh(): Promise<void> {
    const [current, history, allExpenses] = await Promise.all([
      unwrap(window.api.shifts.current()),
      unwrap(window.api.shifts.list()),
      unwrap(window.api.shifts.listExpenses()),
    ])
    setOpenShift(current)
    setShifts(history)
    setExpenses(allExpenses)
  }

  async function handleSaveExpense(input: ExpenseInput): Promise<void> {
    setSaving(true)
    setExpenseError(null)
    try {
      await unwrap(window.api.shifts.recordExpense(input))
      setExpenseOpen(false)
      toast({ message: messages.treasury.expenseSaved, kind: 'success' })
      await refresh()
    } catch (error) {
      setExpenseError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleCashMove(amountPiasters: number, referenceText: string): Promise<void> {
    if (cashMove === null || openShift === null) return
    setSaving(true)
    setCashError(null)
    try {
      const input = { shiftId: openShift.id, amountPiasters, referenceText }
      if (cashMove.direction === 'in') await unwrap(window.api.shifts.cashIn(input))
      else await unwrap(window.api.shifts.cashOut(input))
      setCashMove(null)
      toast({ message: messages.treasury.moveSaved, kind: 'success' })
      await refresh()
    } catch (error) {
      setCashError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleVoidExpense(): Promise<void> {
    setTriedVoid(true)
    if (voidTarget === null || voidReason.trim().length === 0) return
    setSaving(true)
    setVoidError(null)
    try {
      await unwrap(window.api.voids.voidExpense({ documentId: voidTarget.id, reason: voidReason.trim() }))
      setVoidTarget(null)
      setVoidReason('')
      setTriedVoid(false)
      toast({ message: messages.treasury.expenseVoided, kind: 'success' })
      await refresh()
    } catch (error) {
      setVoidError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  const visibleExpenses = (expenses ?? []).filter((expense) => {
    const needle = query.trim().toLowerCase()
    if (needle.length === 0) return true
    return expense.category.toLowerCase().includes(needle) || expense.description.toLowerCase().includes(needle)
  }).reverse()

  function reconciliationBadge(reconciliation: Reconciliation) {
    const label = reconciliation === 'balanced' ? messages.treasury.balanced : reconciliation === 'over' ? messages.treasury.over : messages.treasury.short
    return <Badge tone={reconciliationTone(reconciliation)}>{label}</Badge>
  }

  function renderExpenses() {
    if (expenses === null) {
      return (
        <Card>
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        </Card>
      )
    }
    return (
      <>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1">
            <SearchInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery('')}
              placeholder={messages.common.search}
              autoFocus
            />
          </div>
          <Button variant="outline" onClick={() => { setCashError(null); setCashMove({ direction: 'in' }) }}>
            {messages.treasury.cashIn}
          </Button>
          <Button variant="outline" onClick={() => { setCashError(null); setCashMove({ direction: 'out' }) }}>
            {messages.treasury.cashOut}
          </Button>
          <Button variant="primary" onClick={() => { setExpenseError(null); setExpenseOpen(true) }}>
            {messages.treasury.addExpense}
          </Button>
        </div>
        {openShift === null && <Alert tone="info">{messages.treasury.noOpenShift}</Alert>}
        <Table>
          <THead>
            <TRow>
              <TH>{messages.treasury.date}</TH>
              <TH>{messages.treasury.category}</TH>
              <TH>{messages.treasury.description}</TH>
              <TH numeric>{messages.treasury.amount}</TH>
              <TH>{messages.treasury.status}</TH>
              {canVoid && <TH>{messages.treasury.actions}</TH>}
            </TRow>
          </THead>
          <tbody>
            {visibleExpenses.length === 0 ? (
              <TableEmpty colSpan={canVoid ? 6 : 5}>
                <EmptyState
                  icon={<WalletIcon size={24} />}
                  title={messages.treasury.emptyExpensesTitle}
                  description={messages.treasury.emptyExpensesBody}
                  action={
                    <Button variant="primary" onClick={() => setExpenseOpen(true)}>
                      {messages.treasury.addExpense}
                    </Button>
                  }
                />
              </TableEmpty>
            ) : (
              visibleExpenses.map((expense) => (
                <TRow key={expense.id}>
                  <TD numeric>{formatDateTime(expense.expenseAt, digitStyle)}</TD>
                  <TD>{expense.category}</TD>
                  <TD>
                    <p className="truncate">{expense.description}</p>
                  </TD>
                  <TD numeric>{formatMoney(expense.amountPiasters, digitStyle)}</TD>
                  <TD>
                    {expense.status === 'voided' ? (
                      <Badge tone="neutral">{messages.treasury.voided}</Badge>
                    ) : (
                      <Badge tone="success">{messages.treasury.posted}</Badge>
                    )}
                  </TD>
                  {canVoid && (
                    <TD>
                      <div className="flex justify-end">
                        {expense.status !== 'voided' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setVoidTarget(expense)
                              setVoidReason('')
                              setTriedVoid(false)
                              setVoidError(null)
                            }}
                          >
                            {messages.treasury.voidExpense}
                          </Button>
                        )}
                      </div>
                    </TD>
                  )}
                </TRow>
              ))
            )}
          </tbody>
        </Table>
      </>
    )
  }

  function renderShifts() {
    if (shifts === null) {
      return (
        <Card>
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        </Card>
      )
    }
    const ordered = [...shifts].reverse()
    if (ordered.length === 0) {
      return (
        <Card>
          <EmptyState icon={<WalletIcon size={24} />} title={messages.treasury.emptyShiftsTitle} description={messages.treasury.emptyShiftsBody} />
        </Card>
      )
    }
    return (
      <Table>
        <THead>
          <TRow>
            <TH>{messages.treasury.openedAt}</TH>
            <TH>{messages.treasury.closedAt}</TH>
            <TH numeric>{messages.treasury.openingCash}</TH>
            <TH numeric>{messages.treasury.expectedCash}</TH>
            <TH numeric>{messages.treasury.countedCash}</TH>
            <TH numeric>{messages.treasury.difference}</TH>
            <TH>{messages.treasury.status}</TH>
          </TRow>
        </THead>
        <tbody>
          {ordered.map((shift) => {
            const closed = shift.status !== 'open'
            const reconciliation = shift.differencePiasters === null
              ? null
              : shift.differencePiasters === 0 ? 'balanced' : shift.differencePiasters > 0 ? 'over' : 'short'
            return (
              <TRow key={shift.id}>
                <TD numeric>
                  {formatDateTime(shift.openedAt, digitStyle)}
                  <p className="text-sm text-muted">{userNames.get(shift.userId) ?? ''}</p>
                </TD>
                <TD numeric>{shift.closedAt === null ? messages.common.emptyValue : formatDateTime(shift.closedAt, digitStyle)}</TD>
                <TD numeric>{formatMoney(shift.openingCashPiasters, digitStyle)}</TD>
                <TD numeric>{shift.expectedCashPiasters === null ? messages.common.emptyValue : formatMoney(shift.expectedCashPiasters, digitStyle)}</TD>
                <TD numeric>{shift.countedCashPiasters === null ? messages.common.emptyValue : formatMoney(shift.countedCashPiasters, digitStyle)}</TD>
                <TD numeric>
                  {shift.differencePiasters === null ? (
                    messages.common.emptyValue
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      {formatMoney(shift.differencePiasters, digitStyle)}
                      {reconciliation !== null && reconciliationBadge(reconciliation)}
                    </span>
                  )}
                </TD>
                <TD>
                  {closed ? <Badge tone="neutral">{messages.treasury.closedStatus}</Badge> : <Badge tone="success">{messages.treasury.openStatus}</Badge>}
                </TD>
              </TRow>
            )
          })}
        </tbody>
      </Table>
    )
  }

  if (failed) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <Alert tone="error">{messages.treasury.loadError}</Alert>
          <Button variant="outline" onClick={() => setReloadTick((tick) => tick + 1)}>
            {messages.common.retry}
          </Button>
        </div>
      </Card>
    )
  }

  const voidReasonInvalid = triedVoid && voidReason.trim().length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button variant={tab === 'expenses' ? 'secondary' : 'outline'} onClick={() => setTab('expenses')}>
          {messages.treasury.tabExpenses}
        </Button>
        <Button variant={tab === 'shifts' ? 'secondary' : 'outline'} onClick={() => setTab('shifts')}>
          {messages.treasury.tabShifts}
        </Button>
      </div>

      {tab === 'expenses' ? renderExpenses() : renderShifts()}

      <ExpenseDialog
        open={expenseOpen}
        shiftId={openShift?.id ?? null}
        paymentMethods={paymentMethods}
        digitStyle={digitStyle}
        saving={saving}
        errorText={expenseError}
        onClose={() => setExpenseOpen(false)}
        onSave={(input) => void handleSaveExpense(input)}
      />

      <CashMoveDialog
        open={cashMove !== null}
        direction={cashMove?.direction ?? 'in'}
        shiftId={openShift?.id ?? null}
        digitStyle={digitStyle}
        saving={saving}
        errorText={cashError}
        onClose={() => setCashMove(null)}
        onSave={(amountPiasters, referenceText) => void handleCashMove(amountPiasters, referenceText)}
      />

      <Dialog
        open={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        title={messages.treasury.voidExpense}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setVoidTarget(null)}>
              {messages.common.no}
            </Button>
            <Button variant="danger" loading={saving} onClick={() => void handleVoidExpense()}>
              {messages.common.yes}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {voidError !== null && <Alert tone="error">{voidError}</Alert>}
          <p className="text-base font-semibold text-strong">{voidTarget?.description}</p>
          <Field label={messages.treasury.voidReason} htmlFor="expense-void-reason" required error={voidReasonInvalid ? messages.treasury.voidReasonRequired : undefined}>
            <TextInput
              id="expense-void-reason"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              maxLength={300}
              autoFocus
              error={voidReasonInvalid}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  )
}
