import { describe, expect, it } from 'vitest'
import type { ProductSummary } from '../../../shared/ipc'
import {
  addProduct,
  cartFromSaleLines,
  cartLineFor,
  cartLineTotals,
  cartTotals,
  displayQtyValue,
  emptyCart,
  qtyBaseFromDisplay,
  removeLine,
  setInvoiceDiscount,
  setLineDiscount,
  setLineQty,
  setLineUnit,
  toSaleLines,
  type Cart,
  type CartLine,
} from './cart'

/**
 * Every number below is hand-checked against the domain functions in
 * `src/domain/` — the same ones the sale service uses. Comments carry the
 * arithmetic so a failure says which step drifted.
 */

const BASE_PRODUCT: ProductSummary = {
  id: 'p1',
  sku: null,
  name: 'شيبسي',
  categoryId: null,
  baseUnitName: 'قطعة',
  qtyScale: 0,
  priceUnitQtyBase: 1,
  costPricePiasters: 100,
  sellingPricePiasters: 150,
  taxRateBps: 0,
  trackExpiry: false,
  isWeighted: false,
  lowStockThresholdQty: 0,
  metadata: null,
  deletedAt: null,
  createdAt: 0,
  updatedAt: 0,
  deviceId: 'dev',
  onHandQty: 0,
  onHandValuePiasters: 0,
  units: [],
  barcodes: [],
}

/** 120 EGP per kg, stored in grams (qtyScale 3, priceUnitQtyBase 1000). */
const WEIGHTED: ProductSummary = {
  ...BASE_PRODUCT,
  id: 'p2',
  name: 'فراخ',
  baseUnitName: 'كجم',
  qtyScale: 3,
  priceUnitQtyBase: 1000,
  sellingPricePiasters: 12000,
  isWeighted: true,
}

/** Same counted product, but sold by the box: 12 pieces for 15 EGP. */
const BOXED: ProductSummary = {
  ...BASE_PRODUCT,
  id: 'p3',
  units: [
    { id: 'u1', productId: 'p3', unitName: 'علبة', baseQtyPerUnit: 12, sellingPricePiasters: 1500, deletedAt: null, createdAt: 0, updatedAt: 0, deviceId: 'dev' },
  ],
}

const NO_TAX = { taxEnabled: false, cashRoundingStep: 0 }
const lineOf = (cart: Cart): CartLine => cart.lines[0]

describe('addProduct', () => {
  it('merges a repeated product into one line', () => {
    const once = addProduct(emptyCart, BASE_PRODUCT, -1, 3)
    const twice = addProduct(once, BASE_PRODUCT, -1, 2)
    expect(twice.lines).toHaveLength(1)
    expect(lineOf(twice).qtyBase).toBe(5)
  })

  it('keeps the base unit and a box unit of the same product apart', () => {
    const byPiece = addProduct(emptyCart, BOXED, -1, 1)
    const byBox = addProduct(byPiece, BOXED, 0, 12)
    expect(byBox.lines.map((line) => line.unitName)).toEqual(['قطعة', 'علبة'])
    // A box is priced per box, so 12 pieces cost 1500, not 12 × 150.
    expect(byBox.lines[1].unitPricePiasters).toBe(1500)
    expect(byBox.lines[1].pricedUnitQtyBase).toBe(12)
  })
})

describe('quantity scales', () => {
  it('shows grams as thousandths of a kilogram for a weighted line', () => {
    const line = lineOf(addProduct(emptyCart, WEIGHTED, -1, 1500))
    // 1500 g ÷ 1000 = 1.5 kg; the field renders 1500 at scale 3 as "1.5".
    expect(displayQtyValue(line)).toBe(1500)
    expect(qtyBaseFromDisplay(line, 1500)).toBe(1500)
  })

  it('counts boxes, not pieces', () => {
    const line = lineOf(addProduct(emptyCart, BOXED, 0, 24))
    // 24 pieces ÷ 12 per box = 2 boxes.
    expect(displayQtyValue(line)).toBe(2)
    expect(qtyBaseFromDisplay(line, 2)).toBe(24)
    expect(qtyBaseFromDisplay(line, 0)).toBeNull()
  })

  it('rejects a quantity that is not a whole number of display units', () => {
    const line = lineOf(addProduct(emptyCart, BASE_PRODUCT, -1, 1))
    // The base unit of a counted product is whole pieces.
    expect(qtyBaseFromDisplay(line, 3)).toBe(3)
    expect(qtyBaseFromDisplay(line, -1)).toBeNull()
    expect(qtyBaseFromDisplay(line, 1.5)).toBeNull()
  })
})

