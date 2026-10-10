/**
 * The invoice table of the selling screen (design system §4.5).
 *
 * It renders and collects; it never computes. Every amount it shows arrives from
 * the page, which gets it from the same domain functions the sale service uses —
 * a cart that did its own arithmetic would eventually disagree with the invoice
 * it just printed.
 *
 * The quantity cell is the one subtle part: the cart stores quantities in the
 * product's base unit (grams, pieces) while the cashier types in the line's
 * display unit (1.5 kg, 2 boxes). `displayQtyValue` and `qtyBaseFromDisplay` in
 * `cart.ts` are the only sanctioned way between the two.
 */
import { Badge, EmptyState, IconButton, MoneyInput, QtyInput, Select, TD, TH, THead, TRow, Table, TableEmpty } from '../../components/ui'
import { TrashIcon } from '../../components/icons'
import { messages } from '../../i18n'
import { formatMoney, formatRatePercent, type DigitStyle } from '../../lib/format'
import type { ProductSummary } from '../../../shared/ipc'
import { displayQtyValue, qtyBaseFromDisplay, type CartLine, type LineAmountView } from './cart'

export type CartTableProps = {
  lines: readonly CartLine[]
  /** Per-line money, in the same order as lines; null when the domain rejected that line. */
  lineTotals: readonly (LineAmountView | null)[]
  productsById: ReadonlyMap<string, ProductSummary>
  selectedId: string | null
  allowNegativeStock: boolean
  digitStyle: DigitStyle
  onSelect: (lineId: string) => void
  onQtyChange: (lineId: string, qtyBase: number) => void
  onPriceChange: (lineId: string, unitPricePiasters: number) => void
  onUnitChange: (lineId: string, product: ProductSummary, unitIndex: number) => void
  onDiscount: (lineId: string) => void
  onRemove: (lineId: string) => void
}

export function CartTable({
  lines,
  lineTotals,
  productsById,
  selectedId,
  allowNegativeStock,
  digitStyle,
  onSelect,
  onQtyChange,
  onPriceChange,
  onUnitChange,
  onDiscount,
  onRemove,
}: CartTableProps) {
  /**
   * Advisory only — the service is the authority and answers insufficient_stock
   * itself. How loudly to warn depends on the shop's setting: with negative stock
   * forbidden the sale will be refused, so the line is an error; where the shop
   * allows it, going below zero is normal and the badge only informs.
   */
  function renderStockWarning(line: CartLine, product: ProductSummary | undefined) {
    if (product === undefined) return null
    if (product.onHandQty <= 0) return <Badge tone="error">{messages.pos.noStock}</Badge>
    if (line.qtyBase > product.onHandQty) {
      return <Badge tone={allowNegativeStock ? 'warning' : 'error'}>{messages.pos.overStock}</Badge>
    }
    return null
  }

  function renderDiscount(line: CartLine) {
    const discount = line.lineDiscount
    if (discount === undefined) return null
    return (
      <Badge tone="info">
        {discount.kind === 'fixed' ? (
          <span className="numeric">{'-' + formatMoney(discount.amountPiasters, digitStyle)}</span>
        ) : (
          <span className="numeric">{formatRatePercent(discount.basisPoints, digitStyle)}</span>
        )}
      </Badge>
    )
  }

  return (
    <Table>
      <THead>
        <TRow>
          <TH>{messages.pos.columnProduct}</TH>
          <TH numeric>{messages.pos.columnQty}</TH>
          <TH numeric>{messages.pos.columnPrice}</TH>
          <TH numeric>{messages.pos.columnTotal}</TH>
          <TH>
            <span className="sr-only">{messages.pos.removeLine}</span>
          </TH>
        </TRow>
      </THead>
      <tbody>
        {lines.length === 0 && (
          <TableEmpty colSpan={5}>
            <EmptyState title={messages.pos.emptyCart} description={messages.pos.emptyCartHint} />
          </TableEmpty>
        )}
        {lines.map((line, index) => {
          const product = productsById.get(line.productId)
          const unitIndex = product === undefined ? -1 : product.units.findIndex((unit) => unit.unitName === line.unitName)
          const unitOptions =
            product === undefined
              ? []
              : [
                  { value: '-1', label: product.baseUnitName },
                  ...product.units.map((unit, indexOfUnit) => ({ value: String(indexOfUnit), label: unit.unitName })),
                ]
          const unitFieldId = 'cart-unit-' + line.id

          return (
            <TRow key={line.id} selected={line.id === selectedId} onClick={() => onSelect(line.id)}>
              <TD>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-strong">{line.productName}</span>
                  {/* A product with extra units gets a picker right here, so switching
                      from a box to a single piece never sends the cashier to another screen. */}
                  {unitOptions.length > 1 && product !== undefined && (
                    <div className="flex items-center gap-1">
                      <label htmlFor={unitFieldId} className="sr-only">
                        {messages.pos.unit}
                      </label>
                      <Select
                        id={unitFieldId}
                        value={String(unitIndex)}
                        options={unitOptions}
                        onChange={(value) => onUnitChange(line.id, product, Number(value))}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    {renderStockWarning(line, product)}
                    {renderDiscount(line)}
                  </div>
                </div>
              </TD>

              <TD numeric>
                <QtyInput
                  value={displayQtyValue(line) ?? 0}
                  qtyScale={line.displayScale}
                  unitName={line.unitName}
                  digitStyle={digitStyle}
                  size="lg"
                  onChange={(units) => {
                    const qtyBase = qtyBaseFromDisplay(line, units)
                    if (qtyBase !== null) onQtyChange(line.id, qtyBase)
                  }}
                />
              </TD>

              <TD numeric>
                <MoneyInput value={line.unitPricePiasters} onChange={(piasters) => onPriceChange(line.id, piasters)} digitStyle={digitStyle} className="min-w-32" />
              </TD>

              <TD numeric>
                <span className="font-semibold">{formatMoney(lineTotals[index]?.totalPiasters ?? 0, digitStyle)}</span>
              </TD>

              <TD>
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDiscount(line.id)
                    }}
                    className="rounded-sm px-2 py-1 text-sm text-brand-700 hover:bg-panel"
                  >
                    {messages.pos.discountTitle}
                  </button>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label={messages.pos.removeLine}
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemove(line.id)
                    }}
                  >
                    <TrashIcon size={16} />
                  </IconButton>
                </div>
              </TD>
            </TRow>
          )
        })}
      </tbody>
    </Table>
  )
}
