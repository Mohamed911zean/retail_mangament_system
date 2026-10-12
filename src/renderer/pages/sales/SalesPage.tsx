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
  TextInput,
} from '../../components/ui'
import { ReceiptIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { formatDateTime, formatMoney } from '../../lib/format'
import type { Preferences } from '../../lib/preferences'
import { useToast } from '../../lib/toast'
import type { CurrentUser, CustomerSummary, ProductSummary } from '../../../shared/ipc'
import type { SaleItemRow, SaleRow } from '../../../shared/rows'
import { formatDateInput, parseDateInput, presetRange } from '../reports/salesReport'
import { SaleDetailsDialog } from './SaleDetailsDialog'

/**
 * The sales history (screen 4a): invoices in a date range, searchable by
 * number or customer, with details, receipt reprint and terminal void.
 *
 * The list comes from the reports range query; the details come from the sale
 * service. The receipt is rebuilt in main from the stored invoice, and a void
 * is refused while completed returns hang off the invoice.
 */
export type SalesPageProps = {
  user: CurrentUser
  preferences: Preferences
}

export function SalesPage({ user, preferences }: SalesPageProps) {
  const toast = useToast()
  const digitStyle = preferences.digitStyle
  const receiptPrinter = preferences.receiptPrinter

  const [range, setRange] = useState(() => presetRange('last7', Date.now()))
  const [fromText, setFromText] = useState(() => formatDateInput(range.fromMs))
  const [toText, setToText] = useState(() => formatDateInput(range.toMs - 1))
  const [query, setQuery] = useState('')
  const [sales, setSales] = useState<SaleRow[] | null>(null)
  const [customers, setCustomers] = useState<CustomerSummary[] | null>(null)
  const [products, setProducts] = useState<readonly ProductSummary[] | null>(null)
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map())
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reloadTick, setReloadTick] = useState(0)

  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [detailsSale, setDetailsSale] = useState<SaleRow | null>(null)
  const [detailsItems, setDetailsItems] = useState<SaleItemRow[]>([])
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const [saving, setSaving] = useState(false)

  const canManage = user.role !== 'cashier'

  // Invoices, customers and the catalog are IPC data the page cannot render
  // without asking.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    void (async () => {
      try {
        const [rows, listedCustomers, listedProducts, listedUsers] = await Promise.all([
          unwrap(window.api.reports.sales(range)),
          unwrap(window.api.customers.list()),
          unwrap(window.api.catalog.listProducts()),
          unwrap(window.api.users.list()),
        ])
        if (!alive) return
        setSales(rows)
        setCustomers(listedCustomers)
        setProducts(listedProducts)
        setUserNames(new Map(listedUsers.map((entry) => [entry.id, entry.displayName])))
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
    // The range identity changes on every apply; the tick reloads everything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick])
  /* eslint-enable react-hooks/set-state-in-effect */

  const customerNames = useMemo(() => new Map((customers ?? []).map((customer) => [customer.id, customer.name])), [customers])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const ordered = [...(sales ?? [])].reverse()
    if (needle.length === 0) return ordered
    return ordered.filter(
      (sale) =>
        sale.invoiceNumber.toLowerCase().includes(needle) ||
        (sale.customerId !== null && (customerNames.get(sale.customerId) ?? '').toLowerCase().includes(needle)),
    )
  }, [sales, query, customerNames])

  const activeSale = detailsId === null ? null : (sales ?? []).find((sale) => sale.id === detailsId) ?? detailsSale

  function applyRange(): void {
    const from = parseDateInput(fromText)
    const to = parseDateInput(toText)
    if (from === null || to === null || to < from) return
    setRange({ fromMs: from, toMs: to + 24 * 60 * 60 * 1000 })
    setReloadTick((tick) => tick + 1)
  }

  function applyPreset(preset: 'today' | 'yesterday' | 'last7' | 'month'): void {
    const next = presetRange(preset, Date.now())
    setRange(next)
    setFromText(formatDateInput(next.fromMs))
    setToText(formatDateInput(next.toMs - 1))
    setReloadTick((tick) => tick + 1)
  }

  async function openDetails(saleId: string): Promise<void> {
    setDetailsId(saleId)
    setDetailsSale(null)
    setDetailsItems([])
    setDetailsError(null)
    setPrintError(null)
    try {
      const found = await unwrap(window.api.sales.get(saleId))
      setDetailsSale(found.sale)
      setDetailsItems(found.items)
    } catch (error) {
      setDetailsError(translate(errorKey(error)))
    }
  }

  async function handleReprint(saleId: string): Promise<void> {
    if (receiptPrinter === '') {
      setPrintError(messages.sales.noPrinter)
      return
    }
    setPrinting(true)
    setPrintError(null)
    try {
      await unwrap(window.api.printing.printSaleReceipt(receiptPrinter, saleId))
      toast({ message: messages.sales.printed, kind: 'success' })
    } catch (error) {
      // A failed print never fails the invoice: the receipt is already saved,
      // so the cashier retries from the same dialog.
      setPrintError(translate(errorKey(error)))
    } finally {
      setPrinting(false)
    }
  }

  async function handleVoid(documentId: string, reason: string): Promise<void> {
    setSaving(true)
    setDetailsError(null)
    try {
      await unwrap(window.api.voids.voidSale({ documentId, reason }))
      toast({ message: messages.sales.voided, kind: 'success' })
      const found = await unwrap(window.api.sales.get(documentId))
      setDetailsSale(found.sale)
      setDetailsItems(found.items)
      setReloadTick((tick) => tick + 1)
    } catch (error) {
      setDetailsError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  function statusBadge(sale: SaleRow) {
    if (sale.status === 'voided') return <Badge tone="neutral">{messages.purchases.statusVoided}</Badge>
    if (sale.paymentStatus === 'paid') return <Badge tone="success">{messages.purchases.statusPaid}</Badge>
    if (sale.paymentStatus === 'partial') return <Badge tone="info">{messages.purchases.statusPartial}</Badge>
    return <Badge tone="warning">{messages.purchases.statusCredit}</Badge>
  }

  if (failed) {
    return (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <Alert tone="error">{messages.sales.loadError}</Alert>
          <Button variant="outline" onClick={() => setReloadTick((tick) => tick + 1)}>
            {messages.common.retry}
          </Button>
        </div>
      </Card>
    )
  }

  if (loading || sales === null) {
    return (
      <Card>
        <div className="flex items-center justify-center p-8">
          <Spinner />
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <label htmlFor="sales-from" className="text-sm font-semibold text-strong">
            {messages.reports.fromDate}
          </label>
          <TextInput id="sales-from" type="date" value={fromText} onChange={(event) => setFromText(event.target.value)} dir="ltr" className="numeric" />
        </div>
        <div className="w-40">
          <label htmlFor="sales-to" className="text-sm font-semibold text-strong">
            {messages.reports.toDate}
          </label>
          <TextInput id="sales-to" type="date" value={toText} onChange={(event) => setToText(event.target.value)} dir="ltr" className="numeric" />
        </div>
        <Button variant="primary" onClick={applyRange}>
          {messages.reports.apply}
        </Button>
        <Button variant="ghost" onClick={() => applyPreset('today')}>
          {messages.reports.today}
        </Button>
        <Button variant="ghost" onClick={() => applyPreset('yesterday')}>
          {messages.reports.yesterday}
        </Button>
        <Button variant="ghost" onClick={() => applyPreset('last7')}>
          {messages.reports.last7}
        </Button>
        <Button variant="ghost" onClick={() => applyPreset('month')}>
          {messages.reports.thisMonth}
        </Button>
      </div>

      <div className="min-w-52 max-w-xl">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
          placeholder={messages.sales.searchPlaceholder}
          autoFocus
        />
      </div>

      <Table>
        <THead>
          <TRow>
            <TH numeric>{messages.sales.invoiceNumber}</TH>
            <TH numeric>{messages.purchases.date}</TH>
            <TH>{messages.sales.customer}</TH>
            <TH numeric>{messages.purchases.total}</TH>
            <TH numeric>{messages.purchases.paid}</TH>
            <TH numeric>{messages.purchases.due}</TH>
            <TH end>{messages.sales.actions}</TH>
          </TRow>
        </THead>
        <tbody>
          {visible.length === 0 ? (
            <TableEmpty colSpan={7}>
              <EmptyState icon={<ReceiptIcon size={24} />} title={messages.sales.emptyTitle} description={messages.sales.emptyBody} />
            </TableEmpty>
          ) : (
            visible.map((sale) => (
              <TRow key={sale.id}>
                <TD numeric>{sale.invoiceNumber}</TD>
                <TD numeric>{formatDateTime(sale.createdAt, digitStyle)}</TD>
                <TD>{sale.customerId === null ? messages.common.emptyValue : (customerNames.get(sale.customerId) ?? messages.common.emptyValue)}</TD>
                <TD numeric>{formatMoney(sale.totalPiasters, digitStyle)}</TD>
                <TD numeric>{formatMoney(sale.paidPiasters, digitStyle)}</TD>
                <TD numeric>{formatMoney(sale.duePiasters, digitStyle)}</TD>
                <TD>
                  <div className="flex items-center justify-end gap-2">
                    {statusBadge(sale)}
                    <Button variant="ghost" size="sm" onClick={() => void openDetails(sale.id)}>
                      {messages.sales.showDetails}
                    </Button>
                  </div>
                </TD>
              </TRow>
            ))
          )}
        </tbody>
      </Table>

      <SaleDetailsDialog
        open={detailsId !== null}
        sale={activeSale}
        items={detailsItems}
        customerName={activeSale?.customerId == null ? null : (customerNames.get(activeSale.customerId) ?? null)}
        voidedByName={activeSale?.voidedByUserId == null ? null : (userNames.get(activeSale.voidedByUserId) ?? null)}
        products={products ?? []}
        digitStyle={digitStyle}
        canVoid={canManage}
        saving={saving}
        errorText={detailsError}
        printError={printError}
        printing={printing}
        onClose={() => setDetailsId(null)}
        onReprint={(saleId) => void handleReprint(saleId)}
        onVoid={(documentId, reason) => void handleVoid(documentId, reason)}
      />
    </div>
  )
}
