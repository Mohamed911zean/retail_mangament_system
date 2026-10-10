import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  IconButton,
  SearchInput,
  Spinner,
  Table,
  TableEmpty,
  TD,
  TH,
  THead,
  TRow,
} from '../../components/ui'
import { TrashIcon, TruckIcon, StoreIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { formatDate, formatMoney } from '../../lib/format'
import type { Preferences } from '../../lib/preferences'
import { useToast } from '../../lib/toast'
import type { CurrentUser, LedgerEntrySummary, ProductSummary, PurchaseDetails, PurchaseRow, ReceivePurchaseInput, SupplierInput } from '../../../shared/ipc'
import type { PaymentMethod } from '../../../shared/settings'
import type { SupplierRow } from '../../../shared/rows'
import { PurchaseDialog } from './PurchaseDialog'
import { PurchaseDetailsDialog } from './PurchaseDetailsDialog'
import { SupplierDialog } from './SupplierDialog'
import { SupplierDetailsDialog } from './SupplierDetailsDialog'

/**
 * The purchases screen (screen 2): supplier invoices and the suppliers behind
 * them, in two tabs of one page.
 *
 * The page owns loading and every IPC call; the dialogs own their drafts.
 * Balances are always derived — read from the ledger per supplier — never
 * typed, never stored.
 */
export type PurchasesPageProps = {
  user: CurrentUser
  preferences: Preferences
  initialTab: 'invoices' | 'suppliers'
}

export function PurchasesPage({ user, preferences, initialTab }: PurchasesPageProps) {
  const toast = useToast()
  const digitStyle = preferences.digitStyle

  const [tab, setTab] = useState<'invoices' | 'suppliers'>(initialTab)
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierRow[] | null>(null)
  const [products, setProducts] = useState<readonly ProductSummary[] | null>(null)
  const [balances, setBalances] = useState<Map<string, number | null>>(new Map())
  const [paymentMethods, setPaymentMethods] = useState<readonly PaymentMethod[]>(['cash'])
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [expiryEnabled, setExpiryEnabled] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [details, setDetails] = useState<PurchaseDetails | null>(null)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [supplierEditor, setSupplierEditor] = useState<SupplierRow | 'create' | null>(null)
  const [supplierFormError, setSupplierFormError] = useState<string | null>(null)
  const [supplierDetailsId, setSupplierDetailsId] = useState<string | null>(null)
  const [supplierBalance, setSupplierBalance] = useState<number | null>(null)
  const [supplierEntries, setSupplierEntries] = useState<LedgerEntrySummary[] | null>(null)
  const [supplierDetailsError, setSupplierDetailsError] = useState<string | null>(null)
  const [deleteSupplier, setDeleteSupplier] = useState<SupplierRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const canManage = user.role !== 'cashier'
  const canReverse = user.permissions.includes('document.void')

  // Arriving from the other sidebar entry retabs the page.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Invoices, suppliers and the catalog are IPC data the page cannot render
  // without asking; balances are read per supplier afterwards.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true
    setPurchases(null)
    setSuppliers(null)
    setProducts(null)
    setFailed(false)
    void (async () => {
      try {
        const [info, listedSuppliers, listedProducts] = await Promise.all([
          unwrap(window.api.app.getInfo()),
          unwrap(window.api.suppliers.list()),
          unwrap(window.api.catalog.listProducts()),
        ])
        if (!alive) return
        setPaymentMethods(info.settings.payment_methods)
        setTaxEnabled(info.settings.tax)
        setExpiryEnabled(info.settings.expiry_batches)
        const allPurchases = await unwrap(window.api.purchases.list())
        if (!alive) return
        setPurchases(allPurchases)
        setSuppliers(listedSuppliers)
        setProducts(listedProducts)
        const balances = new Map<string, number | null>()
        await Promise.all(
          listedSuppliers.map(async (supplier) => {
            try {
              const balance = await unwrap(window.api.payments.supplierBalance(supplier.id))
              balances.set(supplier.id, balance.balancePiasters)
            } catch {
              balances.set(supplier.id, null)
            }
          }),
        )
        if (alive) setBalances(balances)
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [reloadTick])
  /* eslint-enable react-hooks/set-state-in-effect */

  const supplierNames = useMemo(() => new Map((suppliers ?? []).map((supplier) => [supplier.id, supplier.name])), [suppliers])

  const visiblePurchases = useMemo(() => {
    const needle = invoiceQuery.trim().toLowerCase()
    const ordered = [...(purchases ?? [])].reverse()
    if (needle.length === 0) return ordered
    return ordered.filter(
      (purchase) =>
        purchase.purchaseNumber.toLowerCase().includes(needle) ||
        (purchase.supplierId !== null && (supplierNames.get(purchase.supplierId) ?? '').toLowerCase().includes(needle)),
    )
  }, [purchases, invoiceQuery, supplierNames])

  const visibleSuppliers = useMemo(() => {
    const needle = supplierQuery.trim().toLowerCase()
    if (needle.length === 0) return suppliers ?? []
    return (suppliers ?? []).filter(
      (supplier) =>
        supplier.name.toLowerCase().includes(needle) || (supplier.phone !== null && supplier.phone.toLowerCase().includes(needle)),
    )
  }, [suppliers, supplierQuery])

  const activeSupplier = supplierDetailsId === null ? null : (suppliers ?? []).find((supplier) => supplier.id === supplierDetailsId) ?? null

  async function refreshLists(): Promise<void> {
    const [listedPurchases, listedSuppliers] = await Promise.all([
      unwrap(window.api.purchases.list()),
      unwrap(window.api.suppliers.list()),
    ])
    setPurchases(listedPurchases)
    setSuppliers(listedSuppliers)
    const next = new Map<string, number | null>()
    await Promise.all(
      listedSuppliers.map(async (supplier) => {
        try {
          const balance = await unwrap(window.api.payments.supplierBalance(supplier.id))
          next.set(supplier.id, balance.balancePiasters)
        } catch {
          next.set(supplier.id, null)
        }
      }),
    )
    setBalances(next)
  }

  async function openDetails(purchaseId: string): Promise<void> {
    setDetailsId(purchaseId)
    setDetails(null)
    setDetailsError(null)
    try {
      setDetails(await unwrap(window.api.purchases.get(purchaseId)))
    } catch (error) {
      setDetailsError(translate(errorKey(error)))
    }
  }

  async function openSupplierDetails(supplierId: string): Promise<void> {
    setSupplierDetailsId(supplierId)
    setSupplierBalance(null)
    setSupplierEntries(null)
    setSupplierDetailsError(null)
    try {
      const [balance, entries] = await Promise.all([
        unwrap(window.api.payments.supplierBalance(supplierId)),
        unwrap(window.api.payments.listEntries({ supplierId })),
      ])
      setSupplierBalance(balance.balancePiasters)
      setSupplierEntries(entries)
    } catch (error) {
      setSupplierDetailsError(translate(errorKey(error)))
    }
  }

  async function refreshSupplierDetails(supplierId: string): Promise<void> {
    const [balance, entries] = await Promise.all([
      unwrap(window.api.payments.supplierBalance(supplierId)),
      unwrap(window.api.payments.listEntries({ supplierId })),
    ])
    setSupplierBalance(balance.balancePiasters)
    setSupplierEntries(entries)
  }

  async function handleReceive(input: ReceivePurchaseInput): Promise<void> {
    setSaving(true)
    setPurchaseError(null)
    try {
      await unwrap(window.api.purchases.receive(input))
      setPurchaseOpen(false)
      toast({ message: messages.purchases.received, kind: 'success' })
      await refreshLists()
    } catch (error) {
      setPurchaseError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleVoid(documentId: string, reason: string): Promise<void> {
    setSaving(true)
    setDetailsError(null)
    try {
      await unwrap(window.api.voids.voidPurchase({ documentId, reason }))
      toast({ message: messages.purchases.voided, kind: 'success' })
      setDetails(await unwrap(window.api.purchases.get(documentId)))
      await refreshLists()
    } catch (error) {
      setDetailsError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveSupplier(input: SupplierInput): Promise<void> {
    setSaving(true)
    setSupplierFormError(null)
    try {
      if (supplierEditor === null || supplierEditor === 'create') {
        await unwrap(window.api.suppliers.create(input))
      } else {
        await unwrap(window.api.suppliers.update(supplierEditor.id, input))
      }
      setSupplierEditor(null)
      toast({ message: messages.suppliers.saved, kind: 'success' })
      await refreshLists()
    } catch (error) {
      setSupplierFormError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSupplier(): Promise<void> {
    if (deleteSupplier === null) return
    setSaving(true)
    setDeleteError(null)
    try {
      await unwrap(window.api.suppliers.delete(deleteSupplier.id))
      setDeleteSupplier(null)
      toast({ message: messages.suppliers.deleted, kind: 'success' })
      await refreshLists()
    } catch (error) {
      setDeleteError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handlePay(supplierId: string, amountPiasters: number, method: PaymentMethod, referenceText: string | null): Promise<void> {
    setSaving(true)
    setSupplierDetailsError(null)
    try {
      await unwrap(window.api.payments.supplierPayment({ supplierId, amountPiasters, method, referenceText }))
      toast({ message: messages.suppliers.paymentSaved, kind: 'success' })
      await refreshSupplierDetails(supplierId)
      await refreshLists()
    } catch (error) {
      setSupplierDetailsError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleReverse(entryId: string, reason: string | null): Promise<void> {
    if (supplierDetailsId === null) return
    setSaving(true)
    setSupplierDetailsError(null)
    try {
      await unwrap(window.api.payments.reverseSupplierPayment({ entryId, reason }))
      toast({ message: messages.suppliers.reversedToast, kind: 'success' })
      await refreshSupplierDetails(supplierDetailsId)
      await refreshLists()
    } catch (error) {
      setSupplierDetailsError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  function statusBadge(purchase: PurchaseRow) {
    if (purchase.status === 'voided') return <Badge tone="neutral">{messages.purchases.statusVoided}</Badge>
    if (purchase.paymentStatus === 'paid') return <Badge tone="success">{messages.purchases.statusPaid}</Badge>
    if (purchase.paymentStatus === 'partial') return <Badge tone="info">{messages.purchases.statusPartial}</Badge>
    return <Badge tone="warning">{messages.purchases.statusCredit}</Badge>
  }

  function renderInvoices() {
    if (purchases === null) {
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
              value={invoiceQuery}
              onChange={(event) => setInvoiceQuery(event.target.value)}
              onClear={() => setInvoiceQuery('')}
              placeholder={messages.products.searchPlaceholder}
              autoFocus
            />
          </div>
          {canManage && (
            <Button
              variant="primary"
              onClick={() => {
                setPurchaseError(null)
                setPurchaseOpen(true)
              }}
            >
              {messages.purchases.addPurchase}
            </Button>
          )}
        </div>
        <Table>
          <THead>
            <TRow>
              <TH numeric>{messages.purchases.invoiceNumber}</TH>
              <TH>{messages.purchases.supplier}</TH>
              <TH>{messages.purchases.date}</TH>
              <TH numeric>{messages.purchases.total}</TH>
              <TH numeric>{messages.purchases.paid}</TH>
              <TH numeric>{messages.purchases.due}</TH>
              <TH>{messages.purchases.actions}</TH>
            </TRow>
          </THead>
          <tbody>
            {visiblePurchases.length === 0 ? (
              <TableEmpty colSpan={7}>
                <EmptyState
                  icon={<TruckIcon size={24} />}
                  title={messages.purchases.emptyTitle}
                  description={messages.purchases.emptyBody}
                  action={
                    canManage ? (
                      <Button variant="primary" onClick={() => setPurchaseOpen(true)}>
                        {messages.purchases.addPurchase}
                      </Button>
                    ) : undefined
                  }
                />
              </TableEmpty>
            ) : (
              visiblePurchases.map((purchase) => (
                <TRow key={purchase.id}>
                  <TD numeric>{purchase.purchaseNumber}</TD>
                  <TD>{purchase.supplierId === null ? messages.common.emptyValue : (supplierNames.get(purchase.supplierId) ?? messages.common.emptyValue)}</TD>
                  <TD numeric>{formatDate(purchase.createdAt, digitStyle)}</TD>
                  <TD numeric>{formatMoney(purchase.totalPiasters, digitStyle)}</TD>
                  <TD numeric>{formatMoney(purchase.paidPiasters, digitStyle)}</TD>
                  <TD numeric>{formatMoney(purchase.duePiasters, digitStyle)}</TD>
                  <TD>
                    <div className="flex items-center justify-end gap-2">
                      {statusBadge(purchase)}
                      <Button variant="ghost" size="sm" onClick={() => void openDetails(purchase.id)}>
                        {messages.purchases.showDetails}
                      </Button>
                    </div>
                  </TD>
                </TRow>
              ))
            )}
          </tbody>
        </Table>
      </>
    )
  }

  function renderSuppliers() {
    if (suppliers === null) {
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
              value={supplierQuery}
              onChange={(event) => setSupplierQuery(event.target.value)}
              onClear={() => setSupplierQuery('')}
              placeholder={messages.products.searchPlaceholder}
              autoFocus
            />
          </div>
          {canManage && (
            <Button
              variant="primary"
              onClick={() => {
                setSupplierFormError(null)
                setSupplierEditor('create')
              }}
            >
              {messages.suppliers.addSupplier}
            </Button>
          )}
        </div>
        <Table>
          <THead>
            <TRow>
              <TH>{messages.suppliers.name}</TH>
              <TH numeric>{messages.suppliers.balance}</TH>
              <TH>{messages.purchases.actions}</TH>
            </TRow>
          </THead>
          <tbody>
            {visibleSuppliers.length === 0 ? (
              <TableEmpty colSpan={3}>
                <EmptyState
                  icon={<StoreIcon size={24} />}
                  title={messages.suppliers.emptyTitle}
                  description={messages.suppliers.emptyBody}
                  action={
                    canManage ? (
                      <Button variant="primary" onClick={() => setSupplierEditor('create')}>
                        {messages.suppliers.addSupplier}
                      </Button>
                    ) : undefined
                  }
                />
              </TableEmpty>
            ) : (
              visibleSuppliers.map((supplier) => {
                const balance = balances.get(supplier.id) ?? null
                return (
                  <TRow key={supplier.id}>
                    <TD>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-strong">{supplier.name}</p>
                        {supplier.phone !== null && <p className="numeric text-sm text-muted">{supplier.phone}</p>}
                      </div>
                    </TD>
                    <TD numeric>
                      {balance === null ? (
                        messages.common.emptyValue
                      ) : balance === 0 ? (
                        <Badge tone="success">{messages.suppliers.settled}</Badge>
                      ) : (
                        formatMoney(balance, digitStyle)
                      )}
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => void openSupplierDetails(supplier.id)}>
                          {messages.suppliers.details}
                        </Button>
                        {canManage && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => setSupplierEditor(supplier)}>
                              {messages.suppliers.edit}
                            </Button>
                            <IconButton
                              variant="ghost"
                              size="sm"
                              label={`${messages.suppliers.deleteSupplier}: ${supplier.name}`}
                              onClick={() => {
                                setDeleteSupplier(supplier)
                                setDeleteError(null)
                              }}
                            >
                              <TrashIcon size={16} />
                            </IconButton>
                          </>
                        )}
                      </div>
                    </TD>
                  </TRow>
                )
              })
            )}
          </tbody>
        </Table>
      </>
    )
  }

  if (failed) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <Alert tone="error">{messages.purchases.loadError}</Alert>
          <Button variant="outline" onClick={() => setReloadTick((tick) => tick + 1)}>
            {messages.common.retry}
          </Button>
        </div>
      </Card>
    )
  }

  const deleteBalance = deleteSupplier === null ? null : (balances.get(deleteSupplier.id) ?? null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button variant={tab === 'invoices' ? 'secondary' : 'outline'} onClick={() => setTab('invoices')}>
          {messages.purchases.tabInvoices}
        </Button>
        <Button variant={tab === 'suppliers' ? 'secondary' : 'outline'} onClick={() => setTab('suppliers')}>
          {messages.purchases.tabSuppliers}
        </Button>
      </div>

      {tab === 'invoices' ? renderInvoices() : renderSuppliers()}

      <PurchaseDialog
        open={purchaseOpen}
        products={products ?? []}
        suppliers={suppliers ?? []}
        paymentMethods={paymentMethods}
        taxEnabled={taxEnabled}
        expiryEnabled={expiryEnabled}
        digitStyle={digitStyle}
        saving={saving}
        errorText={purchaseError}
        onClose={() => setPurchaseOpen(false)}
        onSave={(input) => void handleReceive(input)}
      />

      <PurchaseDetailsDialog
        open={detailsId !== null}
        details={details}
        products={products ?? []}
        supplierName={details?.purchase.supplierId === null || details?.purchase.supplierId === undefined ? null : (supplierNames.get(details.purchase.supplierId) ?? null)}
        digitStyle={digitStyle}
        canVoid={canManage}
        saving={saving}
        errorText={detailsError}
        onClose={() => setDetailsId(null)}
        onVoid={(documentId, reason) => void handleVoid(documentId, reason)}
      />

      <SupplierDialog
        open={supplierEditor !== null}
        supplier={supplierEditor === null || supplierEditor === 'create' ? null : supplierEditor}
        saving={saving}
        errorText={supplierFormError}
        onClose={() => setSupplierEditor(null)}
        onSave={(input) => void handleSaveSupplier(input)}
      />

      <SupplierDetailsDialog
        open={supplierDetailsId !== null}
        supplier={activeSupplier}
        balancePiasters={supplierBalance}
        entries={supplierEntries}
        paymentMethods={paymentMethods}
        digitStyle={digitStyle}
        saving={saving}
        errorText={supplierDetailsError}
        canReverse={canReverse}
        onClose={() => setSupplierDetailsId(null)}
        onPay={(supplierId, amountPiasters, method, referenceText) => void handlePay(supplierId, amountPiasters, method, referenceText)}
        onReverse={(entryId, reason) => void handleReverse(entryId, reason)}
      />

      <Dialog
        open={deleteSupplier !== null}
        onClose={() => setDeleteSupplier(null)}
        title={messages.suppliers.deleteSupplierTitle}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteSupplier(null)}>
              {messages.common.no}
            </Button>
            <Button variant="danger" loading={saving} onClick={() => void handleDeleteSupplier()}>
              {messages.suppliers.deleteSupplier}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {deleteError !== null && <Alert tone="error">{deleteError}</Alert>}
          <p className="text-base font-semibold text-strong">{deleteSupplier?.name}</p>
          <p className="text-sm text-secondary">{messages.suppliers.deleteSupplierBody}</p>
          {deleteBalance !== null && deleteBalance > 0 && (
            <Alert tone="warning">
              {messages.suppliers.supplierHasBalance} <span className="numeric">{formatMoney(deleteBalance, digitStyle)}</span>
            </Alert>
          )}
        </div>
      </Dialog>
    </div>
  )
}
