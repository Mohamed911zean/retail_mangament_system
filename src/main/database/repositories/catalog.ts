import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { BarcodeRow, CategoryRow, ProductRow, ProductUnitRow } from '../rows'

export function getCategory(database: DatabaseHandle, id: string): CategoryRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM categories WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<CategoryRow>(row)
}
export function insertCategory(database: DatabaseHandle, row: Partial<CategoryRow>): void {
  execute(() => database.prepare('INSERT INTO categories (id,name,sort_order,deleted_at,created_at,updated_at,device_id) VALUES (@id,@name,@sort_order,@deleted_at,@created_at,@updated_at,@device_id)').run(row))
}
export function getProduct(database: DatabaseHandle, id: string): ProductRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM products WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<ProductRow>(row)
}
export function listProducts(database: DatabaseHandle): ProductRow[] {
  return mapRows<ProductRow>(execute(() => database.prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name').all()) as Record<string, unknown>[])
}
export function insertProduct(database: DatabaseHandle, row: Partial<ProductRow>): void {
  execute(() => database.prepare(`
    INSERT INTO products (id,sku,name,category_id,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,
      selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,low_stock_threshold_qty,metadata,created_at,updated_at,device_id)
    VALUES (@id,@sku,@name,@category_id,@base_unit_name,@qty_scale,@price_unit_qty_base,@cost_price_piasters,
      @selling_price_piasters,@tax_rate_bps,@track_expiry,@is_weighted,@low_stock_threshold_qty,@metadata,@created_at,@updated_at,@device_id)
  `).run(row))
}
export function updateProduct(database: DatabaseHandle, id: string, fields: Pick<ProductRow, 'name' | 'sellingPricePiasters' | 'costPricePiasters' | 'updatedAt'>): void {
  execute(() => database.prepare('UPDATE products SET name = ?, selling_price_piasters = ?, cost_price_piasters = ?, updated_at = ? WHERE id = ?').run(fields.name, fields.sellingPricePiasters, fields.costPricePiasters, fields.updatedAt, id))
}
export function softDeleteProduct(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE products SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}
export function updateCategory(database: DatabaseHandle, id: string, name: string, sortOrder: number, updatedAt: number): void {
  execute(() => database.prepare('UPDATE categories SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(name, sortOrder, updatedAt, id))
}
export function softDeleteCategory(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}
export function insertProductUnit(database: DatabaseHandle, row: Partial<ProductUnitRow>): void {
  execute(() => database.prepare('INSERT INTO product_units (id,product_id,unit_name,base_qty_per_unit,selling_price_piasters,deleted_at,created_at,updated_at,device_id) VALUES (@id,@product_id,@unit_name,@base_qty_per_unit,@selling_price_piasters,@deleted_at,@created_at,@updated_at,@device_id)').run(row))
}
export function insertBarcode(database: DatabaseHandle, row: Partial<BarcodeRow>): void {
  execute(() => database.prepare('INSERT INTO barcodes (id,barcode,product_id,product_unit_id,is_primary,deleted_at,created_at,updated_at,device_id) VALUES (@id,@barcode,@product_id,@product_unit_id,@is_primary,@deleted_at,@created_at,@updated_at,@device_id)').run(row))
}
export function listProductUnits(database: DatabaseHandle, productId: string): ProductUnitRow[] {
  return mapRows<ProductUnitRow>(execute(() => database.prepare('SELECT * FROM product_units WHERE product_id = ? ORDER BY unit_name').all(productId)) as Record<string, unknown>[])
}
export function listBarcodes(database: DatabaseHandle, productId: string): BarcodeRow[] {
  return mapRows<BarcodeRow>(execute(() => database.prepare('SELECT * FROM barcodes WHERE product_id = ? ORDER BY barcode').all(productId)) as Record<string, unknown>[])
}
