import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { SaleItemRow, SaleRow } from '../rows'

export function getSale(database: DatabaseHandle, id: string): SaleRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM sales WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<SaleRow>(row)
}

export function listSales(database: DatabaseHandle, customerId?: string): SaleRow[] {
  const rows = customerId === undefined
    ? execute(() => database.prepare('SELECT * FROM sales ORDER BY created_at,id').all())
    : execute(() => database.prepare('SELECT * FROM sales WHERE customer_id = ? ORDER BY created_at,id').all(customerId))
  return mapRows<SaleRow>(rows as Record<string, unknown>[])
}

/** Half-open range: created_at >= fromMs and created_at < toMs. */
export function listSalesInRange(database: DatabaseHandle, fromMs: number, toMs: number): SaleRow[] {
  const rows = execute(() => database.prepare('SELECT * FROM sales WHERE created_at >= ? AND created_at < ? ORDER BY created_at,id').all(fromMs, toMs))
  return mapRows<SaleRow>(rows as Record<string, unknown>[])
}

export function insertSale(database: DatabaseHandle, row: Partial<SaleRow>): void {
  execute(() => database.prepare(`
    INSERT INTO sales (id,invoice_number,customer_id,user_id,shift_id,subtotal_piasters,line_discount_piasters,
      invoice_discount_piasters,tax_piasters,rounding_adjustment_piasters,total_piasters,paid_piasters,due_piasters,
      payment_status,status,voided_at,voided_by_user_id,void_reason,notes,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.invoiceNumber, row.customerId ?? null, row.userId, row.shiftId ?? null,
    row.subtotalPiasters ?? 0, row.lineDiscountPiasters ?? 0, row.invoiceDiscountPiasters ?? 0,
    row.taxPiasters ?? 0, row.roundingAdjustmentPiasters ?? 0, row.totalPiasters ?? 0,
    row.paidPiasters ?? 0, row.duePiasters ?? 0, row.paymentStatus, row.status ?? 'completed',
    row.voidedAt ?? null, row.voidedByUserId ?? null, row.voidReason ?? null, row.notes ?? null,
    row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function listSaleItems(database: DatabaseHandle, saleId: string): SaleItemRow[] {
  return mapRows<SaleItemRow>(execute(() => database.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(saleId)) as Record<string, unknown>[])
}

/** Lines whose sale falls in the half-open range, each carrying its sale status. */
export function listSaleItemsInRange(database: DatabaseHandle, fromMs: number, toMs: number): (SaleItemRow & { saleStatus: string })[] {
  const rows = execute(() => database.prepare(`
    SELECT si.*, s.status AS sale_status
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.created_at >= ? AND s.created_at < ?
    ORDER BY s.created_at,si.id
  `).all(fromMs, toMs))
  return mapRows<SaleItemRow & { saleStatus: string }>(rows as Record<string, unknown>[])
}

export function insertSaleItem(database: DatabaseHandle, row: Partial<SaleItemRow>): void {
  execute(() => database.prepare(`
    INSERT INTO sale_items (id,sale_id,product_id,unit_name_snapshot,priced_unit_qty_base,qty_base,unit_price_piasters,
      line_subtotal_piasters,line_discount_piasters,invoice_discount_allocated_piasters,tax_rate_bps_snapshot,
      tax_piasters,final_line_total_piasters,line_cost_piasters,product_name_snapshot,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.saleId, row.productId, row.unitNameSnapshot, row.pricedUnitQtyBase,
    row.qtyBase, row.unitPricePiasters, row.lineSubtotalPiasters, row.lineDiscountPiasters ?? 0,
    row.invoiceDiscountAllocatedPiasters ?? 0, row.taxRateBpsSnapshot ?? 0, row.taxPiasters ?? 0,
    row.finalLineTotalPiasters, row.lineCostPiasters, row.productNameSnapshot,
    row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function updateSaleVoidMetadata(database: DatabaseHandle, id: string, updatedAt: number, voidedAt: number, voidedByUserId: string, voidReason: string): void {
  execute(() => database.prepare("UPDATE sales SET status = 'voided', updated_at = ?, voided_at = ?, voided_by_user_id = ?, void_reason = ? WHERE id = ?").run(updatedAt, voidedAt, voidedByUserId, voidReason, id))
}
