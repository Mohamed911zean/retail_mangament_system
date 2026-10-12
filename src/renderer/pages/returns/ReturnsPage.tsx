import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  SearchInput,
  Spinner,
  Table,
  TableEmpty,
  TD,
  TH,
  THead,
  TRow,
  TextInput,
} from '../../components/ui'
import { ReturnIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { formatDateTime, formatMoney, formatQty } from '../../lib/format'
import type { Preferences } from '../../lib/preferences'
import { useToast } from '../../lib/toast'
import type { CreateReturnInput, CurrentUser, ProductSummary, ReturnDetails } from '../../../shared/ipc'
import type { SaleReturnRow } from '../../../shared/rows'
import { ReturnDialog } from './ReturnDialog'

/**
 * The returns screen (screen 4b): returns created from original invoices,
 * with details and terminal void.
 *
 * A return never edits its invoice: resalable lines restock through new
 * movements, the refund is a new ledger entry, and a wrong return is voided —
 * the original sale always stays readable.
 */
export type ReturnsPageProps = {
  user: CurrentUser
  preferences: Preferences
}

export function ReturnsPage({ user, preferences }: ReturnsPageProps) {
  const toast = useToast()
  const digitStyle = preferences.digitStyle

  const [returns, setReturns] = useState<SaleReturnRow[] | null>(null)
  const [products, setProducts] = useState<readonly ProductSummary[] | null>(null)
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map())
  const [openShiftId, setOpenShiftId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reloadTick, setReloadTick] = useState(0)

  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [details, setDetails] = useState<ReturnDetails | null>(null)
  const [originalNumber, setOriginalNumber] = useState<string | null>(null)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [triedVoid, setTriedVoid] = useState(false)
  const [confirmingVoid, setConfirmingVoid] = useState(false)
  const [saving, setSaving] = useState(false)

  const canVoid = user.permissions.includes('document.void')

  // Returns, the catalog and the shift are IPC data the page cannot render
  // without asking.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    void (async () => {
      try {
        const [listed, listedProducts, listedUsers, current] = await Promise.all([
          unwrap(window.api.returns.list()),
          unwrap(window.api.catalog.listProducts()),
          unwrap(window.api.users.list()),
          unwrap(window.api.shifts.current()),
        ])
        if (!alive) return
        setReturns(listed)
        setProducts(listedProducts)
        setUserNames(new Map(listedUsers.map((entry) => [entry.id, entry.displayName])))
        setOpenShiftId(current?.id ?? null)
        setLoading(false)
      } catch {
        if (alive) {
          setFailed(true)
          setLoading(false)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [reloadTick])
  /* eslint-enable react-hooks/set-state-in-effect */

  const productsById = useMemo(() => new Map((products ?? []).map((product) => [product.id, product])), [products])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const ordered = [...(returns ?? [])].reverse()
    if (needle.length === 0) return ordered
    return ordered.filter((entry) => entry.returnNumber.toLowerCase().includes(needle))
  }, [returns, query])

  async function refresh(): Promise<void> {
    setReturns(await unwrap(window.api.returns.list()))
  }

  async function handleCreate(input: CreateReturnInput): Promise<void> {
    setSaving(true)
    setCreateError(null)
    try {
      await unwrap(window.api.returns.create(input))
      setCreateOpen(false)
      toast({ message: messages.returns.saved, kind: 'success' })
      await refresh()
    } catch (error) {
      setCreateError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function openDetails(returnId: string): Promise<void> {
    setDetailsId(returnId)
    setDetails(null)
    setOriginalNumber(null)
    setDetailsError(null)
    setVoidReason('')
    setTriedVoid(false)
    setConfirmingVoid(false)
    try {
      const found = await unwrap(window.api.returns.get(returnId))
      setDetails(found)
      try {
        const sale = await unwrap(window.api.sales.get(found.saleReturn.originalSaleId))
        setOriginalNumber(sale.sale.invoiceNumber)
      } catch {
        setOriginalNumber(null)
      }
    } catch (error) {
      setDetailsError(translate(errorKey(error)))
    }
  }

  async function handleVoid(): Promise<void> {
    setTriedVoid(true)
    if (details === null || voidReason.trim().length === 0) return
    setConfirmingVoid(true)
  }

  async function confirmVoid(): Promise<void> {
    if (details === null) return
    setSaving(true)
    setDetailsError(null)
    try {
      await unwrap(window.api.voids.voidSaleReturn({ documentId: details.saleReturn.id, reason: voidReason.trim() }))
      toast({ message: messages.returns.voidedToast, kind: 'success' })
      setDetails(await unwrap(window.api.returns.get(details.saleReturn.id)))
      await refresh()
    } catch (error) {
      setDetailsError(translate(errorKey(error)))
    } finally {
      setSaving(false)
      setConfirmingVoid(false)
    }
  }

  function statusBadge(entry: SaleReturnRow) {
    return entry.status === 'voided' ? <Badge tone="neutral">{messages.returns.voided}</Badge> : <Badge tone="success">{messages.returns.completed}</Badge>
  }

  if (failed) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <Alert tone="error">{messages.returns.loadError}</Alert>
          <Button variant="outline" onClick={() => setReloadTick((tick) => tick + 1)}>
            {messages.common.retry}
          </Button>
        </div>
      </Card>
    )
  }

  if (loading || returns === null) {
    return (
      <Card>
        <div className="flex items-center justify-center p-8">
          <Spinner />
        </div>
      </Card>
    )
  }

  const voidReasonInvalid = triedVoid && voidReason.trim().length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-52 max-w-xl flex-1">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery('')}
            placeholder={messages.returns.searchPlaceholder}
            autoFocus
          />
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setCreateError(null)
            setCreateOpen(true)
          }}
        >
          {messages.returns.newReturn}
        </Button>
      </div>

      <Table>
        <THead>
          <TRow>
            <TH numeric>{messages.returns.returnNumber}</TH>
            <TH numeric>{messages.returns.date}</TH>
            <TH numeric>{messages.returns.total}</TH>
            <TH>{messages.returns.status}</TH>
            <TH end>{messages.returns.actions}</TH>
          </TRow>
        </THead>
        <tbody>
          {visible.length === 0 ? (
            <TableEmpty colSpan={5}>
              <EmptyState icon={<ReturnIcon size={24} />} title={messages.returns.emptyTitle} description={messages.returns.emptyBody} />
            </TableEmpty>
          ) : (
            visible.map((entry) => (
              <TRow key={entry.id}>
                <TD numeric>{entry.returnNumber}</TD>
                <TD numeric>{formatDateTime(entry.createdAt, digitStyle)}</TD>
                <TD numeric>{formatMoney(entry.totalPiasters, digitStyle)}</TD>
                <TD>{statusBadge(entry)}</TD>
                <TD>
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => void openDetails(entry.id)}>
                      {messages.returns.showDetails}
                    </Button>
                  </div>
                </TD>
              </TRow>
            ))
          )}
        </tbody>
      </Table>

      <ReturnDialog
        open={createOpen}
        products={products ?? []}
        shiftId={openShiftId}
        digitStyle={digitStyle}
        saving={saving}
        errorText={createError}
        onClose={() => setCreateOpen(false)}
        onSave={(input) => void handleCreate(input)}
      />

      <Dialog
        open={detailsId !== null}
        onClose={() => setDetailsId(null)}
        title={messages.returns.details}
        size="md"
      >
        {details === null ? (
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {detailsError !== null && <Alert tone="error">{detailsError}</Alert>}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3">
              <div>
                <p className="text-sm text-muted">{messages.returns.returnNumber}</p>
                <p className="numeric text-h3 font-semibold text-ink">{details.saleReturn.returnNumber}</p>
              </div>
              <div>
                <p className="text-sm text-muted">{messages.returns.originalInvoice}</p>
                <p className="numeric text-base font-semibold text-ink">{originalNumber ?? messages.common.emptyValue}</p>
              </div>
              <div>
                <p className="text-sm text-muted">{messages.returns.date}</p>
                <p className="numeric text-base text-ink">{formatDateTime(details.saleReturn.createdAt, digitStyle)}</p>
              </div>
              <div>{statusBadge(details.saleReturn)}</div>
            </div>

            <Table>
              <THead>
                <TRow>
                  <TH>{messages.returns.product}</TH>
                  <TH numeric>{messages.returns.returnQty}</TH>
                  <TH>{messages.returns.condition}</TH>
                  <TH numeric>{messages.returns.total}</TH>
                </TRow>
              </THead>
              <tbody>
                {details.items.map((item) => {
                  const product = productsById.get(item.productId)
                  return (
                    <TRow key={item.id}>
                      <TD>
                        <p className="truncate font-semibold text-strong" title={product?.name ?? item.productId}>
                          {product?.name ?? item.productId}
                        </p>
                      </TD>
                      <TD numeric>{formatQty(item.qtyBase, product?.qtyScale ?? 0, product?.baseUnitName ?? '', digitStyle)}</TD>
                      <TD>
                        <Badge tone={item.condition === 'resalable' ? 'success' : 'warning'}>
                          {item.condition === 'resalable' ? messages.returns.resalable : messages.returns.damaged}
                        </Badge>
                      </TD>
                      <TD numeric>{formatMoney(item.refundPiasters, digitStyle)}</TD>
                    </TRow>
                  )
                })}
              </tbody>
            </Table>

            <div className="flex flex-col gap-1 rounded-lg border border-line px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-secondary">{messages.returns.total}</span>
                <span className="numeric text-h3 font-semibold text-ink">{formatMoney(details.saleReturn.totalPiasters, digitStyle)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm text-secondary">
                <span>
                  {messages.returns.cashRefund} <span className="numeric">{formatMoney(details.saleReturn.cashRefundedPiasters, digitStyle)}</span>
                </span>
                <span>
                  {messages.returns.credited} <span className="numeric">{formatMoney(details.saleReturn.creditedToAccountPiasters, digitStyle)}</span>
                </span>
              </div>
            </div>

            {details.saleReturn.status === 'voided' && (
              <section aria-label={messages.returns.voided} className="flex flex-col gap-2 rounded-lg border border-line bg-panel px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-secondary">{messages.returns.voidReason}</span>
                  <span className="text-base font-semibold text-ink">{details.saleReturn.voidReason ?? messages.common.emptyValue}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-secondary">{messages.sales.voidedBy}</span>
                  <span className="text-base text-ink">
                    {details.saleReturn.voidedByUserId == null ? messages.common.emptyValue : (userNames.get(details.saleReturn.voidedByUserId) ?? messages.common.emptyValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-secondary">{messages.sales.voidedAt}</span>
                  <span className="numeric text-base text-ink">
                    {details.saleReturn.voidedAt === null ? messages.common.emptyValue : formatDateTime(details.saleReturn.voidedAt, digitStyle)}
                  </span>
                </div>
              </section>
            )}

            {canVoid && details.saleReturn.status !== 'voided' && (
              <section aria-label={messages.returns.voidReturn} className="flex flex-col gap-3 rounded-lg border border-line p-4">
                <p className="text-sm text-secondary">{messages.returns.voidConfirm}</p>
                <Field label={messages.returns.voidReason} htmlFor="return-void-reason" required error={voidReasonInvalid ? messages.returns.voidReasonRequired : undefined}>
                  <TextInput
                    id="return-void-reason"
                    value={voidReason}
                    onChange={(event) => setVoidReason(event.target.value)}
                    maxLength={300}
                    error={voidReasonInvalid}
                  />
                </Field>
                {confirmingVoid ? (
                  <div className="flex items-center gap-2">
                    <Button variant="danger" loading={saving} onClick={() => void confirmVoid()}>
                      {messages.common.yes}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmingVoid(false)}>
                      {messages.common.no}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Button variant="danger" onClick={() => void handleVoid()}>
                      {messages.returns.voidReturn}
                    </Button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}
