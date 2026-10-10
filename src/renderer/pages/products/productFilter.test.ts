import { describe, expect, it } from 'vitest'
import type { ProductSummary } from '../../../shared/ipc'
import { canEditCost, canEditPrice, canManageCatalog, filterProducts, isLowStock } from './productFilter'

function product(overrides: Partial<ProductSummary> & { id: string; name: string }): ProductSummary {
  return {
    categoryId: null,
    sku: null,
    barcodes: [],
    units: [],
    onHandQty: 0,
    onHandValuePiasters: 0,
    baseUnitName: 'قطعة',
    qtyScale: 0,
    priceUnitQtyBase: 1,
    costPricePiasters: 0,
    sellingPricePiasters: 0,
    taxRateBps: 0,
    trackExpiry: false,
    isWeighted: false,
    lowStockThresholdQty: 0,
    metadata: null,
    deletedAt: null,
    createdAt: 0,
    updatedAt: 0,
    deviceId: 'device',
    ...overrides,
  }
}

describe('filterProducts', () => {
  const catalog = [
    product({ id: 'a', name: 'جبنة بيضاء', sku: 'CH-01', barcodes: ['6221001000012'], categoryId: 'dairy' }),
    product({ id: 'b', name: 'سكر', sku: 'SG-5', barcodes: [], categoryId: null }),
  ]

  it('returns everything on an empty query', () => {
    expect(filterProducts(catalog, '', null).map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('matches an Arabic name fragment', () => {
    expect(filterProducts(catalog, 'جبنة', null).map((item) => item.id)).toEqual(['a'])
  })

  it('matches a SKU regardless of case', () => {
    expect(filterProducts(catalog, 'sg-5', null).map((item) => item.id)).toEqual(['b'])
  })

  it('matches a barcode typed with Arabic-Indic digits', () => {
    expect(filterProducts(catalog, '٦٢٢١٠٠١', null).map((item) => item.id)).toEqual(['a'])
  })

  it('filters by category while still searching', () => {
    expect(filterProducts(catalog, '', 'dairy').map((item) => item.id)).toEqual(['a'])
    expect(filterProducts(catalog, 'سكر', 'dairy')).toEqual([])
  })
})

describe('catalog permissions', () => {
  it('lets owners and managers manage the catalog, but not cashiers', () => {
    expect(canManageCatalog('owner')).toBe(true)
    expect(canManageCatalog('manager')).toBe(true)
    expect(canManageCatalog('cashier')).toBe(false)
  })

  it('gates price and cost edits on their permission codes', () => {
    expect(canEditPrice(['product.price_change'])).toBe(true)
    expect(canEditPrice([])).toBe(false)
    expect(canEditCost(['product.cost_change'])).toBe(true)
    expect(canEditCost([])).toBe(false)
  })
})

describe('isLowStock', () => {
  it('warns only when a positive threshold is reached', () => {
    expect(isLowStock(5, 10)).toBe(true)
    expect(isLowStock(10, 10)).toBe(true)
    expect(isLowStock(11, 10)).toBe(false)
    expect(isLowStock(0, 10)).toBe(false)
    expect(isLowStock(0, 0)).toBe(false)
  })
})