describe('cartTotals', () => {
  it('is null for an empty cart, so the screen shows an empty state', () => {
    expect(cartTotals(emptyCart, NO_TAX)).toBeNull()
  })

  it('multiplies price by quantity: 3 × 150 = 450', () => {
    const cart = addProduct(emptyCart, BASE_PRODUCT, -1, 3)
    const totals = cartTotals(cart, NO_TAX)
    expect(totals?.subtotal).toBe(450)
    expect(totals?.total).toBe(450)
  })

  it('subtracts a fixed line discount: 450 - 50 = 400', () => {
    const added = addProduct(emptyCart, BASE_PRODUCT, -1, 3)
    const cart = setLineDiscount(added, lineOf(added).id, { kind: 'fixed', amountPiasters: 50 })
    const totals = cartTotals(cart, NO_TAX)
    expect(totals?.lineDiscount).toBe(50)
    expect(totals?.total).toBe(400)
  })

  it('applies a percentage line discount: 10% of 450 = 45', () => {
    const added = addProduct(emptyCart, BASE_PRODUCT, -1, 3)
    // 1000 basis points = 10%; round(450 × 1000 / 10000) = 45.
    const cart = setLineDiscount(added, lineOf(added).id, { kind: 'percent', basisPoints: 1000 })
    const totals = cartTotals(cart, NO_TAX)
    expect(totals?.lineDiscount).toBe(45)
    expect(totals?.total).toBe(405)
  })

  it('splits an invoice discount across lines in proportion to their value', () => {
    const added = addProduct(emptyCart, BASE_PRODUCT, -1, 3)
    const second = addProduct(added, BOXED, -1, 2)
    // Line A: 3 × 150 = 450. Line B: 2 × 150 = 300. Base 750.
    // 20% of 750 = 150, allocated 450/750 → 90 and 300/750 → 60.
    const cart = setInvoiceDiscount(second, { kind: 'percent', basisPoints: 2000 })
    const totals = cartTotals(cart, NO_TAX)
    expect(totals?.invoiceDiscount).toBe(150)
    expect(totals?.total).toBe(600)
  })

  it('rounds the payable total to the shop step and reports the adjustment', () => {
    const cart = addProduct(emptyCart, { ...BASE_PRODUCT, sellingPricePiasters: 617 }, -1, 2)
    // 2 × 617 = 1234; 1234 / 25 = 49.36 → 49 → 1225, adjustment 1225 - 1234 = -9.
    const totals = cartTotals(cart, { taxEnabled: false, cashRoundingStep: 25 })
    expect(totals?.preRoundTotal).toBe(1234)
    expect(totals?.total).toBe(1225)
    expect(totals?.roundingAdjustment).toBe(-9)
  })

  it('takes tax out of the line total, it does not add it', () => {
    const added = addProduct(emptyCart, { ...BASE_PRODUCT, taxRateBps: 1500 }, -1, 1)
    const cart = setLineQty(added, lineOf(added).id, 1)
    // Price 150 is the shelf price, so a 15% rate means net = 130.43 → 130,
    // tax = 20, and the customer still pays 150 (tax-inclusive pricing).
    const totals = cartTotals(cart, { taxEnabled: true, cashRoundingStep: 0 })
    expect(totals?.total).toBe(150)
    expect(totals?.tax).toBe(20)
  })

  it('reports per-line money in the same order as the lines', () => {
    const added = addProduct(emptyCart, BASE_PRODUCT, -1, 3)
    const cart = addProduct(added, BOXED, 0, 24)
    const views = cartLineTotals(cart, NO_TAX)
    expect(views[0]?.totalPiasters).toBe(450)
    // 24 pieces ÷ 12 per box = 2 boxes × 1500 = 3000.
    expect(views[1]?.totalPiasters).toBe(3000)
  })
})

