/**
 * The selling screen (design system §4.5).
 *
 * This is the only stateful piece of the POS: it owns the cart, the chosen
 * customer and which dialog is open, and it is the only place that talks to the
 * sale service. Everything it displays comes from pure modules — `cart.ts` for
 * the totals, `payment.ts` for the change, `search.ts` for the product filter —
 * so the figure on screen and the figure on the invoice are produced by the same
 * functions.
 *
 * The invoice is never edited in place after a sale: a completed sale drops the
 * cart and a return is a separate document made from the sales screen. That is
 * what keeps a receipt that has already been handed over from disagreeing with
 * the books.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Dialog, Field, IconButton, TextInput } from '../../components/ui'
import { CloseIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { formatDateTime, type DigitStyle } from '../../lib/format'
import type { Preferences } from '../../lib/preferences'
import type { Settings } from '../../../shared/settings'
import type { CloseShiftResult, CurrentUser, CustomerSummary, ProductSummary, SaleTender } from '../../../shared/ipc'
import type { ShiftRow } from '../../../shared/rows'
import {
  addProduct,
  cartFromSaleLines,
  cartLineTotals,
  cartTotals,
  emptyCart,
  lineKey,
  removeLine,
  setInvoiceDiscount,
  setLineDiscount,
  setLinePrice,
  setLineQty,
  setLineUnit,
  toSaleLines,
  type Cart,
  type CartDiscount,
} from './cart'
import { CartTable } from './CartTable'
import { CustomerDialog } from './CustomerDialog'
import { DiscountDialog } from './DiscountDialog'
import { HeldSalesDialog } from './HeldSalesDialog'
import { PaymentDialog } from './PaymentDialog'
import { ProductPicker } from './ProductPicker'
import { ShiftCloseDialog } from './ShiftCloseDialog'
import { ShiftGate } from './ShiftGate'
import { TotalsFooter } from './TotalsFooter'
import { findExactBarcode } from './search'

export type PosPageProps = {
  user: CurrentUser
  preferences: Preferences
}

type Banner = { kind: 'success' | 'info' | 'warning' | 'error'; text: string }
type DiscountTarget = { kind: 'invoice' } | { kind: 'line'; lineId: string }

export function PosPage({ user, preferences }: PosPageProps) {
  const digitStyle: DigitStyle = preferences.digitStyle

  const [settings, setSettings] = useState<Settings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductSummary[] | null>(null)
  const [productsError, setProductsError] = useState<string | null>(null)

  const [shift, setShift] = useState<ShiftRow | null>(null)
  const [shiftLoaded, setShiftLoaded] = useState(false)
  const [shiftBusy, setShiftBusy] = useState(false)
  const [shiftError, setShiftError] = useState<string | null>(null)
  const [shiftCloseOpen, setShiftCloseOpen] = useState(false)
  const [shiftCloseResult, setShiftCloseResult] = useState<CloseShiftResult | null>(null)

  const [cart, setCart] = useState<Cart>(emptyCart)
  const [customer, setCustomer] = useState<CustomerSummary | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const [discountTarget, setDiscountTarget] = useState<DiscountTarget | null>(null)
  const [holdOpen, setHoldOpen] = useState(false)
  const [holdLabel, setHoldLabel] = useState('')
  const [clearOpen, setClearOpen] = useState(false)
  const [pendingResumeId, setPendingResumeId] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)
  const [heldToken, setHeldToken] = useState(0)

  const searchRef = useRef<HTMLInputElement>(null)

  const loadProducts = useCallback(async (): Promise<void> => {
    setProductsError(null)
    try {
      setProducts(await unwrap(window.api.catalog.listProducts()))
    } catch (error) {
      setProductsError(translate(errorKey(error)))
    }
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const info = await unwrap(window.api.app.getInfo())
        if (alive) setSettings(info.settings)
      } catch (error) {
        if (alive) setLoadError(translate(errorKey(error)))
      }
      try {
        const current = await unwrap(window.api.shifts.current())
        if (alive) setShift(current)
      } catch {
        // A failed shift read must not block selling when shifts are switched
        // off; the service still refuses a sale without a shift if they are on.
        if (alive) setShift(null)
      } finally {
        if (alive) setShiftLoaded(true)
      }
    })()
    void loadProducts()
    return () => {
      alive = false
    }
  }, [loadProducts])

  const totalsOptions = useMemo(
    () => ({
      taxEnabled: settings === null ? false : settings.tax,
      cashRoundingStep: settings === null ? 0 : settings.cash_rounding_step_piasters,
    }),
    [settings],
  )

  const totals = useMemo(() => cartTotals(cart, totalsOptions), [cart, totalsOptions])
  const lineTotals = useMemo(() => cartLineTotals(cart, totalsOptions), [cart, totalsOptions])
  const productsById = useMemo(() => {
    const map = new Map<string, ProductSummary>()
    for (const product of products ?? []) map.set(product.id, product)
    return map
  }, [products])

  /** What an invoice discount is taken from: the lines after their own discounts. */
  const invoiceDiscountBase = useMemo(
    () => lineTotals.reduce((sum, line) => (line === null ? sum : sum + line.subtotalPiasters - line.discountPiasters), 0),
    [lineTotals],
  )

  // Closing the shift empties `shift`, which would swap the whole screen for the
  // open-shift gate before the cashier ever saw the counted-vs-expected figure —
  // so the gate waits until the reconciliation dialog has been dismissed.
  const needsShift =
    settings !== null && settings.shifts && shiftLoaded && shift === null && shiftCloseResult === null
  const paymentMethods = settings === null ? [] : settings.payment_methods

  // ── Cart edits ─────────────────────────────────────────────────────────────

  function handleAdd(product: ProductSummary): void {
    setBanner(null)
    // A scan or a tap adds one priced unit: one kilogram of a weighted product,
    // one piece of a counted one. More is a quantity the cashier types.
    setCart((current) => addProduct(current, product, -1, product.priceUnitQtyBase))
    setSelectedId(lineKey(product.id, product.baseUnitName))
    searchRef.current?.focus()
  }

  function handleScanSubmit(code: string): boolean {
    if (products === null) return false
    const match = findExactBarcode(products, code)
    if (match === undefined) return false
    handleAdd(match)
    return true
  }

  function handleUnitChange(lineId: string, product: ProductSummary, unitIndex: number): void {
    setCart((current) => setLineUnit(current, lineId, product, unitIndex))
  }

  function openDiscountFor(target: DiscountTarget): void {
    setDiscountTarget(target)
  }

  function applyDiscount(discount: CartDiscount | undefined): void {
    const target = discountTarget
    setDiscountTarget(null)
    if (target === null) return
    setCart((current) =>
      target.kind === 'invoice' ? setInvoiceDiscount(current, discount) : setLineDiscount(current, target.lineId, discount),
    )
  }

  const discountCurrent: CartDiscount | undefined =
    discountTarget === null
      ? undefined
      : discountTarget.kind === 'invoice'
        ? cart.invoiceDiscount
        : cart.lines.find((line) => line.id === discountTarget.lineId)?.lineDiscount

  const discountMax =
    discountTarget === null
      ? 0
      : discountTarget.kind === 'invoice'
        ? invoiceDiscountBase
        : (lineTotals[cart.lines.findIndex((line) => line.id === discountTarget.lineId)]?.subtotalPiasters ?? 0)

  // ── Completing a sale ──────────────────────────────────────────────────────

  function buildSaleInput(tenders: SaleTender[]) {
    if (settings === null) return null
    return {
      customerId: customer === null ? null : customer.id,
      shiftId: shift === null ? null : shift.id,
      lines: toSaleLines(cart),
      ...(cart.invoiceDiscount === undefined ? {} : { invoiceDiscount: cart.invoiceDiscount }),
      tenders,
      notes: null,
      taxEnabled: settings.tax,
      cashRoundingStep: settings.cash_rounding_step_piasters,
    }
  }

  async function printReceipt(saleId: string): Promise<void> {
    if (!preferences.autoPrintReceipt) return
    if (preferences.receiptPrinter === '') return
    try {
      await unwrap(window.api.printing.printSaleReceipt(preferences.receiptPrinter, saleId))
    } catch {
      // The sale is already saved, so a printer failure is a warning with a
      // reprint button — never a reason to pretend the sale did not happen.
      setBanner({ kind: 'warning', text: messages.pos.receiptPrintFailed })
    }
  }

  async function handleConfirmSale(tenders: SaleTender[]): Promise<void> {
    if (saving) return
    const input = buildSaleInput(tenders)
    if (input === null) return
    const discounted = cart.invoiceDiscount !== undefined || cart.lines.some((line) => line.lineDiscount !== undefined)

    setSaving(true)
    setSaveError(null)
    try {
      const result = await unwrap(window.api.sales.complete(input))
      setPaymentOpen(false)
      setCart(emptyCart)
      setCustomer(null)
      setSelectedId(null)
      setLastSaleId(result.sale.id)
      setBanner({ kind: 'success', text: discounted ? messages.pos.saleSavedDiscount : messages.pos.saleSaved })
      void loadProducts()
      await printReceipt(result.sale.id)
    } catch (error) {
      setSaveError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  // ── Holding and resuming ───────────────────────────────────────────────────

  async function handleHold(): Promise<void> {
    const input = buildSaleInput([])
    if (input === null) return
    const label = holdLabel.trim()
    try {
      await unwrap(window.api.sales.hold({ ...input, label: label === '' ? null : label }))
      setHoldOpen(false)
      setHoldLabel('')
      setCart(emptyCart)
      setCustomer(null)
      setSelectedId(null)
      setHeldToken((token) => token + 1)
      setBanner({ kind: 'info', text: messages.pos.holdDone })
    } catch (error) {
      setBanner({ kind: 'error', text: translate(errorKey(error)) })
    }
  }

  async function resumeHeld(heldSaleId: string): Promise<void> {
    try {
      const payload = await unwrap(window.api.sales.recallHeld(heldSaleId))
      let next = cartFromSaleLines(payload.lines, products ?? [])
      if (payload.invoiceDiscount !== undefined) next = setInvoiceDiscount(next, payload.invoiceDiscount)
      setCart(next)
      setSelectedId(null)

      if (payload.customerId === undefined || payload.customerId === null) {
        setCustomer(null)
      } else {
        try {
          setCustomer(await unwrap(window.api.customers.get(payload.customerId)))
        } catch {
          setCustomer(null)
        }
      }

      setHeldOpen(false)
      setPendingResumeId(null)
      // Recalling reads the payload without consuming it, so the hold is dropped
      // explicitly: leaving it would let the same invoice be resumed twice.
      await unwrap(window.api.sales.dropHeld(heldSaleId))
      setHeldToken((token) => token + 1)
    } catch (error) {
      setBanner({ kind: 'error', text: translate(errorKey(error)) })
    }
  }

  function requestResume(heldSaleId: string): void {
    if (cart.lines.length === 0) {
      void resumeHeld(heldSaleId)
      return
    }
    setPendingResumeId(heldSaleId)
  }

  async function handleDropHeld(heldSaleId: string): Promise<void> {
    try {
      await unwrap(window.api.sales.dropHeld(heldSaleId))
      setHeldToken((token) => token + 1)
    } catch (error) {
      setBanner({ kind: 'error', text: translate(errorKey(error)) })
    }
  }

  // ── Shifts ─────────────────────────────────────────────────────────────────

  async function handleOpenShift(openingCashPiasters: number): Promise<void> {
    setShiftBusy(true)
    setShiftError(null)
    try {
      await unwrap(window.api.shifts.open({ openingCashPiasters }))
      setShift(await unwrap(window.api.shifts.current()))
    } catch (error) {
      setShiftError(translate(errorKey(error)))
    } finally {
      setShiftBusy(false)
    }
  }

  async function handleCloseShift(countedCashPiasters: number, notes: string | null): Promise<void> {
    if (shift === null) return
    setShiftBusy(true)
    setShiftError(null)
    try {
      const result = await unwrap(
        window.api.shifts.close({ shiftId: shift.id, countedCashPiasters, closingNotes: notes }),
      )
      setShiftCloseResult(result)
      setShift(null)
    } catch (error) {
      setShiftError(translate(errorKey(error)))
    } finally {
      setShiftBusy(false)
    }
  }

  // ── Keyboard (§4.5) ────────────────────────────────────────────────────────

  const anyDialogOpen =
    paymentOpen || customerOpen || heldOpen || discountTarget !== null || holdOpen || clearOpen || shiftCloseOpen || shiftCloseResult !== null

  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      return target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (anyDialogOpen) return
      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault()
        if (totals !== null) setPaymentOpen(true)
        return
      }
      switch (event.key) {
        case 'F2':
          event.preventDefault()
          searchRef.current?.focus()
          return
        case 'F4':
          event.preventDefault()
          if (cart.lines.length > 0) setHoldOpen(true)
          return
        case 'F5':
          event.preventDefault()
          setHeldOpen(true)
          return
        case 'F8':
          event.preventDefault()
          // The setter directly, not `openDiscountFor`: the effect must not close
          // over a function recreated every render (react-hooks/exhaustive-deps).
          setDiscountTarget({ kind: 'invoice' })
          return
        case 'F9':
          event.preventDefault()
          setCustomerOpen(true)
          return
        case 'Delete':
          // Only outside a field: Delete inside the quantity box must edit the
          // number, not the invoice line.
          if (isTyping(event.target) || selectedId === null) return
          event.preventDefault()
          setCart((current) => removeLine(current, selectedId))
          setSelectedId(null)
          return
        case 'Escape':
          if (isTyping(event.target)) return
          setSelectedId(null)
          return
        default:
          return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [anyDialogOpen, cart.lines.length, selectedId, totals])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert tone="error">{loadError}</Alert>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {messages.common.retry}
        </Button>
      </div>
    )
  }

  if (needsShift) {
    return <ShiftGate saving={shiftBusy} errorText={shiftError} digitStyle={digitStyle} onOpen={(cash) => void handleOpenShift(cash)} />
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* ── Bar: shift state on the start side, the parked invoices on the end ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>{user.displayName}</span>
          {shift !== null && settings !== null && settings.shifts && (
            <span>
              {messages.pos.shiftStartedAt} <span className="numeric">{formatDateTime(shift.openedAt, digitStyle)}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setHeldOpen(true)}>
            {messages.pos.heldTitle}
          </Button>
          <Button variant="outline" disabled={cart.lines.length === 0} onClick={() => setHoldOpen(true)}>
            {messages.pos.hold}
          </Button>
          {shift !== null && settings !== null && settings.shifts && (
            <Button variant="outline" onClick={() => setShiftCloseOpen(true)}>
              {messages.pos.shiftClose}
            </Button>
          )}
        </div>
      </div>

      {banner !== null && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Alert tone={banner.kind}>{banner.text}</Alert>
          </div>
          {lastSaleId !== null && lastSaleId.length > 0 && (
            <Button variant="outline" onClick={() => void printReceipt(lastSaleId)}>
              {messages.pos.receiptReprint}
            </Button>
          )}
          <IconButton label={messages.common.close} variant="ghost" onClick={() => setBanner(null)}>
            <CloseIcon size={16} />
          </IconButton>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        {/* The invoice sits on the start side (the right in RTL) and the search on
            the end side, so the cashier's eyes never cross the screen. */}
        <div className="flex w-[380px] shrink-0 flex-col gap-3 2xl:w-[440px]">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {products === null ? (
              <Card>
                <Alert tone="info">{messages.pos.loadingProducts}</Alert>
              </Card>
            ) : (
              <CartTable
                lines={cart.lines}
                lineTotals={lineTotals}
                productsById={productsById}
                selectedId={selectedId}
                allowNegativeStock={settings === null ? true : settings.allow_negative_stock}
                digitStyle={digitStyle}
                onSelect={setSelectedId}
                onQtyChange={(lineId, qtyBase) => setCart((current) => setLineQty(current, lineId, qtyBase))}
                onPriceChange={(lineId, price) => setCart((current) => setLinePrice(current, lineId, price))}
                onUnitChange={handleUnitChange}
                onDiscount={(lineId) => openDiscountFor({ kind: 'line', lineId })}
                onRemove={(lineId) => {
                  setCart((current) => removeLine(current, lineId))
                  if (selectedId === lineId) setSelectedId(null)
                }}
              />
            )}
          </div>

          <TotalsFooter
            totals={totals}
            taxEnabled={settings === null ? false : settings.tax}
            itemCount={cart.lines.length}
            digitStyle={digitStyle}
            actions={
              <>
                <Button
                  size="pos"
                  block
                  disabled={totals === null}
                  onClick={() => {
                    setSaveError(null)
                    setPaymentOpen(true)
                  }}
                >
                  {messages.pos.pay}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" block disabled={totals === null} onClick={() => openDiscountFor({ kind: 'invoice' })}>
                    {messages.pos.discountInvoiceTarget}
                  </Button>
                  <Button variant="ghost" block disabled={cart.lines.length === 0} onClick={() => setClearOpen(true)}>
                    {messages.pos.clearCart}
                  </Button>
                </div>
              </>
            }
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {settings !== null && settings.customer_credit && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setCustomerOpen(true)}>
                {messages.pos.customerChoose}
              </Button>
              <span className="text-sm text-muted">
                {customer === null ? messages.pos.customerNone : customer.name}
              </span>
              {customer !== null && (
                <IconButton label={messages.pos.customerClear} variant="ghost" onClick={() => setCustomer(null)}>
                  <CloseIcon size={16} />
                </IconButton>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1">
            <ProductPicker
              products={products ?? []}
              loading={products === null && productsError === null}
              error={productsError}
              onRetry={() => void loadProducts()}
              onAdd={handleAdd}
              onScanSubmit={handleScanSubmit}
              digitStyle={digitStyle}
              searchRef={searchRef}
            />
          </div>
        </div>
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}

      <PaymentDialog
        open={paymentOpen}
        totalPiasters={totals === null ? 0 : totals.total}
        customer={customer}
        creditEnabled={settings !== null && settings.customer_credit}
        methods={paymentMethods}
        nestedOpen={customerOpen}
        saving={saving}
        errorText={saveError}
        digitStyle={digitStyle}
        onClose={() => setPaymentOpen(false)}
        onChooseCustomer={() => setCustomerOpen(true)}
        onConfirm={(tenders) => void handleConfirmSale(tenders)}
      />

      <CustomerDialog
        open={customerOpen}
        selected={customer}
        creditEnabled={settings !== null && settings.customer_credit}
        digitStyle={digitStyle}
        onClose={() => setCustomerOpen(false)}
        onSelect={(chosen) => {
          setCustomer(chosen)
          setCustomerOpen(false)
        }}
      />

      <DiscountDialog
        open={discountTarget !== null}
        title={discountTarget !== null && discountTarget.kind === 'invoice' ? messages.pos.discountInvoiceTarget : messages.pos.discountTitle}
        current={discountCurrent}
        maxPiasters={discountMax}
        digitStyle={digitStyle}
        onClose={() => setDiscountTarget(null)}
        onApply={applyDiscount}
      />

      <HeldSalesDialog
        open={heldOpen}
        reloadToken={heldToken}
        digitStyle={digitStyle}
        onClose={() => setHeldOpen(false)}
        onResume={requestResume}
        onDrop={(heldSaleId) => void handleDropHeld(heldSaleId)}
      />

      <ShiftCloseDialog
        open={shiftCloseOpen || shiftCloseResult !== null}
        busy={shiftBusy}
        errorText={shiftError}
        result={shiftCloseResult}
        digitStyle={digitStyle}
        onClose={() => {
          setShiftCloseOpen(false)
          setShiftCloseResult(null)
          setShiftError(null)
        }}
        onConfirm={(counted, notes) => void handleCloseShift(counted, notes)}
      />

      {/* Holding asks for a name, because "الفاتورة" is not what a cashier calls
          the customer standing at the counter. */}
      <Dialog
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title={messages.pos.holdTitle}
        description={messages.pos.holdHint}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setHoldOpen(false)}>
              {messages.common.cancel}
            </Button>
            <Button variant="primary" onClick={() => void handleHold()}>
              {messages.pos.holdConfirm}
            </Button>
          </>
        }
      >
        <Field label={messages.pos.holdLabel} htmlFor="pos-hold-label">
          <TextInput
            id="pos-hold-label"
            value={holdLabel}
            onChange={(event) => setHoldLabel(event.target.value)}
            placeholder={messages.pos.holdPlaceholder}
            maxLength={80}
            autoFocus
          />
        </Field>
      </Dialog>

      <Dialog
        open={pendingResumeId !== null}
        onClose={() => setPendingResumeId(null)}
        title={messages.pos.resumeAndReplace}
        description={messages.pos.resumeAndReplaceBody}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingResumeId(null)}>
              {messages.common.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const id = pendingResumeId
                if (id !== null) void resumeHeld(id)
              }}
            >
              {messages.pos.resume}
            </Button>
          </>
        }
      />

      <Dialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title={messages.pos.clearCartTitle}
        description={messages.pos.clearCartBody}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setClearOpen(false)}>
              {messages.common.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setCart(emptyCart)
                setSelectedId(null)
                setClearOpen(false)
              }}
            >
              {messages.pos.clearCart}
            </Button>
          </>
        }
      />
    </div>
  )
}
