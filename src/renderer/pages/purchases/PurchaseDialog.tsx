import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Dialog, Field, MoneyInput, QtyInput, Select, Table, TableEmpty, TD, TH, THead, TRow, TextInput } from '../../components/ui'
import { TrashIcon } from '../../components/icons'
import { messages } from '../../i18n'
import { formatMoney, formatQty, type DigitStyle } from '../../lib/format'
import type { ProductSummary, ReceivePurchaseInput } from '../../../shared/ipc'
import type { PaymentMethod } from '../../../shared/settings'
import type { SupplierRow } from '../../../shared/rows'
import { checkPurchasePayment, invoiceTotal, parseExpiryDate } from './purchaseCart'

/**
 * A new purchase invoice. The buyer picks a supplier (or none — then the whole
 * amount must be paid now), adds priced lines, and optionally pays part of the
 * total. Whatever stays unpaid becomes the supplier's balance in the same
 * transaction; this dialog only previews that split with the same domain
 * function the service runs.
 */
export type PurchaseDialogProps = {
  open: boolean
  products: readonly ProductSummary[]
  suppliers: readonly SupplierRow[]
  paymentMethods: readonly PaymentMethod[]
  taxEnabled: boolean
  /** `features.expiry_batches`: shows the batch/expiry fields per line. */
  expiryEnabled: boolean
  digitStyle: DigitStyle
  saving: boolean
  /** Already-translated server error from the last save attempt. */
  errorText: string | null
  onClose: () => void
  onSave: (input: ReceivePurchaseInput) => void
}

type LineDraft = {
  key: string
  productId: string
  pricedUnitQtyBase: number
  qtyBase: number
  unitCostPiasters: number
  batchCode: string
  expiryText: string
}

