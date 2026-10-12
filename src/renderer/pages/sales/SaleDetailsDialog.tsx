import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Dialog, Field, Table, TD, TH, THead, TRow, TextInput } from '../../components/ui'
import { messages } from '../../i18n'
import { formatDateTime, formatMoney, formatQty, type DigitStyle } from '../../lib/format'
import type { ProductSummary } from '../../../shared/ipc'
import type { SaleItemRow, SaleRow } from '../../../shared/rows'

/**
 * One sale invoice, read back from the database: lines with their stored
 * snapshots, totals, the void record when canceled, and the two things a shop
 * does afterwards — reprint the receipt and (for owners/managers) void it.
 *
 * The receipt is rebuilt in main from the stored sale, so a reprint always
 * shows the original numbers even after a price change in the catalog.
 */
export type SaleDetailsDialogProps = {
  open: boolean
  sale: SaleRow | null
  items: SaleItemRow[]
  /** Null means a cash sale with no customer attached. */
  customerName: string | null
  /** Display name of the voiding user, or null when unknown. */
  voidedByName: string | null
  /** Catalog for quantity scales; missing products fall back to whole units. */
  products: readonly ProductSummary[]
  digitStyle: DigitStyle
  /** Owner/manager only — the service refuses a cashier regardless. */
  canVoid: boolean
  saving: boolean
  /** Already-translated server error from the last print/void attempt. */
  errorText: string | null
  /** Null while a reprint is running; set again on the next attempt. */
  printError: string | null
  printing: boolean
  onClose: () => void
  onReprint: (saleId: string) => void
  onVoid: (documentId: string, reason: string) => void
}

export function SaleDetailsDialog({
  open,
  sale,
  items,
  customerName,
  voidedByName,
  products,
  digitStyle,
  canVoid,
  saving,
  errorText,
  printError,
  printing,
  onClose,
  onReprint,
  onVoid,
}: SaleDetailsDialogProps) {
  const [reason, setReason] = useState('')
  const [triedVoid, setTriedVoid] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Opening another invoice clears the void draft.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setReason('')
      setTriedVoid(false)
      setConfirming(false)
    }
  }, [open, sale?.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  const reasonInvalid = triedVoid && reason.trim().length === 0
  const productsById = new Map(products.map((product) => [product.id, product]))

  function askVoid(): void {
    setTriedVoid(true)
    if (sale === null || reason.trim().length === 0) return
    setConfirming(true)
  }

  return (
    <Dialog open={open} onClose={onClose} title={messages.purchases.details} size="md">
      {sale === null ? null : (
        <div className="flex flex-col gap-4">
          {errorText !== null && <Alert tone="error">{errorText}</Alert>}
          {printError !== null && <Alert tone="warning">{printError}</Alert>}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3">
            <div>
              <p className="text-sm text-muted">{messages.sales.invoiceNumber}</p>
              <p className="numeric text-h3 font-semibold text-ink">{sale.invoiceNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted">{messages.sales.customer}</p>
              <p className="text-base font-semibold text-ink">{customerName ?? messages.common.emptyValue}</p>
            </div>
            <div>
              <p className="text-sm text-muted">{messages.purchases.date}</p>
              <p className="numeric text-base text-ink">{formatDateTime(sale.createdAt, digitStyle)}</p>
            </div>
            <div>
              {sale.status === 'voided' ? (
                <Badge tone="neutral">{messages.purchases.statusVoided}</Badge>
              ) : sale.paymentStatus === 'paid' ? (
                <Badge tone="success">{messages.purchases.statusPaid}</Badge>
              ) : sale.paymentStatus === 'partial' ? (
                <Badge tone="info">{messages.purchases.statusPartial}</Badge>
              ) : (
                <Badge tone="warning">{messages.purchases.statusCredit}</Badge>
              )}
            </div>
          </div>

          <Table>
            <THead>
              <TRow>
                <TH>{messages.sales.product}</TH>
                <TH numeric>{messages.sales.qty}</TH>
                <TH numeric>{messages.sales.price}</TH>
                <TH numeric>{messages.sales.lineTotal}</TH>
              </TRow>
            </THead>
            <tbody>
              {items.map((item) => (
                <TRow key={item.id}>
                  <TD>
                    <p className="truncate font-semibold text-strong" title={item.productNameSnapshot}>
                      {item.productNameSnapshot}
                    </p>
                  </TD>
                  <TD numeric>{formatQty(item.qtyBase, productsById.get(item.productId)?.qtyScale ?? 0, item.unitNameSnapshot, digitStyle)}</TD>
                  <TD numeric>{formatMoney(item.unitPricePiasters, digitStyle)}</TD>
                  <TD numeric>{formatMoney(item.finalLineTotalPiasters, digitStyle)}</TD>
                </TRow>
              ))}
            </tbody>
          </Table>

          <div className="flex flex-col gap-1 rounded-lg border border-line px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-secondary">{messages.purchases.total}</span>
              <span className="numeric text-h3 font-semibold text-ink">{formatMoney(sale.totalPiasters, digitStyle)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm text-secondary">
              <span>
                {messages.purchases.paid} <span className="numeric">{formatMoney(sale.paidPiasters, digitStyle)}</span>
              </span>
              <span>
                {messages.purchases.due} <span className="numeric">{formatMoney(sale.duePiasters, digitStyle)}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" loading={printing} onClick={() => onReprint(sale.id)}>
              {messages.sales.reprint}
            </Button>
          </div>

          {sale.status === 'voided' && (
            <section aria-label={messages.purchases.statusVoided} className="flex flex-col gap-2 rounded-lg border border-line bg-panel px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-secondary">{messages.sales.voidReason}</span>
                <span className="text-base font-semibold text-ink">{sale.voidReason ?? messages.common.emptyValue}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-secondary">{messages.sales.voidedBy}</span>
                <span className="text-base text-ink">{voidedByName ?? messages.common.emptyValue}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-secondary">{messages.sales.voidedAt}</span>
                <span className="numeric text-base text-ink">
                  {sale.voidedAt === null ? messages.common.emptyValue : formatDateTime(sale.voidedAt, digitStyle)}
                </span>
              </div>
            </section>
          )}

          {canVoid && sale.status !== 'voided' && (
            <section aria-label={messages.sales.voidSale} className="flex flex-col gap-3 rounded-lg border border-line p-4">
              <p className="text-sm text-secondary">{messages.sales.voidConfirm}</p>
              <Field label={messages.sales.voidReason} htmlFor="sale-void-reason" required error={reasonInvalid ? messages.sales.voidReasonRequired : undefined}>
                <TextInput
                  id="sale-void-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={300}
                  error={reasonInvalid}
                />
              </Field>
              {confirming ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="danger"
                    loading={saving}
                    onClick={() => {
                      setConfirming(false)
                      onVoid(sale.id, reason.trim())
                    }}
                  >
                    {messages.common.yes}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>
                    {messages.common.no}
                  </Button>
                </div>
              ) : (
                <div>
                  <Button variant="danger" onClick={askVoid}>
                    {messages.sales.voidSale}
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </Dialog>
  )
}
