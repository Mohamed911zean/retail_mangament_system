import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, Field, MoneyInput, QtyInput, SearchInput, Select, Table, TD, TH, THead, TRow, TextInput } from '../../components/ui'
import { ReceiptIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { formatMoney, formatQty, type DigitStyle } from '../../lib/format'
import type { CreateReturnInput, ProductSummary, ReturnDetails } from '../../../shared/ipc'
import type { SaleItemRow, SaleRow } from '../../../shared/rows'
import { alreadyReturned, previewRefund, remainingQty } from './returnsCart'

/**
 * A new return against an original invoice. The invoice is found by number
 * (last 90 days, widenable to all time), then each line offers what is still
 * returnable — already-returned quantities come from the non-voided returns on
 * that invoice, with the same cumulative math the service enforces.
 *
 * The cash field defaults to the full previewed refund; lowering it leaves the
 * rest as account credit. An empty reason is fine — the audit keeps the
 * numbers either way.
 */
export type ReturnDialogProps = {
  open: boolean
  products: readonly ProductSummary[]
  /** Current open shift, or null: the service records the refund without one. */
  shiftId: string | null
  digitStyle: DigitStyle
  saving: boolean
  /** Already-translated server error from the last save attempt. */
  errorText: string | null
  onClose: () => void
  onSave: (input: CreateReturnInput) => void
}

type LineDraft = { qtyBase: number; condition: 'resalable' | 'damaged' }

const LOOKUP_DAYS = 90 * 24 * 60 * 60 * 1000

export function ReturnDialog({ open, products, shiftId, digitStyle, saving, errorText, onClose, onSave }: ReturnDialogProps) {
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [widened, setWidened] = useState(false)
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [sale, setSale] = useState<SaleRow | null>(null)
  const [lines, setLines] = useState<SaleItemRow[]>([])
  const [prior, setPrior] = useState<ReturnDetails[]>([])
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({})
  const [cash, setCash] = useState<number | null>(null)
  const [reason, setReason] = useState('')

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])

  // Opening starts from an empty lookup, never from the last return.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setInvoiceNumber('')
      setWidened(false)
      setLooking(false)
      setLookupError(null)
      setSale(null)
      setLines([])
      setPrior([])
      setDrafts({})
      setCash(null)
      setReason('')
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function lookup(wide: boolean): Promise<void> {
    const needle = invoiceNumber.trim()
    if (needle.length === 0) return
    setLooking(true)
    setLookupError(null)
    try {
      const now = Date.now()
      const rows = await unwrap(window.api.reports.sales({ fromMs: wide ? 0 : now - LOOKUP_DAYS, toMs: now }))
      const found = rows.find((row) => row.invoiceNumber === needle)
      if (found === undefined) {
        setLookupError(messages.returns.invoiceNotFound)
        setSale(null)
        return
      }
      if (found.status === 'voided') {
        setLookupError(messages.errors.document_already_voided)
        setSale(null)
        return
      }
      const [details, allReturns] = await Promise.all([
        unwrap(window.api.sales.get(found.id)),
        unwrap(window.api.returns.list()),
      ])
      const priorHeaders = allReturns.filter((entry) => entry.originalSaleId === found.id)
      const priorDetails = await Promise.all(priorHeaders.map((entry) => unwrap(window.api.returns.get(entry.id))))
      setSale(details.sale)
      setLines(details.items)
      setPrior(priorDetails)
      setDrafts({})
      setCash(null)
    } catch (error) {
      setLookupError(translate(errorKey(error)))
      setSale(null)
    } finally {
      setLooking(false)
    }
  }

  const previews = useMemo(() => {
    if (sale === null) return { rows: [] as { item: SaleItemRow; remaining: number; preview: number | null }[], total: 0 }
    const rows = lines.map((item) => {
      const already = alreadyReturned(prior, item.id)
      const remaining = remainingQty(item.qtyBase, already.qtyBase)
      const draft = drafts[item.id] ?? { qtyBase: 0, condition: 'resalable' as const }
      const preview = draft.qtyBase <= 0 ? 0 : previewRefund(item.finalLineTotalPiasters, Math.min(draft.qtyBase, remaining), item.qtyBase, already.qtyBase, already.refundPiasters)
      return { item, remaining, preview }
    })
    return { rows, total: rows.reduce((sum, row) => sum + (row.preview ?? 0), 0) }
  }, [sale, lines, prior, drafts])

  const cashValue = cash ?? previews.total
  const cashInvalid = cash !== null && (cash < 0 || cash > previews.total)
  const hasLines = previews.rows.some((row) => {
    const draft = drafts[row.item.id]
    return draft !== undefined && draft.qtyBase > 0 && draft.qtyBase <= row.remaining
  })
  const canSave = sale !== null && hasLines && !cashInvalid && previews.rows.every((row) => row.preview !== null)

  function setDraft(itemId: string, patch: Partial<LineDraft>): void {
    const defaults: LineDraft = { qtyBase: 0, condition: 'resalable' }
    setDrafts((current) => ({ ...current, [itemId]: { ...defaults, ...current[itemId], ...patch } }))
  }

  function save(): void {
    if (sale === null || !canSave) return
    onSave({
      originalSaleId: sale.id,
      shiftId,
      lines: previews.rows
        .filter((row) => {
          const draft = drafts[row.item.id]
          return draft !== undefined && draft.qtyBase > 0
        })
        .map((row) => {
          const draft = drafts[row.item.id] ?? { qtyBase: 0, condition: 'resalable' as const }
          return { saleItemId: row.item.id, qtyBase: Math.min(draft.qtyBase, row.remaining), condition: draft.condition }
        }),
      cashRefundPiasters: cash ?? undefined,
      reason: reason.trim().length === 0 ? null : reason.trim(),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title={messages.returns.newReturn} size="md">
      <div className="flex flex-col gap-4">
        {errorText !== null && <Alert tone="error">{errorText}</Alert>}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label={messages.returns.invoiceNumber} htmlFor="return-invoice">
              <SearchInput
                id="return-invoice"
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                onClear={() => setInvoiceNumber('')}
                placeholder={messages.returns.invoiceNumber}
                autoFocus
              />
            </Field>
          </div>
          <div className="pb-1">
            <Button variant="primary" loading={looking} disabled={invoiceNumber.trim().length === 0} onClick={() => void lookup(widened)}>
              {messages.returns.findInvoice}
            </Button>
          </div>
        </div>
        {lookupError !== null && (
          <div className="flex flex-col items-start gap-2">
            <Alert tone="error">{lookupError}</Alert>
            {!widened && lookupError === messages.returns.invoiceNotFound && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setWidened(true)
                  void lookup(true)
                }}
              >
                {messages.returns.widenSearch}
              </Button>
            )}
          </div>
        )}

        {sale !== null && (
          <>
            <Table>
              <THead>
                <TRow>
                  <TH>{messages.returns.product}</TH>
                  <TH numeric>{messages.sales.qty}</TH>
                  <TH numeric>{messages.returns.returnQty}</TH>
                  <TH>{messages.returns.condition}</TH>
                </TRow>
              </THead>
              <tbody>
                {previews.rows.map(({ item, remaining, preview }) => {
                  const product = productsById.get(item.productId)
                  const draft = drafts[item.id] ?? { qtyBase: 0, condition: 'resalable' as const }
                  return (
                    <TRow key={item.id}>
                      <TD>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-strong" title={item.productNameSnapshot}>
                            {item.productNameSnapshot}
                          </p>
                          <p className="numeric text-sm text-muted">
                            {messages.returns.remaining} {formatQty(remaining, product?.qtyScale ?? 0, item.unitNameSnapshot, digitStyle)}
                          </p>
                        </div>
                      </TD>
                      <TD numeric>{formatQty(item.qtyBase, product?.qtyScale ?? 0, item.unitNameSnapshot, digitStyle)}</TD>
                      <TD numeric>
                        <QtyInput
                          value={draft.qtyBase}
                          onChange={(units) => setDraft(item.id, { qtyBase: Math.max(0, Math.min(units, remaining)) })}
                          qtyScale={product?.qtyScale ?? 0}
                          unitName={item.unitNameSnapshot}
                          showStepper={false}
                          digitStyle={digitStyle}
                        />
                        {preview !== null && preview > 0 && (
                          <p className="numeric text-sm text-muted">{formatMoney(preview, digitStyle)}</p>
                        )}
                      </TD>
                      <TD>
                        <Select
                          value={draft.condition}
                          onChange={(value) => setDraft(item.id, { condition: value === 'damaged' ? 'damaged' : 'resalable' })}
                          options={[
                            { value: 'resalable', label: messages.returns.resalable },
                            { value: 'damaged', label: messages.returns.damaged },
                          ]}
                        />
                      </TD>
                    </TRow>
                  )
                })}
              </tbody>
            </Table>

            {previews.rows.every((row) => row.remaining === 0) && (
              <EmptyState icon={<ReceiptIcon size={24} />} title={messages.errors.return_exceeds_original} />
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label={messages.returns.cashRefund} htmlFor="return-cash">
                <MoneyInput value={cashValue} onChange={(value) => setCash(value)} digitStyle={digitStyle} />
              </Field>
              <div className="flex items-end pb-1 text-sm text-secondary">
                <span>
                  {messages.returns.credited} <span className="numeric">{formatMoney(Math.max(0, previews.total - cashValue), digitStyle)}</span>
                </span>
              </div>
            </div>

            <Field label={messages.returns.reason} htmlFor="return-reason">
              <TextInput id="return-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
            </Field>

            <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
              <span className="text-secondary">{messages.returns.total}</span>
              <span className="numeric text-h3 font-semibold text-ink">{formatMoney(previews.total, digitStyle)}</span>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {messages.common.cancel}
              </Button>
              <Button variant="primary" loading={saving} disabled={!canSave} onClick={save}>
                {messages.common.save}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