export function PurchaseDialog({
  open,
  products,
  suppliers,
  paymentMethods,
  taxEnabled,
  expiryEnabled,
  digitStyle,
  saving,
  errorText,
  onClose,
  onSave,
}: PurchaseDialogProps) {
  const [supplierId, setSupplierId] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [pickedId, setPickedId] = useState('')
  const [qty, setQty] = useState(0)
  const [cost, setCost] = useState(0)
  const [batchCode, setBatchCode] = useState('')
  const [expiryText, setExpiryText] = useState('')
  const [triedAdd, setTriedAdd] = useState(false)
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const keyCounter = useRef(0)

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const picked = pickedId === '' ? undefined : productsById.get(pickedId)

  // Opening starts from an empty invoice, never from the last one.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setSupplierId('')
      setLines([])
      setPickedId('')
      setQty(0)
      setCost(0)
      setBatchCode('')
      setExpiryText('')
      setTriedAdd(false)
      setPayAmount(0)
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  function pickProduct(id: string): void {
    setPickedId(id)
    const product = productsById.get(id)
    // Seed the line from the catalog defaults; the buyer can still change both.
    setQty(product === undefined ? 0 : product.priceUnitQtyBase)
    setCost(product?.costPricePiasters ?? 0)
    setTriedAdd(false)
  }

  const expiryMs = expiryText.trim().length === 0 ? null : parseExpiryDate(expiryText)
  const expiryInvalid = expiryEnabled && expiryText.trim().length > 0 && expiryMs === null
  const lineReady = picked !== undefined && qty > 0 && !expiryInvalid

  function addLine(): void {
    setTriedAdd(true)
    if (!lineReady || picked === undefined) return
    keyCounter.current += 1
    setLines((current) => [
      ...current,
      { key: `${picked.id}::${keyCounter.current}`, productId: picked.id, pricedUnitQtyBase: picked.priceUnitQtyBase, qtyBase: qty, unitCostPiasters: cost, batchCode: batchCode.trim(), expiryText: expiryText.trim() },
    ])
    setPickedId('')
    setQty(0)
    setCost(0)
    setBatchCode('')
    setExpiryText('')
    setTriedAdd(false)
  }

  const total = invoiceTotal(lines)
  const payment = checkPurchasePayment(
    total,
    payAmount > 0 ? [{ method: paymentMethods.includes(payMethod) ? payMethod : 'cash', amountPiasters: payAmount }] : [],
    supplierId === '' ? null : supplierId,
  )
  const canSave = lines.length > 0 && payment.ok

  function save(): void {
    if (!canSave) return
    onSave({
      supplierId: supplierId === '' ? null : supplierId,
      lines: lines.map((line) => {
        const product = productsById.get(line.productId)
        const expiry = line.expiryText === '' ? null : parseExpiryDate(line.expiryText)
        return {
          productId: line.productId,
          unitNameSnapshot: product?.baseUnitName ?? '',
          pricedUnitQtyBase: line.pricedUnitQtyBase,
          qtyBase: line.qtyBase,
          unitCostPiasters: line.unitCostPiasters,
          taxRateBps: taxEnabled ? (product?.taxRateBps ?? 0) : 0,
          batchCode: line.batchCode === '' ? null : line.batchCode,
          expiryAt: expiry,
          createBatch: line.batchCode !== '' || expiry !== null,
        }
      }),
      tenders: payAmount > 0 ? [{ method: paymentMethods.includes(payMethod) ? payMethod : 'cash', amountPiasters: payAmount }] : [],
      taxEnabled,
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title={messages.purchases.addPurchase} size="md">
      <div className="flex flex-col gap-4">
        {errorText !== null && <Alert tone="error">{errorText}</Alert>}

        <Field label={messages.purchases.supplier} htmlFor="purchase-supplier">
          <Select
            id="purchase-supplier"
            value={supplierId}
            onChange={setSupplierId}
            placeholder={messages.purchases.noSupplier}
            options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
          />
        </Field>

        <section aria-label={messages.purchases.items} className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={messages.purchases.product} htmlFor="purchase-product">
              <Select
                id="purchase-product"
                value={pickedId}
                onChange={pickProduct}
                placeholder={messages.purchases.selectProduct}
                options={products.map((product) => ({ value: product.id, label: product.name }))}
              />
            </Field>
            <Field label={messages.purchases.quantity} htmlFor="purchase-qty">
              <QtyInput
                id="purchase-qty"
                value={qty}
                onChange={setQty}
                qtyScale={picked?.qtyScale ?? 0}
                unitName={picked?.baseUnitName ?? ''}
                showStepper={false}
                digitStyle={digitStyle}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={messages.purchases.unitCost} htmlFor="purchase-cost">
              <MoneyInput id="purchase-cost" value={cost} onChange={setCost} digitStyle={digitStyle} />
            </Field>
            {expiryEnabled ? (
              <Field label={messages.purchases.batchCode} htmlFor="purchase-batch">
                <TextInput id="purchase-batch" value={batchCode} onChange={(event) => setBatchCode(event.target.value)} maxLength={64} />
              </Field>
            ) : (
              <div className="flex items-end pb-1">
                <Button variant="outline" disabled={!lineReady} onClick={addLine}>
                  {messages.purchases.addLine}
                </Button>
              </div>
            )}
          </div>
          {expiryEnabled && (
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label={messages.purchases.expiryDate} htmlFor="purchase-expiry" helper={messages.purchases.expiryHint} error={expiryInvalid ? messages.purchases.expiryInvalid : undefined}>
                <TextInput
                  id="purchase-expiry"
                  value={expiryText}
                  onChange={(event) => setExpiryText(event.target.value)}
                  placeholder={messages.purchases.expiryHint}
                  dir="ltr"
                  className="numeric"
                  error={expiryInvalid}
                />
              </Field>
              <div className="pb-1">
                <Button variant="outline" disabled={!lineReady} onClick={addLine}>
                  {messages.purchases.addLine}
                </Button>
              </div>
            </div>
          )}
          {triedAdd && !lineReady && <Alert tone="warning">{messages.purchases.emptyLines}</Alert>}

          <Table>
            <THead>
              <TRow>
                <TH>{messages.purchases.product}</TH>
                <TH numeric>{messages.purchases.qty}</TH>
                <TH numeric>{messages.purchases.lineCost}</TH>
                <TH numeric>{messages.purchases.lineTotal}</TH>
                <TH>{messages.products.actions}</TH>
              </TRow>
            </THead>
            <tbody>
              {lines.length === 0 ? (
                <TableEmpty colSpan={5}>{messages.purchases.emptyLines}</TableEmpty>
              ) : (
                lines.map((line) => {
                  const product = productsById.get(line.productId)
                  return (
                    <TRow key={line.key}>
                      <TD>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-strong">{product?.name ?? line.productId}</p>
                          {line.batchCode !== '' && <p className="numeric text-sm text-muted">{line.batchCode}</p>}
                        </div>
                      </TD>
                      <TD numeric>{formatQty(line.qtyBase, product?.qtyScale ?? 0, product?.baseUnitName ?? '', digitStyle)}</TD>
                      <TD numeric>{formatMoney(line.unitCostPiasters, digitStyle)}</TD>
                      <TD numeric>
                        {formatMoney(
                          invoiceTotal([{ unitCostPiasters: line.unitCostPiasters, qtyBase: line.qtyBase, pricedUnitQtyBase: line.pricedUnitQtyBase }]),
                          digitStyle,
                        )}
                      </TD>
                      <TD>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`${messages.purchases.removeLine}: ${product?.name ?? line.productId}`}
                            onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}
                          >
                            <TrashIcon size={16} />
                          </Button>
                        </div>
                      </TD>
                    </TRow>
                  )
                })
              )}
            </tbody>
          </Table>
        </section>

        <section aria-label={messages.purchases.payNow} className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={messages.purchases.payNow} htmlFor="purchase-pay">
              <MoneyInput id="purchase-pay" value={payAmount} onChange={setPayAmount} digitStyle={digitStyle} />
            </Field>
            <Field label={messages.purchases.payMethod} htmlFor="purchase-pay-method">
              <Select
                id="purchase-pay-method"
                value={payMethod}
                onChange={(value) => setPayMethod(value === 'card' ? 'card' : value === 'wallet' ? 'wallet' : 'cash')}
                options={paymentMethods.map((entry) => ({ value: entry, label: messages.paymentMethods[entry] }))}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
            <span className="text-secondary">{messages.purchases.total}</span>
            <span className="numeric text-h3 font-semibold text-ink">{formatMoney(total, digitStyle)}</span>
          </div>
          {payment.ok ? (
            <div className="flex items-center justify-between gap-4 text-sm text-secondary">
              <span>
                {messages.purchases.paid} <span className="numeric">{formatMoney(payment.paidPiasters, digitStyle)}</span>
              </span>
              <span>
                {messages.purchases.due} <span className="numeric">{formatMoney(payment.duePiasters, digitStyle)}</span>
              </span>
            </div>
          ) : supplierId === '' ? (
            <Alert tone="info">{messages.purchases.noSupplierHint}</Alert>
          ) : (
            <Alert tone="error">{messages.errors.invalid_payment}</Alert>
          )}
        </section>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {messages.common.cancel}
          </Button>
          <Button variant="primary" loading={saving} disabled={!canSave} onClick={save}>
            {messages.common.save}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
