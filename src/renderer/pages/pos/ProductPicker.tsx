/**
 * The product pane of the selling screen (design system §4.5): a search field on
 * top, a tappable grid below.
 *
 * Search runs here, over the list the page already loaded, rather than through a
 * database round trip: a barcode scanner is a keyboard wedge that fires a whole
 * code in a few milliseconds, and asking the main process per keystroke is what
 * makes a POS feel slow. The catalogue of one small shop fits in memory easily.
 */
import { useEffect, useMemo, useState, type KeyboardEvent, type RefObject } from 'react'
import { Alert, Badge, Button, EmptyState, SearchInput, Spinner } from '../../components/ui'
import { SearchIcon } from '../../components/icons'
import { messages } from '../../i18n'
import { formatMoney, formatQty, type DigitStyle } from '../../lib/format'
import type { ProductSummary } from '../../../shared/ipc'
import { filterProducts } from './search'

/** Typing pause before the grid re-filters; long enough to skip a mid-word state. */
const SEARCH_DEBOUNCE_MS = 120

export type ProductPickerProps = {
  products: readonly ProductSummary[]
  loading: boolean
  /** Already-translated Arabic, or null. */
  error: string | null
  onRetry: () => void
  onAdd: (product: ProductSummary) => void
  /** Called on Enter in the search field. True when the code was recognised and added. */
  onScanSubmit: (code: string) => boolean
  digitStyle: DigitStyle
  /** The page keeps focus here so a barcode scanner always types into it. */
  searchRef: RefObject<HTMLInputElement | null>
}

export function ProductPicker({
  products,
  loading,
  error,
  onRetry,
  onAdd,
  onScanSubmit,
  digitStyle,
  searchRef,
}: ProductPickerProps) {
  const [query, setQuery] = useState('')
  const [deferredQuery, setDeferredQuery] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredQuery(query), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const filtered = useMemo(() => filterProducts(products, deferredQuery), [products, deferredQuery])

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return
    // An unrecognised code stays in the field: clearing it would hide the typo
    // from the cashier and they would scan the item again into an empty box.
    if (onScanSubmit(query.trim())) setQuery('')
  }

  function renderBody() {
    if (error !== null) {
      return (
        <div className="flex flex-col items-start gap-3">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={onRetry}>
            {messages.common.retry}
          </Button>
        </div>
      )
    }
    if (loading) {
      return (
        <div className="flex items-center justify-center gap-2 p-8 text-muted">
          <Spinner />
          <span>{messages.pos.loadingProducts}</span>
        </div>
      )
    }
    if (filtered.items.length === 0) {
      return <EmptyState icon={<SearchIcon size={24} />} title={messages.pos.noProducts} description={messages.pos.noProductsHint} />
    }
    return (
      <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {filtered.items.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onAdd(product)}
              title={messages.pos.addProduct}
              className="flex min-h-22 flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface p-3 text-base text-strong hover:bg-brand-50"
            >
              <span className="text-center">{product.name}</span>
              <span className="numeric text-base font-semibold text-brand-700">
                {formatMoney(product.sellingPricePiasters, digitStyle)}
              </span>
              {product.onHandQty <= 0 ? (
                <Badge tone="error">{messages.pos.noStock}</Badge>
              ) : (
                <span className="numeric text-sm text-muted">
                  {messages.pos.onHand} {formatQty(product.onHandQty, product.qtyScale, product.baseUnitName, digitStyle)}
                </span>
              )}
            </button>
          ))}
        </div>
        {filtered.truncated && <p className="text-sm text-muted">{messages.pos.moreResults}</p>}
      </>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchInput
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            onClear={() => setQuery('')}
            placeholder={messages.pos.searchPlaceholder}
          />
        </div>
        {/* The F2 hint, shown as a key cap so it reads as a shortcut and not a word. */}
        <kbd className="numeric rounded-sm border border-line bg-panel px-2 py-1 text-caption text-muted">{messages.pos.searchHint}</kbd>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pe-1">{renderBody()}</div>
    </div>
  )
}
