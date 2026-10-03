import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
export function getSale(database: DatabaseHandle, id: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare('SELECT * FROM sales WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function listSales(database: DatabaseHandle): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM sales ORDER BY created_at,id').all()) as Record<string, unknown>[])
}
export function insertSale(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO sales (id,invoice_number,customer_id,user_id,shift_id,subtotal_piasters,line_discount_piasters,invoice_discount_piasters,tax_piasters,rounding_adjustment_piasters,total_piasters,paid_piasters,due_piasters,payment_status,status,created_at,updated_at,device_id) VALUES (@id,@invoice_number,@customer_id,@user_id,@shift_id,@subtotal_piasters,@line_discount_piasters,@invoice_discount_piasters,@tax_piasters,@rounding_adjustment_piasters,@total_piasters,@paid_piasters,@due_piasters,@payment_status,@status,@created_at,@updated_at,@device_id)').run(row))
}
export function listSaleItems(database: DatabaseHandle, saleId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(saleId)) as Record<string, unknown>[])
}
export function insertSaleItem(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO sale_items (id,sale_id,product_id,unit_name_snapshot,priced_unit_qty_base,qty_base,unit_price_piasters,line_subtotal_piasters,line_discount_piasters,invoice_discount_allocated_piasters,tax_rate_bps_snapshot,tax_piasters,final_line_total_piasters,line_cost_piasters,product_name_snapshot,created_at,updated_at,device_id) VALUES (@id,@sale_id,@product_id,@unit_name_snapshot,@priced_unit_qty_base,@qty_base,@unit_price_piasters,@line_subtotal_piasters,@line_discount_piasters,@invoice_discount_allocated_piasters,@tax_rate_bps_snapshot,@tax_piasters,@final_line_total_piasters,@line_cost_piasters,@product_name_snapshot,@created_at,@updated_at,@device_id)').run(row))
}
