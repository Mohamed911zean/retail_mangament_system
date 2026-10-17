import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Dialog,
  Field,
  MoneyInput,
  QtyInput,
  SearchInput,
  Select,
  TextInput,
  Toggle,
} from '../../components/ui'
import { TrashIcon } from '../../components/icons'
import { messages } from '../../i18n'
import { formatMoney, formatQty, type DigitStyle } from '../../lib/format'
import { validateCheckDigit } from '../../../domain/barcodeValidation'
import type { CategoryRow, ProductUnitRow } from '../../../shared/rows'
import type { ProductInput, ProductSummary, ProductUpdateInput } from '../../../shared/ipc'

/**
 * The product form (screen 1): one dialog for creating and editing, because a
 * shop owner should not learn two screens for the same fields.
 *
 * The page owns every IPC call; this dialog owns the draft and reports an
 * intent (`onSave`). Units and barcodes are edited only for a saved product,
 * since they need its id — a just-created product stays open in edit mode.
 */
export type SavePayload =
  | { mode: 'create'; input: ProductInput; initialBarcode?: string }
  | { mode: 'edit'; id: string; fields: ProductUpdateInput }

export type ProductDialogProps = {
  open: boolean
  /** Null means "create"; a summary means "edit this product". */
  product: ProductSummary | null
  initialBarcode?: string | null
  categories: readonly CategoryRow[]
  /** `features.weighted_items`: without it every product is counted pieces. */
  weightedEnabled: boolean
  /** `features.expiry_batches`: gates the per-product expiry switch. */
  expiryEnabled: boolean
  /** `product.price_change` — without it the price field is read-only. */
  canEditPrice: boolean
  /** `product.cost_change` — without it the cost field is read-only. */
  canEditCost: boolean
  digitStyle: DigitStyle
  saving: boolean
  /** Already-translated server error from the last save/units/barcodes attempt. */
  errorText: string | null
  onClose: () => void
  onSave: (payload: SavePayload) => void
  onAddUnit: (productId: string, unitName: string, baseQtyPerUnit: number, sellingPricePiasters: number) => void
  onRemoveUnit: (productId: string, unitId: string) => void
  onAddBarcode: (productId: string, barcode: string, isPrimary: boolean) => void
  onRemoveBarcode: (productId: string, barcode: string) => void
}

