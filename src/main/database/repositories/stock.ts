import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { StockBatchRow, StockMovementRow } from '../rows'
type LegacyMovement = {
  id: string; product_id: string; batch_id?: string | null; qty_delta: number; value_delta_piasters: number
  movement_type: string; reverses_movement_id?: string | null; reference_type?: string | null; reference_id?: string | null
  occurred_at: number; reason?: string | null; created_by_user_id: string; created_at: number; updated_at: number; device_id: string
}
export function getStockMovement(database: DatabaseHandle, id: string): StockMovementRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM stock_movements WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<StockMovementRow>(row)
}
export function insertStockBatch(database: DatabaseHandle, row: Partial<StockBatchRow>): void {
  execute(() => database.prepare('INSERT INTO stock_batches (id,product_id,batch_code,expiry_at,received_at,initial_qty_base,deleted_at,created_at,updated_at,device_id) VALUES (@id,@product_id,@batch_code,@expiry_at,@received_at,@initial_qty_base,@deleted_at,@created_at,@updated_at,@device_id)').run(row))
}
export function listStockBatches(database: DatabaseHandle, productId: string): StockBatchRow[] {
  return mapRows<StockBatchRow>(execute(() => database.prepare('SELECT * FROM stock_batches WHERE product_id = ? AND deleted_at IS NULL ORDER BY expiry_at,id').all(productId)) as Record<string, unknown>[])
}
export function listStockMovements(database: DatabaseHandle, productId: string): StockMovementRow[] {
  return mapRows<StockMovementRow>(execute(() => database.prepare('SELECT * FROM stock_movements WHERE product_id = ? ORDER BY occurred_at,id').all(productId)) as Record<string, unknown>[])
}
export function getOnHand(database: DatabaseHandle, productId: string): { qty: number; valuePiasters: number } {
  return execute(() => database.prepare('SELECT COALESCE(SUM(qty_delta),0) AS qty, COALESCE(SUM(value_delta_piasters),0) AS valuePiasters FROM stock_movements WHERE product_id = ?').get(productId)) as { qty: number; valuePiasters: number }
}
export function insertStockMovement(database: DatabaseHandle, row: Partial<StockMovementRow> | LegacyMovement): void {
  const typed = row as Partial<StockMovementRow>
  const legacy = row as Partial<LegacyMovement>
  execute(() => database.prepare('INSERT INTO stock_movements (id,product_id,batch_id,qty_delta,value_delta_piasters,movement_type,reverses_movement_id,reference_type,reference_id,occurred_at,reason,created_by_user_id,created_at,updated_at,device_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    typed.id ?? legacy.id, typed.productId ?? legacy.product_id, typed.batchId ?? legacy.batch_id ?? null, typed.qtyDelta ?? legacy.qty_delta,
    typed.valueDeltaPiasters ?? legacy.value_delta_piasters, typed.movementType ?? legacy.movement_type,
    typed.reversesMovementId ?? legacy.reverses_movement_id ?? null, typed.referenceType ?? legacy.reference_type ?? null,
    typed.referenceId ?? legacy.reference_id ?? null, typed.occurredAt ?? legacy.occurred_at, typed.reason ?? legacy.reason ?? null,
    typed.createdByUserId ?? legacy.created_by_user_id, typed.createdAt ?? legacy.created_at, typed.updatedAt ?? legacy.updated_at, typed.deviceId ?? legacy.device_id,
  ))
}
