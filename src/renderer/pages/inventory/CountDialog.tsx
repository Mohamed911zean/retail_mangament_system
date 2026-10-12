import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Dialog, Field, QtyInput, Select, Table, TableEmpty, TD, TH, THead, TRow, TextInput } from '../../components/ui'
import { messages } from '../../i18n'
import { formatDateTime, formatQty, type DigitStyle } from '../../lib/format'
import type { ProductSummary } from '../../../shared/ipc'
import type { StockCountItemRow, StockCountRow } from '../../../shared/rows'

/**
 * A stock count, from an empty notes field to posted differences.
 *
 * The count runs in two steps on purpose: the draft collects what was actually
 * on the shelves, and posting writes the differences as `count` movements in
 * one transaction. Posting is terminal — a wrong count is corrected by an
 * adjustment, never by editing the draft after the fact.
 */
export type CountDialogProps = {
  open: boolean
  /** Null count means "not started yet": notes first, then the draft. */
  count: StockCountRow | null
  items: StockCountItemRow[]
  products: readonly ProductSummary[]
  digitStyle: DigitStyle
  saving: boolean
  /** Already-translated server error from the last attempt. */
  errorText: string | null
  /** False hides the add/post controls: the dialog becomes a read-only view. */
  canMutate: boolean
  onClose: () => void
  onStart: (notes: string | null) => void
  onAddItem: (productId: string, expectedQtyBase: number, countedQtyBase: number) => void
  onPost: (stockCountId: string) => void
}

export function CountDialog({ open, count, items, products, digitStyle, saving, errorText, canMutate, onClose, onStart, onAddItem, onPost }: CountDialogProps) {
  const [notes, setNotes] = useState('')
  const [pickedId, setPickedId] = useState('')
  const [counted, setCounted] = useState(0)
  const [confirmingPost, setConfirmingPost] = useState(false)

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const countedIds = useMemo(() => new Set(items.map((item) => item.productId)), [items])
  const addable = useMemo(() => products.filter((product) => !countedIds.has(product.id)), [products, countedIds])
  const picked = pickedId === '' ? undefined : productsById.get(pickedId)

  // Opening another count clears the notes and the picked line.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setNotes('')
      setPickedId('')
      setCounted(0)
      setConfirmingPost(false)
    }
  }, [open, count?.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  const isPosted = count !== null && count.status !== 'draft'

  function start(): void {
    onStart(notes.trim().length === 0 ? null : notes.trim())
  }

  function add(): void {
    if (picked === undefined) return
    onAddItem(picked.id, picked.onHandQty, counted)
    setPickedId('')
    setCounted(0)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={messages.inventory.tabCounts}
      description={count === null ? undefined : `${formatDateTime(count.startedAt, digitStyle)}${count.notes === null ? '' : ` · ${count.notes}`}`}
      size="md"
    >
      <div className="flex flex-col gap-4">
        {errorText !== null && <Alert tone="error">{errorText}</Alert>}

        {count === null ? (
          <>
            <Field label={messages.inventory.countNotes} htmlFor="count-notes">
              <TextInput id="count-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} autoFocus />
            </Field>
            {canMutate && (
              <div>
                <Button variant="primary" loading={saving} onClick={start}>
                  {messages.inventory.startCount}
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              {isPosted ? <Badge tone="neutral">{messages.inventory.postedStatus}</Badge> : <Badge tone="info">{messages.inventory.draft}</Badge>}
            </div>

            {!isPosted && canMutate && (
              <div className="grid grid-cols-3 items-end gap-2">
                <Field label={messages.inventory.product} htmlFor="count-product">
                  <Select
                    id="count-product"
                    value={pickedId}
                    onChange={setPickedId}
                    placeholder={messages.purchases.selectProduct}
                    options={addable.map((product) => ({ value: product.id, label: product.name }))}
                  />
                </Field>
                <Field label={messages.inventory.countedQty} htmlFor="count-counted">
                  <QtyInput
                    id="count-counted"
                    value={counted}
                    onChange={setCounted}
                    qtyScale={picked?.qtyScale ?? 0}
                    unitName={picked?.baseUnitName ?? ''}
                    showStepper={false}
                    digitStyle={digitStyle}
                  />
                </Field>
                <div className="pb-1">
                  <Button variant="outline" disabled={picked === undefined} onClick={add}>
                    {messages.inventory.addItem}
                  </Button>
                </div>
              </div>
            )}
            {picked !== undefined && (
              <p className="text-sm text-muted">
                {messages.inventory.expectedQty}:{' '}
                <span className="numeric">{formatQty(picked.onHandQty, picked.qtyScale, picked.baseUnitName, digitStyle)}</span>
              </p>
            )}

            <Table>
              <THead>
                <TRow>
                  <TH>{messages.inventory.product}</TH>
                  <TH numeric>{messages.inventory.expectedQty}</TH>
                  <TH numeric>{messages.inventory.countedQty}</TH>
                  <TH numeric>{messages.inventory.difference}</TH>
                </TRow>
              </THead>
              <tbody>
                {items.length === 0 ? (
                  <TableEmpty colSpan={4}>{messages.inventory.countEmpty}</TableEmpty>
                ) : (
                  items.map((item) => {
                    const product = productsById.get(item.productId)
                    return (
                      <TRow key={item.id}>
                        <TD>
                          <p className="truncate font-semibold text-strong" title={product?.name ?? item.productId}>{product?.name ?? item.productId}</p>
                        </TD>
                        <TD numeric>{formatQty(item.expectedQtyBase, product?.qtyScale ?? 0, product?.baseUnitName ?? '', digitStyle)}</TD>
                        <TD numeric>{formatQty(item.countedQtyBase, product?.qtyScale ?? 0, product?.baseUnitName ?? '', digitStyle)}</TD>
                        <TD numeric>{formatQty(item.differenceQtyBase, product?.qtyScale ?? 0, product?.baseUnitName ?? '', digitStyle)}</TD>
                      </TRow>
                    )
                  })
                )}
              </tbody>
            </Table>

            {!isPosted && canMutate && (
              <section aria-label={messages.inventory.postCount} className="flex flex-col gap-2 rounded-lg border border-line p-4">
                <p className="text-sm text-secondary">{messages.inventory.postConfirm}</p>
                {confirmingPost ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      loading={saving}
                      disabled={items.length === 0}
                      onClick={() => {
                        setConfirmingPost(false)
                        onPost(count.id)
                      }}
                    >
                      {messages.common.yes}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmingPost(false)}>
                      {messages.common.no}
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Button variant="primary" disabled={items.length === 0} onClick={() => setConfirmingPost(true)}>
                      {messages.inventory.postCount}
                    </Button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </Dialog>
  )
}