export function ProductDialog({
  open,
  product,
  initialBarcode,
  categories,
  weightedEnabled,
  expiryEnabled,
  canEditPrice,
  canEditCost,
  digitStyle,
  saving,
  errorText,
  onClose,
  onSave,
  onAddUnit,
  onRemoveUnit,
  onAddBarcode,
  onRemoveBarcode,
}: ProductDialogProps) {
  const [name, setName] = useState('')
  const [triedSave, setTriedSave] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [sku, setSku] = useState('')
  const [baseUnitName, setBaseUnitName] = useState('')
  const [kind, setKind] = useState<'counted' | 'weighted'>('counted')
  const [sellingPrice, setSellingPrice] = useState(0)
  const [costPrice, setCostPrice] = useState(0)
  const [threshold, setThreshold] = useState(0)
  const [trackExpiry, setTrackExpiry] = useState(false)

  const [unitName, setUnitName] = useState('')
  const [unitQty, setUnitQty] = useState(0)
  const [unitPrice, setUnitPrice] = useState(0)
  const [confirmUnitId, setConfirmUnitId] = useState<string | null>(null)

  const [barcode, setBarcode] = useState('')
  const [barcodePrimary, setBarcodePrimary] = useState(false)
  const [confirmBarcode, setConfirmBarcode] = useState<string | null>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Opening (or switching to another product) reseeds the draft; typing never
  // does. Unit/barcode drafts live outside this effect so a refreshed product
  // after adding a unit does not wipe what is being typed next.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    setTriedSave(false)
    setConfirmUnitId(null)
    setConfirmBarcode(null)
    if (product === null) {
      setName('')
      setCategoryId('')
      setSku('')
      setBaseUnitName('')
      setKind('counted')
      setSellingPrice(0)
      setCostPrice(0)
      setThreshold(0)
      setTrackExpiry(false)
      setBarcode(initialBarcode ?? '')
      setBarcodePrimary(true)
      return
    }
    setName(product.name)
    setCategoryId(product.categoryId ?? '')
    setSku(product.sku ?? '')
    setBaseUnitName(product.baseUnitName)
    setKind(product.qtyScale === 3 ? 'weighted' : 'counted')
    setSellingPrice(product.sellingPricePiasters)
    setCostPrice(product.costPricePiasters)
    setThreshold(product.lowStockThresholdQty)
    setTrackExpiry(product.trackExpiry)
  }, [open, product, initialBarcode])
  /* eslint-enable react-hooks/set-state-in-effect */

  const qtyScale = kind === 'weighted' ? 3 : 0
  const nameInvalid = triedSave && name.trim().length === 0
  const unitValid = unitName.trim().length > 0 && unitQty > 0
  const barcodeValid = barcode.trim().length > 0

  function save(): void {
    setTriedSave(true)
    if (name.trim().length === 0) return
    const base: ProductInput = {
      name: name.trim(),
      sku: sku.trim().length === 0 ? null : sku.trim(),
      categoryId: categoryId === '' ? null : categoryId,
      baseUnitName: baseUnitName.trim().length === 0 ? messages.products.piece : baseUnitName.trim(),
      qtyScale,
      priceUnitQtyBase: kind === 'weighted' ? 1000 : 1,
      costPricePiasters: canEditCost ? costPrice : 0,
      sellingPricePiasters: canEditPrice ? sellingPrice : 0,
      trackExpiry: expiryEnabled && trackExpiry,
      isWeighted: kind === 'weighted',
      lowStockThresholdQty: threshold,
    }
    if (product === null) {
      onSave({ mode: 'create', input: base, initialBarcode: barcode.trim() || undefined })
      return
    }
    // Send only what changed: re-sending an identical packaging value must not
    // trip the service's `product_has_movements` guard.
    const fields: ProductUpdateInput = {}
    if (base.name !== product.name) fields.name = base.name
    if (base.sku !== product.sku) fields.sku = base.sku
    if (base.categoryId !== product.categoryId) fields.categoryId = base.categoryId
    if (base.baseUnitName !== product.baseUnitName) fields.baseUnitName = base.baseUnitName
    if (base.qtyScale !== product.qtyScale) fields.qtyScale = base.qtyScale
    if (base.priceUnitQtyBase !== product.priceUnitQtyBase) fields.priceUnitQtyBase = base.priceUnitQtyBase
    if (base.isWeighted !== product.isWeighted) fields.isWeighted = base.isWeighted
    if (canEditPrice && base.sellingPricePiasters !== product.sellingPricePiasters) {
      fields.sellingPricePiasters = base.sellingPricePiasters
    }
    if (canEditCost && base.costPricePiasters !== product.costPricePiasters) {
      fields.costPricePiasters = base.costPricePiasters
    }
    if (base.lowStockThresholdQty !== product.lowStockThresholdQty) {
      fields.lowStockThresholdQty = base.lowStockThresholdQty
    }
    if (base.trackExpiry !== product.trackExpiry) fields.trackExpiry = base.trackExpiry
    onSave({ mode: 'edit', id: product.id, fields })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={product === null ? messages.products.addProduct : messages.products.editProduct}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {messages.common.cancel}
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {messages.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {errorText !== null && <Alert tone="error">{errorText}</Alert>}

        <Field label={messages.products.name} htmlFor="product-name" required error={nameInvalid ? messages.products.nameRequired : undefined}>
          <TextInput
            id="product-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            autoFocus
            error={nameInvalid}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={messages.products.category} htmlFor="product-category">
            <Select
              id="product-category"
              value={categoryId}
              onChange={setCategoryId}
              placeholder={messages.products.noCategory}
              options={categories.map((category) => ({ value: category.id, label: category.name }))}
            />
          </Field>
          <Field label={messages.products.sku} htmlFor="product-sku">
            <TextInput
              id="product-sku"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              maxLength={64}
              dir="ltr"
              className="numeric"
            />
          </Field>
        </div>

        {product === null && (
          <Field
            label={messages.products.barcodes}
            htmlFor="create-product-barcode"
            helper={
              barcode.trim().length > 0
                ? validateCheckDigit(barcode.trim()) === 'invalid_check'
                  ? messages.products.barcodeInvalidCheck
                  : validateCheckDigit(barcode.trim()) === 'valid'
                    ? messages.products.barcodeStandardValid
                    : undefined
                : undefined
            }
          >
            <SearchInput
              id="create-product-barcode"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              onClear={() => setBarcode('')}
              placeholder={messages.products.barcodePlaceholder}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label={messages.products.baseUnit} htmlFor="product-base-unit">
            <TextInput
              id="product-base-unit"
              value={baseUnitName}
              onChange={(event) => setBaseUnitName(event.target.value)}
              maxLength={32}
              placeholder={messages.products.piece}
            />
          </Field>
          {weightedEnabled && (
            <Field label={messages.products.productType} htmlFor="product-kind">
              <Select
                id="product-kind"
                value={kind}
                onChange={(value) => setKind(value === 'weighted' ? 'weighted' : 'counted')}
                options={[
                  { value: 'counted', label: messages.products.counted },
                  { value: 'weighted', label: messages.products.weighted },
                ]}
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={messages.products.sellingPrice} htmlFor="product-price" helper={canEditPrice ? undefined : messages.products.noPermissionHint}>
            <MoneyInput
              id="product-price"
              value={sellingPrice}
              onChange={setSellingPrice}
              disabled={!canEditPrice}
              digitStyle={digitStyle}
            />
          </Field>
          <Field label={messages.products.costPrice} htmlFor="product-cost" helper={canEditCost ? undefined : messages.products.noPermissionHint}>
            <MoneyInput
              id="product-cost"
              value={costPrice}
              onChange={setCostPrice}
              disabled={!canEditCost}
              digitStyle={digitStyle}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={messages.products.lowStockThreshold} htmlFor="product-threshold">
            <QtyInput
              id="product-threshold"
              value={threshold}
              onChange={setThreshold}
              qtyScale={qtyScale}
              unitName={baseUnitName.trim().length === 0 ? messages.products.piece : baseUnitName.trim()}
              showStepper={false}
              digitStyle={digitStyle}
            />
          </Field>
          {expiryEnabled && (
            <div className="flex items-end pb-2">
              <Toggle id="product-expiry" checked={trackExpiry} onChange={setTrackExpiry} label={messages.products.trackExpiry} />
            </div>
          )}
        </div>

        {product !== null && (
          <>
            <UnitsSection
              product={product}
              digitStyle={digitStyle}
              unitName={unitName}
              unitQty={unitQty}
              unitPrice={unitPrice}
              unitValid={unitValid}
              confirmUnitId={confirmUnitId}
              onUnitName={setUnitName}
              onUnitQty={setUnitQty}
              onUnitPrice={setUnitPrice}
              onConfirmUnit={setConfirmUnitId}
              onAddUnit={() => {
                if (!unitValid) return
                onAddUnit(product.id, unitName.trim(), unitQty, unitPrice)
                setUnitName('')
                setUnitQty(0)
                setUnitPrice(0)
              }}
              onRemoveUnit={(unitId) => {
                setConfirmUnitId(null)
                onRemoveUnit(product.id, unitId)
              }}
            />
            <BarcodesSection
              product={product}
              barcode={barcode}
              barcodePrimary={barcodePrimary}
              barcodeValid={barcodeValid}
              confirmBarcode={confirmBarcode}
              barcodeInputRef={barcodeInputRef}
              onBarcode={setBarcode}
              onBarcodePrimary={setBarcodePrimary}
              onConfirmBarcode={setConfirmBarcode}
              onAddBarcode={() => {
                if (!barcodeValid) return
                onAddBarcode(product.id, barcode.trim(), barcodePrimary)
                setBarcode('')
                setBarcodePrimary(false)
                setTimeout(() => barcodeInputRef.current?.focus(), 50)
              }}
              onRemoveBarcode={(code) => {
                setConfirmBarcode(null)
                onRemoveBarcode(product.id, code)
              }}
            />
          </>
        )}
      </div>
    </Dialog>
  )
}

// ─── Units ────────────────────────────────────────────────────────────────────

function UnitsSection({
  product,
  digitStyle,
  unitName,
  unitQty,
  unitPrice,
  unitValid,
  confirmUnitId,
  onUnitName,
  onUnitQty,
  onUnitPrice,
  onConfirmUnit,
  onAddUnit,
  onRemoveUnit,
}: {
  product: ProductSummary
  digitStyle: DigitStyle
  unitName: string
  unitQty: number
  unitPrice: number
  unitValid: boolean
  confirmUnitId: string | null
  onUnitName: (value: string) => void
  onUnitQty: (value: number) => void
  onUnitPrice: (value: number) => void
  onConfirmUnit: (unitId: string | null) => void
  onAddUnit: () => void
  onRemoveUnit: (unitId: string) => void
}) {
  return (
    <section aria-label={messages.products.units} className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <div>
        <h3 className="text-h3 font-semibold text-ink">{messages.products.units}</h3>
        <p className="text-sm text-muted">{messages.products.unitsHint}</p>
      </div>

      {product.units.length > 0 && (
        <ul className="flex flex-col gap-2">
          {product.units.map((unit: ProductUnitRow) => (
            <li key={unit.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-base text-strong" title={unit.unitName}>{unit.unitName}</p>
                <p className="numeric text-sm text-muted">
                  {formatQty(unit.baseQtyPerUnit, product.qtyScale, product.baseUnitName, digitStyle)}
                  {' · '}
                  {formatMoney(unit.sellingPricePiasters, digitStyle)}
                </p>
              </div>
              {confirmUnitId === unit.id ? (
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="danger" size="sm" onClick={() => onRemoveUnit(unit.id)}>
                    {messages.common.yes}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onConfirmUnit(null)}>
                    {messages.common.no}
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" aria-label={`${messages.products.unitRemove}: ${unit.unitName}`} onClick={() => onConfirmUnit(unit.id)}>
                  <TrashIcon size={16} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-3 items-end gap-2">
        <Field label={messages.products.unitName} htmlFor="product-unit-name">
          <TextInput id="product-unit-name" value={unitName} onChange={(event) => onUnitName(event.target.value)} maxLength={32} />
        </Field>
        <Field label={messages.products.unitQty} htmlFor="product-unit-qty">
          <QtyInput
            id="product-unit-qty"
            value={unitQty}
            onChange={onUnitQty}
            qtyScale={product.qtyScale}
            unitName={product.baseUnitName}
            showStepper={false}
            digitStyle={digitStyle}
          />
        </Field>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label={messages.products.unitPrice} htmlFor="product-unit-price">
              <MoneyInput id="product-unit-price" value={unitPrice} onChange={onUnitPrice} digitStyle={digitStyle} />
            </Field>
          </div>
          <Button variant="outline" onClick={onAddUnit} disabled={!unitValid}>
            {messages.products.addUnit}
          </Button>
        </div>
      </div>
    </section>
  )
}

// ─── Barcodes ─────────────────────────────────────────────────────────────────

function BarcodesSection({
  product,
  barcode,
  barcodePrimary,
  barcodeValid,
  confirmBarcode,
  barcodeInputRef,
  onBarcode,
  onBarcodePrimary,
  onConfirmBarcode,
  onAddBarcode,
  onRemoveBarcode,
}: {
  product: ProductSummary
  barcode: string
  barcodePrimary: boolean
  barcodeValid: boolean
  confirmBarcode: string | null
  barcodeInputRef: React.RefObject<HTMLInputElement | null>
  onBarcode: (value: string) => void
  onBarcodePrimary: (value: boolean) => void
  onConfirmBarcode: (barcode: string | null) => void
  onAddBarcode: () => void
  onRemoveBarcode: (barcode: string) => void
}) {
  const checkStatus = barcode.trim().length > 0 ? validateCheckDigit(barcode.trim()) : null
  const helperText =
    checkStatus === 'invalid_check'
      ? messages.products.barcodeInvalidCheck
      : checkStatus === 'valid'
        ? messages.products.barcodeStandardValid
        : messages.products.addBarcodeEnterHint

  return (
    <section aria-label={messages.products.barcodes} className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <h3 className="text-h3 font-semibold text-ink">{messages.products.barcodes}</h3>

      {product.barcodes.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {product.barcodes.map((code) => (
            <li key={code} className="flex items-center gap-2 rounded-md border border-line bg-panel px-2 py-1">
              <span className="numeric text-base text-strong">{code}</span>
              {confirmBarcode === code ? (
                <>
                  <Button variant="danger" size="sm" onClick={() => onRemoveBarcode(code)}>
                    {messages.common.yes}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onConfirmBarcode(null)}>
                    {messages.common.no}
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${messages.products.barcodeRemove}: ${code}`}
                  onClick={() => onConfirmBarcode(code)}
                >
                  <TrashIcon size={16} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label={messages.products.barcodePlaceholder} htmlFor="product-barcode" helper={helperText}>
            <SearchInput
              ref={barcodeInputRef}
              id="product-barcode"
              value={barcode}
              onChange={(event) => onBarcode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (barcodeValid) {
                    onAddBarcode()
                  }
                }
              }}
              onClear={() => onBarcode('')}
              placeholder={messages.products.barcodePlaceholder}
            />
          </Field>
        </div>
        <div className="pb-1">
          <Toggle id="product-barcode-primary" checked={barcodePrimary} onChange={onBarcodePrimary} label={messages.products.primaryBarcode} />
        </div>
        <div className="pb-1">
          <Button variant="outline" onClick={onAddBarcode} disabled={!barcodeValid}>
            {messages.products.addBarcode}
          </Button>
        </div>
      </div>
    </section>
  )
}
