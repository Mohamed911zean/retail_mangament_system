import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { StockCountItemRow, StockCountRow } from '../rows'

export function getStockCount(database: DatabaseHandle, id: string): StockCountRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM stock_counts WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<StockCountRow>(row)
}

export function listStockCounts(database: DatabaseHandle): StockCountRow[] {
  return mapRows<StockCountRow>(execute(() => database.prepare('SELECT * FROM stock_counts ORDER BY started_at,id').all()) as Record<string, unknown>[])
}

export function insertStockCount(database: DatabaseHandle, row: Partial<StockCountRow>): void {
  execute(() => database.prepare(`
    INSERT INTO stock_counts (id,status,started_at,posted_at,user_id,notes,voided_at,voided_by_user_id,void_reason,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.status ?? 'draft', row.startedAt, row.postedAt ?? null, row.userId,
    row.notes ?? null, row.voidedAt ?? null, row.voidedByUserId ?? null, row.voidReason ?? null,
    row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function updateStockCount(database: DatabaseHandle, id: string, fields: Partial<Pick<StockCountRow, 'status' | 'postedAt' | 'notes' | 'updatedAt'>>): void {
  const current = getStockCount(database, id)
  if (current === undefined) return
  const status = fields.status ?? current.status
  const postedAt = fields.postedAt !== undefined ? fields.postedAt : current.postedAt
  const notes = fields.notes !== undefined ? fields.notes : current.notes
  const updatedAt = fields.updatedAt ?? Date.now()
  execute(() => database.prepare('UPDATE stock_counts SET status = ?, posted_at = ?, notes = ?, updated_at = ? WHERE id = ?').run(status, postedAt, notes, updatedAt, id))
}

export function listStockCountItems(database: DatabaseHandle, stockCountId: string): StockCountItemRow[] {
  return mapRows<StockCountItemRow>(execute(() => database.prepare('SELECT * FROM stock_count_items WHERE stock_count_id = ? ORDER BY id').all(stockCountId)) as Record<string, unknown>[])
}

export function insertStockCountItem(database: DatabaseHandle, row: Partial<StockCountItemRow>): void {
  execute(() => database.prepare(`
    INSERT INTO stock_count_items (id,stock_count_id,product_id,expected_qty_base,counted_qty_base,difference_qty_base,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.stockCountId, row.productId, row.expectedQtyBase, row.countedQtyBase,
    row.differenceQtyBase, row.createdAt, row.updatedAt, row.deviceId,
  ))
}
