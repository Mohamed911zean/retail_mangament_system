import { execute, mapRows, type DatabaseHandle } from './common'
import type { SaleReturnItemRow, SaleReturnRow } from '../rows'
export function listSaleReturns(database: DatabaseHandle, customerId?: string): SaleReturnRow[] {
  const rows = customerId === undefined
    ? execute(() => database.prepare('SELECT * FROM sale_returns ORDER BY created_at,id').all())
    : execute(() => database.prepare('SELECT * FROM sale_returns WHERE customer_id = ? ORDER BY created_at,id').all(customerId))
  return mapRows<SaleReturnRow>(rows as Record<string, unknown>[])
}
export function insertSaleReturn(database: DatabaseHandle, row: Partial<SaleReturnRow>): void {
  execute(() => database.prepare('INSERT INTO sale_returns (id,return_number,original_sale_id,customer_id,user_id,shift_id,total_piasters,cash_refunded_piasters,credited_to_account_piasters,status,created_at,updated_at,device_id) VALUES (@id,@return_number,@original_sale_id,@customer_id,@user_id,@shift_id,@total_piasters,@cash_refunded_piasters,@credited_to_account_piasters,@status,@created_at,@updated_at,@device_id)').run(row))
}
export function listSaleReturnItems(database: DatabaseHandle, saleReturnId: string): SaleReturnItemRow[] {
  return mapRows<SaleReturnItemRow>(execute(() => database.prepare('SELECT * FROM sale_return_items WHERE sale_return_id = ? ORDER BY id').all(saleReturnId)) as Record<string, unknown>[])
}
export function insertSaleReturnItem(database: DatabaseHandle, row: Partial<SaleReturnItemRow>): void {
  execute(() => database.prepare('INSERT INTO sale_return_items (id,sale_return_id,sale_item_id,product_id,qty_base,refund_piasters,condition,created_at,updated_at,device_id) VALUES (@id,@sale_return_id,@sale_item_id,@product_id,@qty_base,@refund_piasters,@condition,@created_at,@updated_at,@device_id)').run(row))
}
export function updateSaleReturnVoidMetadata(database: DatabaseHandle, id: string, updatedAt: number, voidedAt: number, voidedByUserId: string, voidReason: string): void {
  execute(() => database.prepare("UPDATE sale_returns SET status = 'voided', updated_at = ?, voided_at = ?, voided_by_user_id = ?, void_reason = ? WHERE id = ?").run(updatedAt, voidedAt, voidedByUserId, voidReason, id))
}
