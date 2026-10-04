import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { PurchaseItemRow, PurchaseRow } from '../rows'

export function getPurchase(database: DatabaseHandle, id: string): PurchaseRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM purchases WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<PurchaseRow>(row)
}

export function listPurchases(database: DatabaseHandle, supplierId?: string): PurchaseRow[] {
  const rows = supplierId === undefined
    ? execute(() => database.prepare('SELECT * FROM purchases ORDER BY created_at,id').all())
    : execute(() => database.prepare('SELECT * FROM purchases WHERE supplier_id = ? ORDER BY created_at,id').all(supplierId))
  return mapRows<PurchaseRow>(rows as Record<string, unknown>[])
}

export function insertPurchase(database: DatabaseHandle, row: Partial<PurchaseRow>): void {
  execute(() => database.prepare(`
    INSERT INTO purchases (id,purchase_number,supplier_id,user_id,total_piasters,paid_piasters,due_piasters,payment_status,status,voided_at,voided_by_user_id,void_reason,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.purchaseNumber, row.supplierId ?? null, row.userId, row.totalPiasters ?? 0,
    row.paidPiasters ?? 0, row.duePiasters ?? 0, row.paymentStatus, row.status ?? 'completed',
    row.voidedAt ?? null, row.voidedByUserId ?? null, row.voidReason ?? null,
    row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function listPurchaseItems(database: DatabaseHandle, purchaseId: string): PurchaseItemRow[] {
  return mapRows<PurchaseItemRow>(execute(() => database.prepare('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id').all(purchaseId)) as Record<string, unknown>[])
}

export function insertPurchaseItem(database: DatabaseHandle, row: Partial<PurchaseItemRow>): void {
  execute(() => database.prepare(`
    INSERT INTO purchase_items (id,purchase_id,product_id,unit_name_snapshot,priced_unit_qty_base,qty_base,unit_cost_piasters,line_subtotal_piasters,tax_rate_bps_snapshot,tax_piasters,line_total_piasters,batch_code_snapshot,expiry_at_snapshot,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.purchaseId, row.productId, row.unitNameSnapshot, row.pricedUnitQtyBase,
    row.qtyBase, row.unitCostPiasters, row.lineSubtotalPiasters, row.taxRateBpsSnapshot ?? 0,
    row.taxPiasters ?? 0, row.lineTotalPiasters, row.batchCodeSnapshot ?? null,
    row.expiryAtSnapshot ?? null, row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function updatePurchaseVoidMetadata(database: DatabaseHandle, id: string, updatedAt: number, voidedAt: number, voidedByUserId: string, voidReason: string): void {
  execute(() => database.prepare("UPDATE purchases SET status = 'voided', updated_at = ?, voided_at = ?, voided_by_user_id = ?, void_reason = ? WHERE id = ?").run(updatedAt, voidedAt, voidedByUserId, voidReason, id))
}
