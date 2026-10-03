import { execute, mapRows, type DatabaseHandle } from './common'
export function listPurchases(database: DatabaseHandle, supplierId?: string): Record<string, unknown>[] {
  const rows = supplierId === undefined
    ? execute(() => database.prepare('SELECT * FROM purchases ORDER BY created_at,id').all())
    : execute(() => database.prepare('SELECT * FROM purchases WHERE supplier_id = ? ORDER BY created_at,id').all(supplierId))
  return mapRows(rows as Record<string, unknown>[])
}
export function insertPurchase(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO purchases (id,purchase_number,supplier_id,user_id,total_piasters,paid_piasters,due_piasters,payment_status,status,created_at,updated_at,device_id) VALUES (@id,@purchase_number,@supplier_id,@user_id,@total_piasters,@paid_piasters,@due_piasters,@payment_status,@status,@created_at,@updated_at,@device_id)').run(row))
}
export function listPurchaseItems(database: DatabaseHandle, purchaseId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id').all(purchaseId)) as Record<string, unknown>[])
}
export function insertPurchaseItem(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO purchase_items (id,purchase_id,product_id,unit_name_snapshot,priced_unit_qty_base,qty_base,unit_cost_piasters,line_subtotal_piasters,tax_rate_bps_snapshot,tax_piasters,line_total_piasters,batch_code_snapshot,expiry_at_snapshot,created_at,updated_at,device_id) VALUES (@id,@purchase_id,@product_id,@unit_name_snapshot,@priced_unit_qty_base,@qty_base,@unit_cost_piasters,@line_subtotal_piasters,@tax_rate_bps_snapshot,@tax_piasters,@line_total_piasters,@batch_code_snapshot,@expiry_at_snapshot,@created_at,@updated_at,@device_id)').run(row))
}
