import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Card, EmptyState, SearchInput, Select, Spinner, Table, TableEmpty, TD, TH, THead, TRow } from '../../components/ui'
import { ClipboardIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { formatDate, formatMoney, formatQty } from '../../lib/format'
import type { Preferences } from '../../lib/preferences'
import { useToast } from '../../lib/toast'
import type { CurrentUser, ProductSummary } from '../../../shared/ipc'
import type { StockBatchRow, StockCountItemRow, StockCountRow } from '../../../shared/rows'
import { classifyStock } from './stockClassify'
import { AdjustDialog } from './AdjustDialog'
import { CountDialog } from './CountDialog'

/**
 * The inventory screen (screen 4): what is on the shelves, what expires, and
 * the counts that reconcile the books with reality.
 *
 * Stock numbers always come from the ledger through the catalog summaries —
 * the screen never keeps its own quantities. Corrections (adjust, damage,
 * count differences) are movements the services write, each with a reason.
 */
export type InventoryPageProps = {
  user: CurrentUser
  preferences: Preferences
}

type StockFilter = 'all' | 'low' | 'review'

export function InventoryPage({ user, preferences }: InventoryPageProps) {
  const toast = useToast()
  const digitStyle = preferences.digitStyle

  const [tab, setTab] = useState<'stock' | 'counts' | 'expiry'>('stock')
  const [products, setProducts] = useState<readonly ProductSummary[] | null>(null)
  const [counts, setCounts] = useState<StockCountRow[] | null>(null)
  const [batches, setBatches] = useState<{ productId: string; batch: StockBatchRow }[] | null>(null)
  const [expiryEnabled, setExpiryEnabled] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const [stockQuery, setStockQuery] = useState('')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [adjusting, setAdjusting] = useState<{ mode: 'adjust' | 'damage'; product: ProductSummary } | null>(null)
  const [adjustError, setAdjustError] = useState<string | null>(null)
  const [countDialog, setCountDialog] = useState<StockCountRow | 'new' | null>(null)
  const [countItems, setCountItems] = useState<StockCountItemRow[]>([])
  const [countError, setCountError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Clock for the expiry badges, read once: re-reading the clock on every
  // render would make the badges flicker between renders in the same minute.
  const [nowMs] = useState(() => Date.now())

  const canManage = user.role !== 'cashier'

  // The shelves and the counts are IPC data the page cannot render without asking.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true
    setProducts(null)
    setCounts(null)
    setBatches(null)
    setFailed(false)
    void (async () => {
      try {
        const [info, listedProducts, listedCounts] = await Promise.all([
          unwrap(window.api.app.getInfo()),
          unwrap(window.api.catalog.listProducts()),
          unwrap(window.api.inventory.listCounts()),
        ])
        if (!alive) return
        setExpiryEnabled(info.settings.expiry_batches)
        setProducts(listedProducts)
        setCounts(listedCounts)
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [reloadTick])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function refreshProducts(): Promise<void> {
    setProducts(await unwrap(window.api.catalog.listProducts()))
  }

  async function refreshCounts(): Promise<void> {
    setCounts(await unwrap(window.api.inventory.listCounts()))
  }

  async function selectTab(next: 'stock' | 'counts' | 'expiry'): Promise<void> {
    setTab(next)
    // Batches are per-product reads; they load on first visit, not with the page.
    if (next === 'expiry' && batches === null && products !== null) {
      try {
        const tracked = products.filter((product) => product.trackExpiry)
        const loaded = await Promise.all(
          tracked.map(async (product) => ({
            product,
            rows: await unwrap(window.api.inventory.listBatches(product.id)),
          })),
        )
        setBatches(loaded.flatMap(({ product, rows }) => rows.map((batch) => ({ productId: product.id, batch }))))
      } catch {
        setFailed(true)
      }
    }
  }

  const visibleStock = useMemo(() => {
    const needle = stockQuery.trim().toLowerCase()
    return (products ?? []).filter((product) => {
      if (needle.length > 0) {
        const hit =
          product.name.toLowerCase().includes(needle) ||
          (product.sku !== null && product.sku.toLowerCase().includes(needle)) ||
          product.barcodes.some((barcode) => barcode.toLowerCase().includes(needle))
        if (!hit) return false
      }
      const state = classifyStock(product.onHandQty, product.onHandValuePiasters, product.lowStockThresholdQty)
      if (stockFilter === 'low') return state === 'low' || state === 'out'
      if (stockFilter === 'review') return state === 'review'
      return true
    })
  }, [products, stockQuery, stockFilter])

  const totalValue = useMemo(() => (products ?? []).reduce((sum, product) => sum + product.onHandValuePiasters, 0), [products])

  const expiryRows = useMemo(() => {
    return (batches ?? [])
      .filter(({ batch }) => batch.expiryAt !== null)
      .map(({ productId, batch }) => ({ productId, batch, expiryAt: batch.expiryAt ?? nowMs }))
      .sort((a, b) => a.expiryAt - b.expiryAt)
  }, [batches, nowMs])

  const productsById = useMemo(() => new Map((products ?? []).map((product) => [product.id, product])), [products])

  async function handleAdjust(productId: string, qtyDelta: number, valuePiasters: number | undefined, reason: string): Promise<void> {
    setSaving(true)
    setAdjustError(null)
    try {
      await unwrap(window.api.inventory.adjust({ productId, qtyDelta, valuePiasters, reason }))
      setAdjusting(null)
      toast({ message: messages.inventory.adjusted, kind: 'success' })
      await refreshProducts()
    } catch (error) {
      setAdjustError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleDamage(productId: string, qtyBase: number, reason: string): Promise<void> {
    setSaving(true)
    setAdjustError(null)
    try {
      await unwrap(window.api.inventory.damage({ productId, qtyBase, reason }))
      setAdjusting(null)
      toast({ message: messages.inventory.damaged, kind: 'success' })
      await refreshProducts()
    } catch (error) {
      setAdjustError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleStartCount(notes: string | null): Promise<void> {
    setSaving(true)
    setCountError(null)
    try {
      const count = await unwrap(window.api.inventory.openCount(notes))
      setCountDialog(count)
      setCountItems([])
      await refreshCounts()
    } catch (error) {
      setCountError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleAddCountItem(productId: string, expectedQtyBase: number, countedQtyBase: number): Promise<void> {
    if (countDialog === null || countDialog === 'new') return
    setSaving(true)
    setCountError(null)
    try {
      setCountItems(await unwrap(window.api.inventory.addCountItem({ stockCountId: countDialog.id, productId, expectedQtyBase, countedQtyBase })))
    } catch (error) {
      setCountError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handlePostCount(stockCountId: string): Promise<void> {
    setSaving(true)
    setCountError(null)
    try {
      const posted = await unwrap(window.api.inventory.postCount(stockCountId))
      setCountDialog(posted)
      setCountItems(await unwrap(window.api.inventory.listCountItems(stockCountId)))
      toast({ message: messages.inventory.posted, kind: 'success' })
      await refreshCounts()
      await refreshProducts()
    } catch (error) {
      setCountError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function openCountDialog(count: StockCountRow): Promise<void> {
    setCountDialog(count)
    setCountError(null)
    try {
      setCountItems(await unwrap(window.api.inventory.listCountItems(count.id)))
    } catch (error) {
      setCountError(translate(errorKey(error)))
      setCountItems([])
    }
  }

  function stockBadge(product: ProductSummary) {
    const state = classifyStock(product.onHandQty, product.onHandValuePiasters, product.lowStockThresholdQty)
    if (state === 'out') return <Badge tone="error">{messages.inventory.outOfStock}</Badge>
    if (state === 'review') {
      return product.onHandQty < 0 ? <Badge tone="error">{messages.inventory.negativeStock}</Badge> : <Badge tone="warning">{messages.inventory.reviewNeeded}</Badge>
    }
    if (state === 'low') return <Badge tone="warning">{messages.inventory.lowStock}</Badge>
    return null
  }

  function renderStock() {
    if (products === null) {
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
              value={stockQuery}
              onChange={(event) => setStockQuery(event.target.value)}
              onClear={() => setStockQuery('')}
              placeholder={messages.inventory.searchPlaceholder}
              autoFocus
            />
          </div>
          <div className="w-48">
            <Select
              value={stockFilter}
              onChange={(value) => setStockFilter(value === 'low' ? 'low' : value === 'review' ? 'review' : 'all')}
              options={[
                { value: 'all', label: messages.inventory.filterAll },
                { value: 'low', label: messages.inventory.filterLow },
                { value: 'review', label: messages.inventory.filterReview },
              ]}
            />
          </div>
          <Card>
            <div className="flex items-center gap-3 px-1">
              <span className="text-sm text-muted">{messages.inventory.totalValue}</span>
              <span className="numeric text-h3 font-semibold text-ink">{formatMoney(totalValue, digitStyle)}</span>
            </div>
          </Card>
        </div>
        <Table>
          <THead>
            <TRow>
              <TH>{messages.inventory.product}</TH>
              <TH numeric>{messages.inventory.onHand}</TH>
              <TH numeric>{messages.inventory.value}</TH>
              {canManage && <TH end>{messages.inventory.actions}</TH>}
            </TRow>
          </THead>
          <tbody>
            {visibleStock.length === 0 ? (
              <TableEmpty colSpan={canManage ? 4 : 3}>
                <EmptyState icon={<ClipboardIcon size={24} />} title={messages.inventory.stockEmptyTitle} description={messages.inventory.stockEmptyBody} />
              </TableEmpty>
            ) : (
              visibleStock.map((product) => (
                <TRow key={product.id}>
                  <TD>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-strong" title={product.name}>{product.name}</p>
                      {product.sku !== null && <p className="numeric text-sm text-muted">{product.sku}</p>}
                    </div>
                  </TD>
                  <TD numeric>
                    <span className="inline-flex items-center gap-2">
                      {formatQty(product.onHandQty, product.qtyScale, product.baseUnitName, digitStyle)}
                      {stockBadge(product)}
                    </span>
                  </TD>
                  <TD numeric>{formatMoney(product.onHandValuePiasters, digitStyle)}</TD>
                  {canManage && (
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAdjustError(null)
                            setAdjusting({ mode: 'adjust', product })
                          }}
                        >
                          {messages.inventory.adjust}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAdjustError(null)
                            setAdjusting({ mode: 'damage', product })
                          }}
                        >
                          {messages.inventory.damage}
                        </Button>
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

  function renderCounts() {
    if (counts === null) {
      return (
        <Card>
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        </Card>
      )
    }
    const ordered = [...counts].reverse()
    return (
      <>
        {canManage && (
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => {
                setCountError(null)
                setCountDialog('new')
              }}
            >
              {messages.inventory.newCount}
            </Button>
          </div>
        )}
        <Table>
          <THead>
            <TRow>
              <TH numeric>{messages.purchases.date}</TH>
              <TH>{messages.inventory.countNotes}</TH>
              <TH end>{messages.inventory.actions}</TH>
            </TRow>
          </THead>
          <tbody>
            {ordered.length === 0 ? (
              <TableEmpty colSpan={3}>
                <EmptyState
                  icon={<ClipboardIcon size={24} />}
                  title={messages.inventory.countsEmptyTitle}
                  description={messages.inventory.countsEmptyBody}
                  action={
                    canManage ? (
                      <Button variant="primary" onClick={() => setCountDialog('new')}>
                        {messages.inventory.newCount}
                      </Button>
                    ) : undefined
                  }
                />
              </TableEmpty>
            ) : (
              ordered.map((count) => (
                <TRow key={count.id}>
                  <TD numeric>{formatDate(count.startedAt, digitStyle)}</TD>
                  <TD>{count.notes ?? messages.common.emptyValue}</TD>
                  <TD>
                    <div className="flex items-center justify-end gap-2">
                      {count.status === 'draft' ? (
                        <Badge tone="info">{messages.inventory.draft}</Badge>
                      ) : (
                        <Badge tone="neutral">{messages.inventory.postedStatus}</Badge>
                      )}
                      {(canManage || count.status !== 'draft') && (
                        <Button variant="ghost" size="sm" onClick={() => void openCountDialog(count)}>
                          {messages.inventory.openCount}
                        </Button>
                      )}
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

  function renderExpiry() {
    if (batches === null) {
      return (
        <Card>
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        </Card>
      )
    }
    if (expiryRows.length === 0) {
      return (
        <Card>
          <EmptyState icon={<ClipboardIcon size={24} />} title={messages.inventory.expiryEmptyTitle} description={messages.inventory.expiryEmptyBody} />
        </Card>
      )
    }
    const nearMs = 30 * 24 * 60 * 60 * 1000
    return (
      <Table>
        <THead>
          <TRow>
            <TH>{messages.inventory.product}</TH>
            <TH numeric>{messages.inventory.batchCode}</TH>
            <TH numeric>{messages.inventory.expiryDate}</TH>
            <TH>{messages.inventory.actions}</TH>
          </TRow>
        </THead>
        <tbody>
          {expiryRows.map(({ productId, batch }) => {
            const product = productsById.get(productId)
            const expired = (batch.expiryAt ?? nowMs) < nowMs
            const near = !expired && (batch.expiryAt ?? nowMs) - nowMs <= nearMs
            return (
              <TRow key={batch.id}>
                <TD>
                  <p className="truncate font-semibold text-strong">{product?.name ?? productId}</p>
                </TD>
                <TD numeric>{batch.batchCode ?? messages.common.emptyValue}</TD>
                <TD numeric>{batch.expiryAt === null ? messages.common.emptyValue : formatDate(batch.expiryAt, digitStyle)}</TD>
                <TD>
                  <div className="flex justify-end">
                    {expired ? (
                      <Badge tone="error">{messages.inventory.expired}</Badge>
                    ) : near ? (
                      <Badge tone="warning">{messages.inventory.nearExpiry}</Badge>
                    ) : null}
                  </div>
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
          <Alert tone="error">{messages.inventory.loadError}</Alert>
          <Button variant="outline" onClick={() => setReloadTick((tick) => tick + 1)}>
            {messages.common.retry}
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button variant={tab === 'stock' ? 'secondary' : 'outline'} onClick={() => void selectTab('stock')}>
          {messages.inventory.tabStock}
        </Button>
        <Button variant={tab === 'counts' ? 'secondary' : 'outline'} onClick={() => void selectTab('counts')}>
          {messages.inventory.tabCounts}
        </Button>
        {expiryEnabled && (
          <Button variant={tab === 'expiry' ? 'secondary' : 'outline'} onClick={() => void selectTab('expiry')}>
            {messages.inventory.tabExpiry}
          </Button>
        )}
      </div>

      {tab === 'stock' ? renderStock() : tab === 'counts' ? renderCounts() : renderExpiry()}

      <AdjustDialog
        open={adjusting !== null}
        mode={adjusting?.mode ?? 'adjust'}
        product={adjusting?.product ?? null}
        digitStyle={digitStyle}
        saving={saving}
        errorText={adjustError}
        onClose={() => setAdjusting(null)}
        onAdjust={(productId, qtyDelta, valuePiasters, reason) => void handleAdjust(productId, qtyDelta, valuePiasters, reason)}
        onDamage={(productId, qtyBase, reason) => void handleDamage(productId, qtyBase, reason)}
      />

      <CountDialog
        open={countDialog !== null}
        count={countDialog === null || countDialog === 'new' ? null : countDialog}
        items={countItems}
        products={products ?? []}
        digitStyle={digitStyle}
        saving={saving}
        errorText={countError}
        canMutate={canManage}
        onClose={() => setCountDialog(null)}
        onStart={(notes) => void handleStartCount(notes)}
        onAddItem={(productId, expectedQtyBase, countedQtyBase) => void handleAddCountItem(productId, expectedQtyBase, countedQtyBase)}
        onPost={(stockCountId) => void handlePostCount(stockCountId)}
      />
    </div>
  )
}
