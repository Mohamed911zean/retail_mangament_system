import { describe, expect, it } from 'vitest'
import type { ProductSummary } from '../../../shared/ipc'
import { filterProducts, findExactBarcode, matchesProduct, normalizeQuery } from './search'

function product(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id: 'p1',
    name: 'بطاطس',
    sku: null,
    categoryId: null,
    baseUnitName: 'كجم',
    qtyScale: 3,
    priceUnitQtyBase: 1000,
    costPricePiasters: 1000,
    sellingPricePiasters: 1500,
    taxRateBps: 0,
    trackExpiry: false,
    isWeighted: true,
    lowStockThresholdQty: 0,
    metadata: null,
    deletedAt: null,
    createdAt: 0,
    updatedAt: 0,
    deviceId: 'dev',
    onHandQty: 5000,
    onHandValuePiasters: 5000,
    units: [],
    barcodes: [],
    ...overrides,
  }
}

describe('normalizeQuery', () => {
  it('folds Arabic-Indic digits and trims', () => {
    expect(normalizeQuery('  ١٢٣  ')).toBe('123')
    expect(normalizeQuery('BATATIS')).toBe('batatis')
  })
})

describe('matchesProduct', () => {
  it('matches everything on an empty query', () => {
    expect(matchesProduct(product(), '')).toBe(true)
  })

  it('matches a part of the name, case-insensitively', () => {
    expect(matchesProduct(product({ name: 'Cheese Box' }), 'cheese')).toBe(true)
    expect(matchesProduct(product({ name: 'Cheese Box' }), 'rice')).toBe(false)
  })

  it('matches a barcode typed with Arabic-Indic digits', () => {
    const cheese = product({ name: 'جبنة', barcodes: ['6221031'] })
    // The scanner-ahead case: the code is still arriving.
    expect(matchesProduct(cheese, '622')).toBe(true)
    expect(matchesProduct(cheese, '٦٢٢')).toBe(true)
  })

  it('matches the SKU', () => {
    expect(matchesProduct(product({ sku: 'P-100' }), 'p-10')).toBe(true)
  })
})

describe('filterProducts', () => {
  it('reports when it stopped early', () => {
    const many = Array.from({ length: 5 }, (_, index) => product({ id: `p${index}`, name: `صنف ${index}` }))
    expect(filterProducts(many, '', 3)).toEqual({ items: many.slice(0, 3), truncated: true })
    expect(filterProducts(many, '', 5).truncated).toBe(false)
    expect(filterProducts(many, '', 9).truncated).toBe(false)
  })
})

describe('findExactBarcode', () => {
  const cheese = product({ id: 'cheese', name: 'جبنة', sku: 'CH-1', barcodes: ['6221031', '6229999'] })
  const list = [product(), cheese]

  it('finds a product by a complete barcode', () => {
    expect(findExactBarcode(list, '6229999')?.id).toBe('cheese')
  })

  it('finds a product by SKU, case-insensitively', () => {
    expect(findExactBarcode(list, 'ch-1')?.id).toBe('cheese')
  })

  it('does not match a prefix, so pressing Enter on a name adds nothing', () => {
    expect(findExactBarcode(list, '622')).toBeUndefined()
    expect(findExactBarcode(list, 'جبنة')).toBeUndefined()
  })

  it('finds nothing for a blank code', () => {
    expect(findExactBarcode(list, '   ')).toBeUndefined()
  })
})
