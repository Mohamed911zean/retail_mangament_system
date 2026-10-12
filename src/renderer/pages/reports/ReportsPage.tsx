import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Spinner,
  StatCard,
  Table,
  TableEmpty,
  TD,
  TH,
  THead,
  TRow,
  TextInput,
} from '../../components/ui'
import { ChartIcon } from '../../components/icons'
import { messages } from '../../i18n'
import { unwrap } from '../../lib/ipc'
import { formatDate, formatMoney, formatQty, formatRatePercent } from '../../lib/format'
import type { Preferences } from '../../lib/preferences'
import { useToast } from '../../lib/toast'
import type { CurrentUser, CustomerSummary, ProductSummary, ProfitReport, StockValueReport, SupplierRow } from '../../../shared/ipc'
import type { SaleRow, StockBatchRow } from '../../../shared/rows'
import { bucketSalesByDay, formatDateInput, parseDateInput, presetRange, toCsv, type DatePreset } from './salesReport'

/**
 * The reports screen (screen 6): daily sales, profit, stock value and party
 * balances over a date range, with CSV export and printing.
 *
 * Nothing here computes money: daily buckets aggregate finalized invoice rows
 * for display, while profit and stock value arrive from the pure domain
 * functions through the reports IPC. Export is a local file download and print
 * is the system dialog over print CSS — both fully offline.
 */
export type ReportsPageProps = {
  user: CurrentUser
  preferences: Preferences
}

type Tab = 'sales' | 'profit' | 'stock' | 'balances'

