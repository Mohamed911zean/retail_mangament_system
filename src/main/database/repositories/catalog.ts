import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { BarcodeRow, CategoryRow, ProductRow, ProductUnitRow } from '../rows'

export function getCategory(database: DatabaseHandle, id: string): CategoryRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM categories WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<CategoryRow>(row)
}

export function listCategories(database: DatabaseHandle): CategoryRow[] {
  return mapRows<CategoryRow>(execute(() => database.prepare('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name').all()) as Record<string, unknown>[])
}

export function insertCategory(database: DatabaseHandle, row: Partial<CategoryRow>): void {
  execute(() => database.prepare(`
    INSERT INTO categories (id,name,sort_order,deleted_at,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?)
  `).run(row.id, row.name, row.sortOrder ?? 0, row.deletedAt ?? null, row.createdAt, row.updatedAt, row.deviceId))
}

export function updateCategory(database: DatabaseHandle, id: string, name: string, sortOrder: number, updatedAt: number): void {
  execute(() => database.prepare('UPDATE categories SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(name, sortOrder, updatedAt, id))
}

export function softDeleteCategory(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}

export function getProduct(database: DatabaseHandle, id: string): ProductRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM products WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<ProductRow>(row)
}

export function getProductBySku(database: DatabaseHandle, sku: string): ProductRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM products WHERE sku = ? AND deleted_at IS NULL').get(sku)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<ProductRow>(row)
}

export function listProducts(database: DatabaseHandle): ProductRow[] {
  return mapRows<ProductRow>(execute(() => database.prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name').all()) as Record<string, unknown>[])
}

export function insertProduct(database: DatabaseHandle, row: Partial<ProductRow>): void {
  execute(() => database.prepare(`
    INSERT INTO products (id,sku,name,category_id,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,
      selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,low_stock_threshold_qty,metadata,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.sku ?? null, row.name, row.categoryId ?? null, row.baseUnitName, row.qtyScale ?? 0,
    row.priceUnitQtyBase ?? 1, row.costPricePiasters ?? 0, row.sellingPricePiasters ?? 0,
    row.taxRateBps ?? 0, row.trackExpiry ? 1 : 0, row.isWeighted ? 1 : 0,
    row.lowStockThresholdQty ?? 0, row.metadata ?? null, row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function updateProduct(database: DatabaseHandle, id: string, fields: Partial<Pick<ProductRow, 'name' | 'categoryId' | 'sku' | 'baseUnitName' | 'qtyScale' | 'priceUnitQtyBase' | 'sellingPricePiasters' | 'costPricePiasters' | 'taxRateBps' | 'trackExpiry' | 'isWeighted' | 'lowStockThresholdQty' | 'metadata' | 'updatedAt'>>): void {
  const current = getProduct(database, id)
  if (current === undefined) return
  const name = fields.name ?? current.name
  const categoryId = fields.categoryId !== undefined ? fields.categoryId : current.categoryId
  const sku = fields.sku !== undefined ? fields.sku : current.sku
  const baseUnitName = fields.baseUnitName ?? current.baseUnitName
  const qtyScale = fields.qtyScale ?? current.qtyScale
  const priceUnitQtyBase = fields.priceUnitQtyBase ?? current.priceUnitQtyBase
  const sellingPricePiasters = fields.sellingPricePiasters ?? current.sellingPricePiasters
  const costPricePiasters = fields.costPricePiasters ?? current.costPricePiasters
  const taxRateBps = fields.taxRateBps ?? current.taxRateBps
  const trackExpiry = fields.trackExpiry ?? current.trackExpiry
  const isWeighted = fields.isWeighted ?? current.isWeighted
  const lowStockThresholdQty = fields.lowStockThresholdQty ?? current.lowStockThresholdQty
  const metadata = fields.metadata !== undefined ? fields.metadata : current.metadata
  const updatedAt = fields.updatedAt ?? Date.now()
  execute(() => database.prepare(`
    UPDATE products
    SET name = ?, category_id = ?, sku = ?, base_unit_name = ?, qty_scale = ?, price_unit_qty_base = ?,
        selling_price_piasters = ?, cost_price_piasters = ?, tax_rate_bps = ?, track_expiry = ?,
        is_weighted = ?, low_stock_threshold_qty = ?, metadata = ?, updated_at = ?
    WHERE id = ?
  `).run(name, categoryId, sku, baseUnitName, qtyScale, priceUnitQtyBase, sellingPricePiasters, costPricePiasters, taxRateBps, trackExpiry ? 1 : 0, isWeighted ? 1 : 0, lowStockThresholdQty, metadata, updatedAt, id))
}

export function softDeleteProduct(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE products SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}

export function insertProductUnit(database: DatabaseHandle, row: Partial<ProductUnitRow>): void {
  execute(() => database.prepare(`
    INSERT INTO product_units (id,product_id,unit_name,base_qty_per_unit,selling_price_piasters,deleted_at,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(row.id, row.productId, row.unitName, row.baseQtyPerUnit, row.sellingPricePiasters, row.deletedAt ?? null, row.createdAt, row.updatedAt, row.deviceId))
}

export function listProductUnits(database: DatabaseHandle, productId: string): ProductUnitRow[] {
  return mapRows<ProductUnitRow>(execute(() => database.prepare('SELECT * FROM product_units WHERE product_id = ? AND deleted_at IS NULL ORDER BY unit_name').all(productId)) as Record<string, unknown>[])
}

export function softDeleteProductUnit(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE product_units SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}

export function insertBarcode(database: DatabaseHandle, row: Partial<BarcodeRow>): void {
  execute(() => database.prepare(`
    INSERT INTO barcodes (id,barcode,product_id,product_unit_id,is_primary,deleted_at,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(row.id, row.barcode, row.productId, row.productUnitId ?? null, row.isPrimary ? 1 : 0, row.deletedAt ?? null, row.createdAt, row.updatedAt, row.deviceId))
}

export function listBarcodes(database: DatabaseHandle, productId: string): BarcodeRow[] {
  return mapRows<BarcodeRow>(execute(() => database.prepare('SELECT * FROM barcodes WHERE product_id = ? AND deleted_at IS NULL ORDER BY barcode').all(productId)) as Record<string, unknown>[])
}

export function getBarcode(database: DatabaseHandle, barcode: string): BarcodeRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM barcodes WHERE barcode = ? AND deleted_at IS NULL').get(barcode)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<BarcodeRow>(row)
}

export function softDeleteBarcode(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE barcodes SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}
