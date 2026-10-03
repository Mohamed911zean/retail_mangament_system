import { execute, mapRow, mapRows, type DatabaseHandle } from './common'

export function getCategory(database: DatabaseHandle, id: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare('SELECT * FROM categories WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function getProduct(database: DatabaseHandle, id: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare('SELECT * FROM products WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function listProducts(database: DatabaseHandle): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name').all()) as Record<string, unknown>[])
}
export function insertProduct(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare(`
    INSERT INTO products (id,sku,name,category_id,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,
      selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,low_stock_threshold_qty,metadata,created_at,updated_at,device_id)
    VALUES (@id,@sku,@name,@category_id,@base_unit_name,@qty_scale,@price_unit_qty_base,@cost_price_piasters,
      @selling_price_piasters,@tax_rate_bps,@track_expiry,@is_weighted,@low_stock_threshold_qty,@metadata,@created_at,@updated_at,@device_id)
  `).run(row))
}
export function listProductUnits(database: DatabaseHandle, productId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM product_units WHERE product_id = ? ORDER BY unit_name').all(productId)) as Record<string, unknown>[])
}
export function listBarcodes(database: DatabaseHandle, productId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM barcodes WHERE product_id = ? ORDER BY barcode').all(productId)) as Record<string, unknown>[])
}