export function ReportsPage({ preferences }: ReportsPageProps) {
  const toast = useToast()
  const digitStyle = preferences.digitStyle

  const [tab, setTab] = useState<Tab>('sales')
  const [range, setRange] = useState(() => presetRange('today', Date.now()))
  const [fromText, setFromText] = useState(() => formatDateInput(range.fromMs))
  const [toText, setToText] = useState(() => formatDateInput(range.toMs - 1))
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const [sales, setSales] = useState<SaleRow[] | null>(null)
  const [profit, setProfit] = useState<ProfitReport | null>(null)
  const [stockValue, setStockValue] = useState<StockValueReport | null>(null)
  const [products, setProducts] = useState<readonly ProductSummary[] | null>(null)
  const [customers, setCustomers] = useState<CustomerSummary[] | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierRow[] | null>(null)
  const [supplierBalances, setSupplierBalances] = useState<Map<string, number | null>>(new Map())
  const [batches, setBatches] = useState<{ productId: string; batch: StockBatchRow }[] | null>(null)
  const [expiryEnabled, setExpiryEnabled] = useState(false)
  // Clock for the expiry list, read once so re-renders cannot flicker it.
  const [nowMs] = useState(() => Date.now())

  // Every figure below is IPC data the page cannot render without asking.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    void (async () => {
      try {
        const [info, listedProducts, listedCustomers, listedSuppliers, salesRows, profitReport, stockReport] = await Promise.all([
          unwrap(window.api.app.getInfo()),
          unwrap(window.api.catalog.listProducts()),
          unwrap(window.api.customers.list()),
          unwrap(window.api.suppliers.list()),
          unwrap(window.api.reports.sales(range)),
          unwrap(window.api.reports.profit(range)),
          unwrap(window.api.reports.stockValue()),
        ])
        if (!alive) return
        setExpiryEnabled(info.settings.expiry_batches)
        setProducts(listedProducts)
        setCustomers(listedCustomers)
        setSuppliers(listedSuppliers)
        setSales(salesRows)
        setProfit(profitReport)
        setStockValue(stockReport)
        const balances = new Map<string, number | null>()
        await Promise.all(
          listedSuppliers.map(async (supplier: SupplierRow) => {
            try {
              balances.set(supplier.id, (await unwrap(window.api.payments.supplierBalance(supplier.id))).balancePiasters)
            } catch {
              balances.set(supplier.id, null)
            }
          }),
        )
        if (alive) {
          setSupplierBalances(balances)
          setLoading(false)
        }
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
    // The range object identity changes on every apply; the tick reloads all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick])
  /* eslint-enable react-hooks/set-state-in-effect */

  const productsById = useMemo(() => new Map((products ?? []).map((product) => [product.id, product])), [products])

  const buckets = useMemo(() => (sales === null ? null : bucketSalesByDay(sales)), [sales])
  const bucketTotals = useMemo(() => {
    if (buckets === null) return null
    return buckets.reduce(
      (sum, bucket) => ({
        salesCount: sum.salesCount + bucket.salesCount,
        revenuePiasters: sum.revenuePiasters + bucket.revenuePiasters,
        paidPiasters: sum.paidPiasters + bucket.paidPiasters,
        duePiasters: sum.duePiasters + bucket.duePiasters,
      }),
      { salesCount: 0, revenuePiasters: 0, paidPiasters: 0, duePiasters: 0 },
    )
  }, [buckets])

  const lowStock = useMemo(
    () => (products ?? []).filter((product) => product.lowStockThresholdQty > 0 && product.onHandQty > 0 && product.onHandQty <= product.lowStockThresholdQty),
    [products],
  )
  const reviewIds = useMemo(() => new Set(stockValue?.needsReview ?? []), [stockValue])
  const reviewProducts = useMemo(() => (products ?? []).filter((product) => reviewIds.has(product.id)), [products, reviewIds])

  const expiredRows = useMemo(() => {
    return (batches ?? [])
      .filter(({ batch }) => batch.expiryAt !== null && batch.expiryAt < nowMs)
      .sort((a, b) => (a.batch.expiryAt ?? 0) - (b.batch.expiryAt ?? 0))
  }, [batches, nowMs])

  const receivables = useMemo(() => (customers ?? []).reduce((sum, customer) => sum + Math.max(0, customer.balancePiasters), 0), [customers])
  const payables = useMemo(
    () => [...supplierBalances.values()].reduce<number | null>((sum, balance) => (sum === null || balance === null ? null : sum + Math.max(0, balance)), 0),
    [supplierBalances],
  )

  async function loadBatches(): Promise<void> {
    if (batches !== null || products === null) return
    const tracked = products.filter((product) => product.trackExpiry)
    const loaded = await Promise.all(
      tracked.map(async (product) => ({ productId: product.id, rows: await unwrap(window.api.inventory.listBatches(product.id)) })),
    )
    setBatches(loaded.flatMap(({ productId, rows }) => rows.map((batch) => ({ productId, batch }))))
  }

  function applyRange(): void {
    const from = parseDateInput(fromText)
    const to = parseDateInput(toText)
    if (from === null || to === null || to < from) return
    setRange({ fromMs: from, toMs: to + 24 * 60 * 60 * 1000 })
    setReloadTick((tick) => tick + 1)
  }

  function applyPreset(preset: DatePreset): void {
    const next = presetRange(preset, Date.now())
    setRange(next)
    setFromText(formatDateInput(next.fromMs))
    setToText(formatDateInput(next.toMs - 1))
    setReloadTick((tick) => tick + 1)
  }

  function downloadCsv(filename: string, csv: string): void {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast({ message: filename, kind: 'info' })
  }

  function exportCsv(): void {
    if (tab === 'sales' && buckets !== null && bucketTotals !== null) {
      const rows = buckets.map((bucket) => [bucket.dayKey, bucket.salesCount, bucket.revenuePiasters / 100, bucket.paidPiasters / 100, bucket.duePiasters / 100])
      downloadCsv(`sales-${buckets[0]?.dayKey ?? 'report'}.csv`, toCsv([messages.reports.day, messages.reports.invoices, messages.reports.revenue, messages.reports.paid, messages.reports.due], rows))
    } else if (tab === 'profit' && profit !== null) {
      downloadCsv(
        'profit.csv',
        toCsv(
          [messages.reports.day, messages.reports.revenue],
          [
            [messages.reports.revenue, profit.revenuePiasters / 100],
            [messages.reports.discounts, profit.discountPiasters / 100],
            [messages.reports.cost, profit.costPiasters / 100],
            [messages.reports.grossProfit, profit.grossProfitPiasters / 100],
          ],
        ),
      )
    } else if (tab === 'stock' && stockValue !== null) {
      const rows = stockValue.breakdown.map((row) => {
        const product = productsById.get(row.productId)
        return [product?.name ?? row.productId, formatQty(row.onHandQty, product?.qtyScale ?? 0, product?.baseUnitName ?? '', digitStyle), row.onHandValuePiasters / 100]
      })
      downloadCsv('stock.csv', toCsv([messages.reports.product, messages.reports.onHand, messages.reports.value], rows))
    } else if (tab === 'balances') {
      const rows = [
        ...(customers ?? []).map((customer) => [customer.name, messages.reports.customer, customer.balancePiasters / 100] as (string | number)[]),
        ...(suppliers ?? []).map((supplier) => {
          const balance = supplierBalances.get(supplier.id) ?? null
          return [supplier.name, messages.reports.supplier, balance === null ? 0 : balance / 100] as (string | number)[]
        }),
      ]
      downloadCsv('balances.csv', toCsv([messages.reports.product, messages.reports.balance, messages.reports.balance], rows))
    }
  }

  function renderSales() {
    if (sales === null || buckets === null) {
      return (
        <Card>
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        </Card>
      )
    }
    if (buckets.length === 0) {
      return (
        <Card>
          <EmptyState icon={<ChartIcon size={24} />} title={messages.reports.noSales} description={messages.reports.noSalesHint} />
        </Card>
      )
    }
    return (
      <>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label={messages.reports.invoices} value={String(bucketTotals?.salesCount ?? 0)} />
          <StatCard label={messages.reports.revenue} value={formatMoney(bucketTotals?.revenuePiasters ?? 0, digitStyle)} />
          <StatCard label={messages.reports.paid} value={formatMoney(bucketTotals?.paidPiasters ?? 0, digitStyle)} />
          <StatCard label={messages.reports.due} value={formatMoney(bucketTotals?.duePiasters ?? 0, digitStyle)} />
        </div>
        <Table>
          <THead>
            <TRow>
              <TH numeric>{messages.reports.day}</TH>
              <TH numeric>{messages.reports.invoices}</TH>
              <TH numeric>{messages.reports.revenue}</TH>
              <TH numeric>{messages.reports.paid}</TH>
              <TH numeric>{messages.reports.due}</TH>
            </TRow>
          </THead>
          <tbody>
            {buckets.map((bucket) => (
              <TRow key={bucket.dayKey}>
                <TD numeric>{formatDate(bucket.dayStartMs, digitStyle)}</TD>
                <TD numeric>{String(bucket.salesCount)}</TD>
                <TD numeric>{formatMoney(bucket.revenuePiasters, digitStyle)}</TD>
                <TD numeric>{formatMoney(bucket.paidPiasters, digitStyle)}</TD>
                <TD numeric>{formatMoney(bucket.duePiasters, digitStyle)}</TD>
              </TRow>
            ))}
          </tbody>
        </Table>
      </>
    )
  }

  function renderProfit() {
    if (profit === null) {
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
        <div className="grid grid-cols-4 gap-3">
          <StatCard label={messages.reports.revenue} value={formatMoney(profit.revenuePiasters, digitStyle)} />
          <StatCard label={messages.reports.discounts} value={formatMoney(profit.discountPiasters, digitStyle)} />
          <StatCard label={messages.reports.cost} value={formatMoney(profit.costPiasters, digitStyle)} />
          <StatCard label={messages.reports.grossProfit} value={formatMoney(profit.grossProfitPiasters, digitStyle)} />
        </div>
        <Card>
          <div className="flex items-center justify-between gap-4 px-1 py-1">
            <span className="text-secondary">
              {messages.reports.margin} <span className="numeric">{formatRatePercent(profit.marginBps, digitStyle)}</span>
            </span>
            <span className="text-sm text-secondary">
              {messages.reports.linesCount} <span className="numeric">{profit.salesLines}</span>
              {' · '}
              {messages.reports.returnsCount} <span className="numeric">{profit.returnItems}</span>
            </span>
          </div>
        </Card>
      </>
    )
  }

  function renderStock() {
    if (stockValue === null || products === null) {
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
        <div className="grid grid-cols-4 gap-3">
          <StatCard label={messages.reports.totalValue} value={formatMoney(stockValue.totalValuePiasters, digitStyle)} />
          <StatCard label={messages.reports.lowStock} value={String(lowStock.length)} />
          <StatCard label={messages.reports.reviewStock} value={String(reviewProducts.length)} />
          <StatCard label={messages.reports.expiredBatches} value={batches === null ? '—' : String(expiredRows.length)} />
        </div>
        {lowStock.length > 0 && (
          <Table>
            <THead>
              <TRow>
                <TH>{messages.reports.product}</TH>
                <TH numeric>{messages.reports.onHand}</TH>
                <TH numeric>{messages.reports.value}</TH>
              </TRow>
            </THead>
            <tbody>
              {lowStock.map((product) => (
                <TRow key={product.id}>
                  <TD>
                    <p className="truncate font-semibold text-strong" title={product.name}>{product.name}</p>
                  </TD>
                  <TD numeric>{formatQty(product.onHandQty, product.qtyScale, product.baseUnitName, digitStyle)}</TD>
                  <TD numeric>{formatMoney(product.onHandValuePiasters, digitStyle)}</TD>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
        {reviewProducts.length > 0 && (
          <Card>
            <div className="flex flex-wrap items-center gap-2 p-1">
              <Badge tone="warning">{messages.reports.reviewStock}</Badge>
              {reviewProducts.map((product) => (
                <span key={product.id} className="text-base text-strong">
                  {product.name}
                </span>
              ))}
            </div>
          </Card>
        )}
        {expiryEnabled && batches === null && (
          <Button variant="outline" onClick={() => void loadBatches().catch(() => setFailed(true))}>
            {messages.inventory.tabExpiry}
          </Button>
        )}
        {batches !== null && expiredRows.length > 0 && (
          <Table>
            <THead>
              <TRow>
                <TH>{messages.reports.product}</TH>
                <TH numeric>{messages.inventory.expiryDate}</TH>
              </TRow>
            </THead>
            <tbody>
              {expiredRows.map(({ productId, batch }) => (
                <TRow key={batch.id}>
                  <TD>
                    <p className="truncate font-semibold text-strong" title={productsById.get(productId)?.name ?? productId}>{productsById.get(productId)?.name ?? productId}</p>
                  </TD>
                  <TD numeric>{batch.expiryAt === null ? messages.common.emptyValue : formatDate(batch.expiryAt, digitStyle)}</TD>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
      </>
    )
  }

  function renderBalances() {
    if (customers === null || suppliers === null) {
      return (
        <Card>
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        </Card>
      )
    }
    const owing = customers.filter((customer) => customer.balancePiasters !== 0)
    const payable = suppliers.filter((supplier) => (supplierBalances.get(supplier.id) ?? 0) !== 0)
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label={messages.reports.receivables} value={formatMoney(receivables, digitStyle)} />
          <StatCard label={messages.reports.payables} value={payables === null ? messages.common.emptyValue : formatMoney(payables, digitStyle)} />
        </div>
        <Table>
          <THead>
            <TRow>
              <TH>{messages.reports.customer}</TH>
              <TH numeric>{messages.reports.balance}</TH>
            </TRow>
          </THead>
          <tbody>
            {owing.length === 0 ? (
              <TableEmpty colSpan={2}>{messages.reports.allSettledCustomers}</TableEmpty>
            ) : (
              owing.map((customer) => (
                <TRow key={customer.id}>
                  <TD>
                    <p className="truncate font-semibold text-strong" title={customer.name}>{customer.name}</p>
                  </TD>
                  <TD numeric>{formatMoney(customer.balancePiasters, digitStyle)}</TD>
                </TRow>
              ))
            )}
          </tbody>
        </Table>
        <Table>
          <THead>
            <TRow>
              <TH>{messages.reports.supplier}</TH>
              <TH numeric>{messages.reports.balance}</TH>
            </TRow>
          </THead>
          <tbody>
            {payable.length === 0 ? (
              <TableEmpty colSpan={2}>{messages.reports.allSettledSuppliers}</TableEmpty>
            ) : (
              payable.map((supplier) => (
                <TRow key={supplier.id}>
                  <TD>
                    <p className="truncate font-semibold text-strong" title={supplier.name}>{supplier.name}</p>
                  </TD>
                  <TD numeric>{formatMoney(supplierBalances.get(supplier.id) ?? 0, digitStyle)}</TD>
                </TRow>
              ))
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
          <Alert tone="error">{messages.reports.loadError}</Alert>
          <Button variant="outline" onClick={() => setReloadTick((tick) => tick + 1)}>
            {messages.common.retry}
          </Button>
        </div>
      </Card>
    )
  }

  if (loading) {
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
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <Button variant={tab === 'sales' ? 'secondary' : 'outline'} onClick={() => setTab('sales')}>
          {messages.reports.tabSales}
        </Button>
        <Button variant={tab === 'profit' ? 'secondary' : 'outline'} onClick={() => setTab('profit')}>
          {messages.reports.tabProfit}
        </Button>
        <Button variant={tab === 'stock' ? 'secondary' : 'outline'} onClick={() => setTab('stock')}>
          {messages.reports.tabStock}
        </Button>
        <Button variant={tab === 'balances' ? 'secondary' : 'outline'} onClick={() => setTab('balances')}>
          {messages.reports.tabBalances}
        </Button>
      </div>

      {(tab === 'sales' || tab === 'profit') && (
        <div className="flex flex-wrap items-end gap-2 print:hidden">
          <div className="w-40">
            <label htmlFor="reports-from" className="text-sm font-semibold text-strong">
              {messages.reports.fromDate}
            </label>
            <TextInput id="reports-from" type="date" value={fromText} onChange={(event) => setFromText(event.target.value)} dir="ltr" className="numeric" />
          </div>
          <div className="w-40">
            <label htmlFor="reports-to" className="text-sm font-semibold text-strong">
              {messages.reports.toDate}
            </label>
            <TextInput id="reports-to" type="date" value={toText} onChange={(event) => setToText(event.target.value)} dir="ltr" className="numeric" />
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
      )}

      {buckets === null && tab === 'sales' ? (
        <Alert tone="error">{messages.reports.bucketOverflow}</Alert>
      ) : (
        <>
          {tab === 'sales' ? renderSales() : tab === 'profit' ? renderProfit() : tab === 'stock' ? renderStock() : renderBalances()}
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={exportCsv}>
              {messages.reports.exportCsv}
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              {messages.reports.print}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
