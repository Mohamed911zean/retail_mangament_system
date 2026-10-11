import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { StockBatchRow, StockMovementRow } from '../rows'

export function getStockMovement(database: DatabaseHandle, id: string): StockMovementRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM stock_movements WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<StockMovementRow>(row)
}

export function insertStockBatch(database: DatabaseHandle, row: Partial<StockBatchRow>): void {
  execute(() => database.prepare(`
    INSERT INTO stock_batches (id,product_id,batch_code,expiry_at,received_at,initial_qty_base,deleted_at,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.productId, row.batchCode ?? null, row.expiryAt ?? null, row.receivedAt,
    row.initialQtyBase, row.deletedAt ?? null, row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function listStockBatches(database: DatabaseHandle, productId: string): StockBatchRow[] {
  return mapRows<StockBatchRow>(execute(() => database.prepare('SELECT * FROM stock_batches WHERE product_id = ? AND deleted_at IS NULL ORDER BY expiry_at,id').all(productId)) as Record<string, unknown>[])
}

export function listStockMovements(database: DatabaseHandle, productId?: string): StockMovementRow[] {
  const rows = productId === undefined
    ? execute(() => database.prepare('SELECT * FROM stock_movements ORDER BY occurred_at,id').all())
    : execute(() => database.prepare('SELECT * FROM stock_movements WHERE product_id = ? ORDER BY occurred_at,id').all(productId))
  return mapRows<StockMovementRow>(rows as Record<string, unknown>[])
}

export function getOnHand(database: DatabaseHandle, productId: string): { qty: number; valuePiasters: number } {
  return execute(() => database.prepare('SELECT COALESCE(SUM(qty_delta),0) AS qty, COALESCE(SUM(value_delta_piasters),0) AS valuePiasters FROM stock_movements WHERE product_id = ?').get(productId)) as { qty: number; valuePiasters: number }
}

/** Net revaluation (negative-stock settlement) value posted in the half-open range. */
export function sumRevaluationInRange(database: DatabaseHandle, fromMs: number, toMs: number): number {
  const row = execute(() => database.prepare(
    `SELECT COALESCE(SUM(value_delta_piasters),0) AS total FROM stock_movements
     WHERE movement_type = 'revaluation' AND occurred_at >= ? AND occurred_at < ?`,
  ).get(fromMs, toMs)) as { total: number }
  return row.total
}

/** Restocked value per return-item id, from the `sale_return` movements that restocked them. */
export function sumRestockValueByReturnItem(database: DatabaseHandle, returnItemIds: string[]): Map<string, number> {
  const sums = new Map<string, number>()
  if (returnItemIds.length === 0) return sums
  const placeholders = returnItemIds.map(() => '?').join(',')
  const rows = execute(() => database.prepare(
    `SELECT reference_id AS referenceId, COALESCE(SUM(value_delta_piasters),0) AS total FROM stock_movements
     WHERE movement_type = 'sale_return' AND reference_id IN (${placeholders}) GROUP BY reference_id`,
  ).all(...returnItemIds)) as { referenceId: string; total: number }[]
  for (const row of rows) sums.set(row.referenceId, row.total)
  return sums
}

export function insertStockMovement(database: DatabaseHandle, row: Partial<StockMovementRow>): void {
  execute(() => database.prepare(`
    INSERT INTO stock_movements (id,product_id,batch_id,qty_delta,value_delta_piasters,movement_type,reverses_movement_id,reference_type,reference_id,occurred_at,reason,created_by_user_id,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.productId, row.batchId ?? null, row.qtyDelta ?? 0,
    row.valueDeltaPiasters ?? 0, row.movementType, row.reversesMovementId ?? null,
    row.referenceType ?? null, row.referenceId ?? null, row.occurredAt, row.reason ?? null,
    row.createdByUserId, row.createdAt, row.updatedAt, row.deviceId,
  ))
}
