import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { SaleReturnItemRow, SaleReturnRow } from '../rows'

export function getSaleReturn(database: DatabaseHandle, id: string): SaleReturnRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM sale_returns WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<SaleReturnRow>(row)
}

export function listSaleReturns(database: DatabaseHandle, customerId?: string): SaleReturnRow[] {
  const rows = customerId === undefined
    ? execute(() => database.prepare('SELECT * FROM sale_returns ORDER BY created_at,id').all())
    : execute(() => database.prepare('SELECT * FROM sale_returns WHERE customer_id = ? ORDER BY created_at,id').all(customerId))
  return mapRows<SaleReturnRow>(rows as Record<string, unknown>[])
}

export function listSaleReturnsBySale(database: DatabaseHandle, saleId: string): SaleReturnRow[] {
  const rows = execute(() => database.prepare('SELECT * FROM sale_returns WHERE original_sale_id = ? ORDER BY created_at,id').all(saleId))
  return mapRows<SaleReturnRow>(rows as Record<string, unknown>[])
}

export function insertSaleReturn(database: DatabaseHandle, row: Partial<SaleReturnRow>): void {
  execute(() => database.prepare(`
    INSERT INTO sale_returns (id,return_number,original_sale_id,customer_id,user_id,shift_id,total_piasters,cash_refunded_piasters,credited_to_account_piasters,status,reason,voided_at,voided_by_user_id,void_reason,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.returnNumber, row.originalSaleId, row.customerId ?? null, row.userId,
    row.shiftId ?? null, row.totalPiasters, row.cashRefundedPiasters ?? 0,
    row.creditedToAccountPiasters ?? 0, row.status ?? 'completed', row.reason ?? null,
    row.voidedAt ?? null, row.voidedByUserId ?? null, row.voidReason ?? null,
    row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function listSaleReturnItems(database: DatabaseHandle, saleReturnId: string): SaleReturnItemRow[] {
  return mapRows<SaleReturnItemRow>(execute(() => database.prepare('SELECT * FROM sale_return_items WHERE sale_return_id = ? ORDER BY id').all(saleReturnId)) as Record<string, unknown>[])
}

export function insertSaleReturnItem(database: DatabaseHandle, row: Partial<SaleReturnItemRow>): void {
  execute(() => database.prepare(`
    INSERT INTO sale_return_items (id,sale_return_id,sale_item_id,product_id,qty_base,refund_piasters,condition,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.saleReturnId, row.saleItemId, row.productId, row.qtyBase,
    row.refundPiasters, row.condition, row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function updateSaleReturnVoidMetadata(database: DatabaseHandle, id: string, updatedAt: number, voidedAt: number, voidedByUserId: string, voidReason: string): void {
  execute(() => database.prepare("UPDATE sale_returns SET status = 'voided', updated_at = ?, voided_at = ?, voided_by_user_id = ?, void_reason = ? WHERE id = ?").run(updatedAt, voidedAt, voidedByUserId, voidReason, id))
}
