import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Dialog,
  EmptyState,
  IconButton,
  SearchInput,
  Select,
  Spinner,
  Table,
  TableEmpty,
  TD,
  TH,
  THead,
  TRow,
} from '../../components/ui'
import { Badge } from '../../components/ui'
import { BoxIcon, TrashIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { formatMoney, formatQty } from '../../lib/format'
import type { Preferences } from '../../lib/preferences'
import { useToast } from '../../lib/toast'
import type { CurrentUser, ProductSummary } from '../../../shared/ipc'
import type { CategoryRow } from '../../../shared/rows'
import { canEditCost, canEditPrice, canManageCatalog, filterProducts, isLowStock } from './productFilter'
import { CategoryDialog } from './CategoryDialog'
import { ProductDialog, type SavePayload } from './ProductDialog'

/**
 * The products screen (screen 1): the shop's catalog with its categories.
 *
 * This page owns the cartography — loading, searching and every IPC call —
 * and the dialogs own their drafts. Pricing math never appears here: money
 * arrives as piasters and leaves through `MoneyInput`, formatted only by
 * `lib/format` at the table cells.
 */
export type ProductsPageProps = {
  user: CurrentUser
  preferences: Preferences
}

type EditorState = { mode: 'create' } | { mode: 'edit'; id: string }

export function ProductsPage({ user, preferences }: ProductsPageProps) {
  const toast = useToast()
  const digitStyle = preferences.digitStyle

  const [products, setProducts] = useState<ProductSummary[] | null>(null)
  const [categories, setCategories] = useState<CategoryRow[] | null>(null)
  const [weightedEnabled, setWeightedEnabled] = useState(false)
  const [expiryEnabled, setExpiryEnabled] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProductSummary | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const canManage = canManageCatalog(user.role)
  const priceEditable = canEditPrice(user.permissions)
  const costEditable = canEditCost(user.permissions)

  // The catalog is IPC data the page cannot render without asking.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true
    setProducts(null)
    setCategories(null)
    setFailed(false)
    void (async () => {
      try {
        const [info, listed, listedCategories] = await Promise.all([
          unwrap(window.api.app.getInfo()),
          unwrap(window.api.catalog.listProducts()),
          unwrap(window.api.catalog.listCategories()),
        ])
        if (!alive) return
        setWeightedEnabled(info.settings.weighted_items)
        setExpiryEnabled(info.settings.expiry_batches)
        setProducts(listed)
        setCategories(listedCategories)
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [reloadTick])
  /* eslint-enable react-hooks/set-state-in-effect */

  const categoryNames = useMemo(() => new Map((categories ?? []).map((category) => [category.id, category.name])), [categories])

  const visible = useMemo(
    () => filterProducts(products ?? [], query, categoryFilter === '' ? null : categoryFilter),
    [products, query, categoryFilter],
  )

  const editingProduct = useMemo(
    () => (editor !== null && editor.mode === 'edit' ? (products ?? []).find((item) => item.id === editor.id) ?? null : null),
    [editor, products],
  )
  // An edit target that vanished (deleted elsewhere) closes the dialog rather
  // than silently turning it into a "create" form.
  const dialogOpen = editor !== null && (editor.mode === 'create' || editingProduct !== null)

  async function refresh(): Promise<void> {
    const [listed, listedCategories] = await Promise.all([
      unwrap(window.api.catalog.listProducts()),
      unwrap(window.api.catalog.listCategories()),
    ])
    setProducts(listed)
    setCategories(listedCategories)
  }

  async function handleSave(payload: SavePayload): Promise<void> {
    setSaving(true)
    setDialogError(null)
    try {
      if (payload.mode === 'create') {
        const created = await unwrap(window.api.catalog.createProduct(payload.input))
        await refresh()
        setEditor({ mode: 'edit', id: created.id })
        toast({ message: messages.products.created, kind: 'success' })
      } else {
        await unwrap(window.api.catalog.updateProduct(payload.id, payload.fields))
        await refresh()
        toast({ message: messages.products.updated, kind: 'success' })
      }
    } catch (error) {
      setDialogError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (deleteTarget === null) return
    setSaving(true)
    setDeleteError(null)
    try {
      await unwrap(window.api.catalog.deleteProduct(deleteTarget.id))
      setDeleteTarget(null)
      toast({ message: messages.products.deleted, kind: 'success' })
      await refresh()
    } catch (error) {
      setDeleteError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  function renderBody() {
    if (failed) {
      return (
        <Card>
          <div className="flex flex-col items-start gap-3">
            <Alert tone="error">{messages.products.loadError}</Alert>
            <Button variant="outline" onClick={() => setReloadTick((tick) => tick + 1)}>
              {messages.common.retry}
            </Button>
          </div>
        </Card>
      )
    }
    if (products === null || categories === null) {
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
            <TH>{messages.products.name}</TH>
            <TH>{messages.products.category}</TH>
            <TH numeric>{messages.products.price}</TH>
            {costEditable && <TH numeric>{messages.products.cost}</TH>}
            <TH numeric>{messages.products.stock}</TH>
            {canManage && <TH end>{messages.products.actions}</TH>}
          </TRow>
        </THead>
        <tbody>
          {visible.length === 0 ? (
            <TableEmpty colSpan={canManage ? (costEditable ? 6 : 5) : costEditable ? 5 : 4}>
              <EmptyState
                icon={<BoxIcon size={24} />}
                title={query.trim().length === 0 && categoryFilter === '' ? messages.products.emptyTitle : messages.products.emptySearchTitle}
                description={query.trim().length === 0 && categoryFilter === '' ? messages.products.emptyBody : messages.products.emptySearchBody}
                action={
                  canManage && query.trim().length === 0 && categoryFilter === '' ? (
                    <Button variant="primary" onClick={() => setEditor({ mode: 'create' })}>
                      {messages.products.addProduct}
                    </Button>
                  ) : undefined
                }
              />
            </TableEmpty>
          ) : (
            visible.map((product) => (
              <TRow key={product.id}>
                <TD>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-strong" title={product.name}>{product.name}</p>
                    {product.sku !== null && <p className="numeric text-sm text-muted">{product.sku}</p>}
                  </div>
                </TD>
                <TD>{product.categoryId === null ? messages.common.emptyValue : (categoryNames.get(product.categoryId) ?? messages.common.emptyValue)}</TD>
                <TD numeric>{formatMoney(product.sellingPricePiasters, digitStyle)}</TD>
                {costEditable && <TD numeric>{formatMoney(product.costPricePiasters, digitStyle)}</TD>}
                <TD numeric>
                  <span className="inline-flex items-center gap-2">
                    {formatQty(product.onHandQty, product.qtyScale, product.baseUnitName, digitStyle)}
                    {product.onHandQty === 0 ? (
                      <Badge tone="error">{messages.products.outOfStock}</Badge>
                    ) : (
                      isLowStock(product.onHandQty, product.lowStockThresholdQty) && <Badge tone="warning">{messages.products.lowStock}</Badge>
                    )}
                  </span>
                </TD>
                {canManage && (
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditor({ mode: 'edit', id: product.id })}>
                        {messages.products.edit}
                      </Button>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        label={`${messages.products.deleteProduct}: ${product.name}`}
                        onClick={() => {
                          setDeleteTarget(product)
                          setDeleteError(null)
                        }}
                      >
                        <TrashIcon size={16} />
                      </IconButton>
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
            placeholder={messages.products.searchPlaceholder}
            autoFocus
          />
        </div>
        <div className="w-48">
          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder={messages.products.allCategories}
            options={(categories ?? []).map((category) => ({ value: category.id, label: category.name }))}
          />
        </div>
        {canManage && (
          <>
            <Button variant="outline" onClick={() => setCategoryOpen(true)}>
              {messages.products.manageCategories}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setDialogError(null)
                setEditor({ mode: 'create' })
              }}
            >
              {messages.products.addProduct}
            </Button>
          </>
        )}
      </div>

      {renderBody()}

      <ProductDialog
        open={dialogOpen}
        product={editor !== null && editor.mode === 'edit' ? editingProduct : null}
        categories={categories ?? []}
        weightedEnabled={weightedEnabled}
        expiryEnabled={expiryEnabled}
        canEditPrice={priceEditable}
        canEditCost={costEditable}
        digitStyle={digitStyle}
        saving={saving}
        errorText={dialogError}
        onClose={() => {
          setEditor(null)
          setDialogError(null)
        }}
        onSave={(payload) => void handleSave(payload)}
        onAddUnit={(productId, unitName, baseQtyPerUnit, sellingPricePiasters) => {
          setSaving(true)
          setDialogError(null)
          void unwrap(window.api.catalog.addProductUnit(productId, unitName, baseQtyPerUnit, sellingPricePiasters))
            .then(() => refresh())
            .catch((error: unknown) => setDialogError(translate(errorKey(error))))
            .finally(() => setSaving(false))
        }}
        onRemoveUnit={(productId, unitId) => {
          setSaving(true)
          setDialogError(null)
          void unwrap(window.api.catalog.removeProductUnit(productId, unitId))
            .then(() => refresh())
            .catch((error: unknown) => setDialogError(translate(errorKey(error))))
            .finally(() => setSaving(false))
        }}
        onAddBarcode={(productId, barcode, isPrimary) => {
          setSaving(true)
          setDialogError(null)
          void unwrap(window.api.catalog.addBarcode(productId, barcode, isPrimary))
            .then(() => refresh())
            .catch((error: unknown) => setDialogError(translate(errorKey(error))))
            .finally(() => setSaving(false))
        }}
        onRemoveBarcode={(productId, barcode) => {
          setSaving(true)
          setDialogError(null)
          void unwrap(window.api.catalog.removeBarcode(productId, barcode))
            .then(() => refresh())
            .catch((error: unknown) => setDialogError(translate(errorKey(error))))
            .finally(() => setSaving(false))
        }}
      />

      <CategoryDialog
        open={categoryOpen}
        categories={categories ?? []}
        saving={saving}
        errorText={dialogError}
        onClose={() => {
          setCategoryOpen(false)
          setDialogError(null)
        }}
        onCreate={(name) => {
          setSaving(true)
          setDialogError(null)
          void unwrap(window.api.catalog.createCategory(name))
            .then(() => refresh())
            .then(() => toast({ message: messages.products.categorySaved, kind: 'success' }))
            .catch((error: unknown) => setDialogError(translate(errorKey(error))))
            .finally(() => setSaving(false))
        }}
        onRename={(categoryId, name) => {
          setSaving(true)
          setDialogError(null)
          void unwrap(window.api.catalog.updateCategory(categoryId, name))
            .then(() => refresh())
            .then(() => toast({ message: messages.products.categorySaved, kind: 'success' }))
            .catch((error: unknown) => setDialogError(translate(errorKey(error))))
            .finally(() => setSaving(false))
        }}
        onDelete={(categoryId) => {
          setSaving(true)
          setDialogError(null)
          void unwrap(window.api.catalog.deleteCategory(categoryId))
            .then(() => refresh())
            .then(() => toast({ message: messages.products.categoryDeleted, kind: 'success' }))
            .catch((error: unknown) => setDialogError(translate(errorKey(error))))
            .finally(() => setSaving(false))
        }}
      />

      {/* Deleting only hides the row — every invoice that used it keeps its
          snapshot — but it still names the product and waits for a deliberate click. */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={messages.products.deleteProductTitle}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {messages.common.no}
            </Button>
            <Button variant="danger" loading={saving} onClick={() => void handleDelete()}>
              {messages.products.deleteProduct}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {deleteError !== null && <Alert tone="error">{deleteError}</Alert>}
          <p className="text-base font-semibold text-strong">{deleteTarget?.name}</p>
          <p className="text-sm text-secondary">{messages.products.deleteProductBody}</p>
        </div>
      </Dialog>
    </div>
  )
}
