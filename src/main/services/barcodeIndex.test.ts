import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDatabase, closeDatabase, type DatabaseContext } from '../database/database'
import { BarcodeIndex } from './barcodeIndex'
import { insertProduct, insertBarcode, softDeleteBarcode } from '../database/repositories/catalog'

let counter = 0

describe('BarcodeIndex', () => {
  let context: DatabaseContext

  beforeEach(async () => {
    const root = join(tmpdir(), `small-shop-pos-barcode-${Date.now()}-${counter++}`)
    mkdirSync(root, { recursive: true })
    context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
  })

  afterEach(() => {
    closeDatabase(context)
  })

  it('builds the index from database barcodes', () => {
    const now = Date.now()
    insertProduct(context.database, {
      id: 'prod-1',
      name: 'Milk',
      baseUnitName: 'piece',
      qtyScale: 0,
      priceUnitQtyBase: 1,
      costPricePiasters: 1000,
      sellingPricePiasters: 1500,
      createdAt: now,
      updatedAt: now,
      deviceId: 'dev-1',
    })
    insertBarcode(context.database, {
      id: 'b-1',
      barcode: '6223001234562',
      productId: 'prod-1',
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
      deviceId: 'dev-1',
    })

    const index = new BarcodeIndex()
    index.build(context.database)

    expect(index.size()).toBe(1)
    const match = index.get('6223001234562', context.database)
    expect(match).toBeDefined()
    expect(match?.productId).toBe('prod-1')
  })

  it('normalizes Arabic digits when querying', () => {
    const now = Date.now()
    insertProduct(context.database, {
      id: 'prod-2',
      name: 'Bread',
      baseUnitName: 'piece',
      qtyScale: 0,
      priceUnitQtyBase: 1,
      costPricePiasters: 500,
      sellingPricePiasters: 750,
      createdAt: now,
      updatedAt: now,
      deviceId: 'dev-1',
    })
    insertBarcode(context.database, {
      id: 'b-2',
      barcode: '2000123003504',
      productId: 'prod-2',
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
      deviceId: 'dev-1',
    })

    const index = new BarcodeIndex()
    // Arabic-Indic query should match normalized entry
    const match = index.get('٢٠٠٠١٢٣٠٠٣٥٠٤', context.database)
    expect(match).toBeDefined()
    expect(match?.productId).toBe('prod-2')
  })

  it('ignores soft-deleted barcodes', () => {
    const now = Date.now()
    insertProduct(context.database, {
      id: 'prod-3',
      name: 'Juice',
      baseUnitName: 'piece',
      qtyScale: 0,
      priceUnitQtyBase: 1,
      costPricePiasters: 800,
      sellingPricePiasters: 1200,
      createdAt: now,
      updatedAt: now,
      deviceId: 'dev-1',
    })
    insertBarcode(context.database, {
      id: 'b-3',
      barcode: '96385074',
      productId: 'prod-3',
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
      deviceId: 'dev-1',
    })
    softDeleteBarcode(context.database, 'b-3', now + 1)

    const index = new BarcodeIndex()
    index.build(context.database)
    expect(index.get('96385074', context.database)).toBeUndefined()
  })

  it('handles UPC-A and EAN-13 equivalence with leading zero', () => {
    const now = Date.now()
    insertProduct(context.database, {
      id: 'prod-4',
      name: 'Soap',
      baseUnitName: 'piece',
      qtyScale: 0,
      priceUnitQtyBase: 1,
      costPricePiasters: 300,
      sellingPricePiasters: 500,
      createdAt: now,
      updatedAt: now,
      deviceId: 'dev-1',
    })
    // Saved as 13-digit EAN-13 starting with 0
    insertBarcode(context.database, {
      id: 'b-4',
      barcode: '0012345678905',
      productId: 'prod-4',
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
      deviceId: 'dev-1',
    })

    const index = new BarcodeIndex()
    index.build(context.database)

    // Lookup with 12-digit UPC-A should match
    expect(index.get('012345678905', context.database)?.productId).toBe('prod-4')
  })

  it('invalidates and rebuilds automatically when marked dirty', () => {
    const now = Date.now()
    insertProduct(context.database, {
      id: 'prod-5',
      name: 'Tea',
      baseUnitName: 'piece',
      qtyScale: 0,
      priceUnitQtyBase: 1,
      costPricePiasters: 400,
      sellingPricePiasters: 600,
      createdAt: now,
      updatedAt: now,
      deviceId: 'dev-1',
    })

    const index = new BarcodeIndex()
    index.build(context.database)
    expect(index.get('11223344', context.database)).toBeUndefined()

    // Add new barcode in DB
    insertBarcode(context.database, {
      id: 'b-5',
      barcode: '11223344',
      productId: 'prod-5',
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
      deviceId: 'dev-1',
    })

    // Invalidate
    index.invalidate()
    expect(index.isDirty()).toBe(true)

    // Query should auto-rebuild and find it
    const match = index.get('11223344', context.database)
    expect(match?.productId).toBe('prod-5')
    expect(index.isDirty()).toBe(false)
  })
})