describe('discount bookkeeping', () => {
  it('removes the key instead of storing undefined', () => {
    const added = addProduct(emptyCart, BASE_PRODUCT, -1, 1)
    const withDiscount = setLineDiscount(added, lineOf(added).id, { kind: 'fixed', amountPiasters: 10 })
    const cleared = setLineDiscount(withDiscount, lineOf(added).id, undefined)
    expect('lineDiscount' in lineOf(cleared)).toBe(false)

    const withInvoice = setInvoiceDiscount(cleared, { kind: 'fixed', amountPiasters: 10 })
    const clearedInvoice = setInvoiceDiscount(withInvoice, undefined)
    expect('invoiceDiscount' in clearedInvoice).toBe(false)
  })

  it('ignores a quantity of zero or a fraction of a cent', () => {
    const cart = addProduct(emptyCart, BASE_PRODUCT, -1, 1)
    const id = lineOf(cart).id
    expect(lineOf(setLineQty(cart, id, 0)).qtyBase).toBe(1)
    expect(lineOf(setLineQty(cart, id, 2.5)).qtyBase).toBe(1)
  })
})

describe('units', () => {
  it('resets the quantity to one of the new unit rather than converting it', () => {
    const added = addProduct(emptyCart, BOXED, -1, 3)
    const switched = setLineUnit(added, lineOf(added).id, BOXED, 0)
    // One box = 12 pieces, not 3 pieces re-expressed as 0.25 of a box.
    expect(lineOf(switched).qtyBase).toBe(12)
    expect(lineOf(switched).unitPricePiasters).toBe(1500)
    expect(lineOf(switched).displayScale).toBe(0)
  })
})

describe('IPC payload', () => {
  it('maps a line to the shape sales:complete validates', () => {
    const added = addProduct(emptyCart, BASE_PRODUCT, -1, 2)
    const cart = setLineDiscount(added, lineOf(added).id, { kind: 'percent', basisPoints: 500 })
    expect(toSaleLines(cart)).toEqual([
      {
        productId: 'p1',
        unitNameSnapshot: 'قطعة',
        pricedUnitQtyBase: 1,
        qtyBase: 2,
        unitPricePiasters: 150,
        lineDiscount: { kind: 'percent', basisPoints: 500 },
      },
    ])
  })

  it('rebuilds a cart from a recalled hold without the line discount key leaking', () => {
    const cart = cartFromSaleLines(
      [
        { productId: 'p1', unitNameSnapshot: 'قطعة', pricedUnitQtyBase: 1, qtyBase: 2, unitPricePiasters: 150 },
        { productId: 'p1', unitNameSnapshot: 'قطعة', pricedUnitQtyBase: 1, qtyBase: 1, unitPricePiasters: 150 },
        { productId: 'p2', unitNameSnapshot: 'كجم', pricedUnitQtyBase: 1000, qtyBase: 1500, unitPricePiasters: 12000 },
      ],
      [BASE_PRODUCT, WEIGHTED],
    )
    expect(cart.lines).toHaveLength(2)
    expect(cart.lines[0].qtyBase).toBe(3)
    expect('lineDiscount' in cart.lines[0]).toBe(false)
    // The tax rate is not part of the held payload: it comes from the product.
    expect(cart.lines[1].displayScale).toBe(3)
    expect(cart.lines[1].taxRateBps).toBe(WEIGHTED.taxRateBps)
  })

  it('drops lines whose product no longer exists', () => {
    const cart = cartFromSaleLines(
      [{ productId: 'gone', unitNameSnapshot: 'قطعة', pricedUnitQtyBase: 1, qtyBase: 1, unitPricePiasters: 100 }],
      [BASE_PRODUCT],
    )
    expect(cart.lines).toHaveLength(0)
  })
})

describe('removeLine', () => {
  it('drops only the named line', () => {
    const added = addProduct(emptyCart, BASE_PRODUCT, -1, 1)
    const both = addProduct(added, WEIGHTED, -1, 1000)
    const cart = removeLine(both, cartLineFor(BASE_PRODUCT, -1, 1).id)
    expect(cart.lines.map((line) => line.productId)).toEqual(['p2'])
  })
})
