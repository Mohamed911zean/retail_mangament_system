import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Dialog, Field, Table, TD, TH, THead, TRow, TextInput } from '../../components/ui'
import { messages } from '../../i18n'
import { formatDateTime, formatMoney, formatQty, type DigitStyle } from '../../lib/format'
import type { ProductSummary, PurchaseDetails } from '../../../shared/ipc'

/**
 * One purchase invoice, read back from the database: header, lines, totals,
 * and — while it is still completed — the terminal void control.
 *
 * A void is compensating, never a delete: the service reverses the stock and
 * the money in the current open shift, and the invoice stays on record. The
 * reason is mandatory because an unexplained hole in the stock ledger is
 * exactly what the audit is for.
 */
export type PurchaseDetailsDialogProps = {
  open: boolean
  details: PurchaseDetails | null
  products: readonly ProductSummary[]
  /** Null means "no supplier on this invoice". */
  supplierName: string | null
  /** Display name of the voiding user, or null when unknown. */
  voidedByName: string | null
  digitStyle: DigitStyle
  /** Owner/manager only — the service refuses a cashier regardless. */
  canVoid: boolean
  saving: boolean
  /** Already-translated server error from the last void attempt. */
  errorText: string | null
  onClose: () => void
  onVoid: (documentId: string, reason: string) => void
}

export function PurchaseDetailsDialog({
  open,
  details,
  products,
  supplierName,
  voidedByName,
  digitStyle,
  canVoid,
  saving,
  errorText,
  onClose,
  onVoid,
}: PurchaseDetailsDialogProps) {
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
  }, [open, details?.purchase.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  const productsById = new Map(products.map((product) => [product.id, product]))
  const reasonInvalid = triedVoid && reason.trim().length === 0

  function askVoid(): void {
    setTriedVoid(true)
    if (details === null || reason.trim().length === 0) return
    setConfirming(true)
  }

  return (
    <Dialog open={open} onClose={onClose} title={messages.purchases.details} size="md">
      {details === null ? null : (
        <div className="flex flex-col gap-4">
          {errorText !== null && <Alert tone="error">{errorText}</Alert>}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3">
            <div>
              <p className="text-sm text-muted">{messages.purchases.invoiceNumber}</p>
              <p className="numeric text-h3 font-semibold text-ink">{details.purchase.purchaseNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted">{messages.purchases.supplier}</p>
              <p className="text-base font-semibold text-ink">{supplierName ?? messages.common.emptyValue}</p>
            </div>
            <div>
              <p className="text-sm text-muted">{messages.purchases.date}</p>
              <p className="numeric text-base text-ink">{formatDateTime(details.purchase.createdAt, digitStyle)}</p>
            </div>
            <div>
              {details.purchase.status === 'voided' ? (
                <Badge tone="neutral">{messages.purchases.statusVoided}</Badge>
              ) : details.purchase.paymentStatus === 'paid' ? (
                <Badge tone="success">{messages.purchases.statusPaid}</Badge>
              ) : details.purchase.paymentStatus === 'partial' ? (
                <Badge tone="info">{messages.purchases.statusPartial}</Badge>
              ) : (
                <Badge tone="warning">{messages.purchases.statusCredit}</Badge>
              )}
            </div>
          </div>

          <Table>
            <THead>
              <TRow>
                <TH>{messages.purchases.product}</TH>
                <TH numeric>{messages.purchases.qty}</TH>
                <TH numeric>{messages.purchases.lineCost}</TH>
                <TH numeric>{messages.purchases.lineTotal}</TH>
              </TRow>
            </THead>
            <tbody>
              {details.items.map((item) => {
                const product = productsById.get(item.productId)
                return (
                  <TRow key={item.id}>
                    <TD>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-strong" title={product?.name ?? item.productId}>{product?.name ?? item.productId}</p>
                        {item.batchCodeSnapshot !== null && <p className="numeric text-sm text-muted">{item.batchCodeSnapshot}</p>}
                      </div>
                    </TD>
                    <TD numeric>{formatQty(item.qtyBase, product?.qtyScale ?? 0, product?.baseUnitName ?? '', digitStyle)}</TD>
                    <TD numeric>{formatMoney(item.unitCostPiasters, digitStyle)}</TD>
                    <TD numeric>{formatMoney(item.lineTotalPiasters, digitStyle)}</TD>
                  </TRow>
                )
              })}
            </tbody>
          </Table>

          <div className="flex flex-col gap-1 rounded-lg border border-line px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-secondary">{messages.purchases.total}</span>
              <span className="numeric text-h3 font-semibold text-ink">{formatMoney(details.purchase.totalPiasters, digitStyle)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm text-secondary">
              <span>
                {messages.purchases.paid} <span className="numeric">{formatMoney(details.purchase.paidPiasters, digitStyle)}</span>
              </span>
              <span>
                {messages.purchases.due} <span className="numeric">{formatMoney(details.purchase.duePiasters, digitStyle)}</span>
              </span>
            </div>
          </div>

          {canVoid && details.purchase.status !== 'voided' && (
            <section aria-label={messages.purchases.voidPurchase} className="flex flex-col gap-3 rounded-lg border border-line p-4">
              <p className="text-sm text-secondary">{messages.purchases.voidConfirm}</p>
              <Field label={messages.purchases.voidReason} htmlFor="purchase-void-reason" required error={reasonInvalid ? messages.purchases.voidReasonRequired : undefined}>
                <TextInput
                  id="purchase-void-reason"
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
                      onVoid(details.purchase.id, reason.trim())
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
                    {messages.purchases.voidPurchase}
                  </Button>
                </div>
              )}
            </section>
          )}
          {details.purchase.status === 'voided' && (
            <section aria-label={messages.purchases.statusVoided} className="flex flex-col gap-2 rounded-lg border border-line bg-panel px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-secondary">{messages.purchases.voidReason}</span>
                <span className="text-base font-semibold text-ink">{details.purchase.voidReason ?? messages.common.emptyValue}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-secondary">{messages.purchases.voidedBy}</span>
                <span className="text-base text-ink">{voidedByName ?? messages.common.emptyValue}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-secondary">{messages.purchases.voidedAt}</span>
                <span className="numeric text-base text-ink">
                  {details.purchase.voidedAt === null ? messages.common.emptyValue : formatDateTime(details.purchase.voidedAt, digitStyle)}
                </span>
              </div>
            </section>
          )}
        </div>
      )}
    </Dialog>
  )
}
