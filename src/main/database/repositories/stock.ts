import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
export function getStockMovement(database: DatabaseHandle, id: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare('SELECT * FROM stock_movements WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function listStockMovements(database: DatabaseHandle, productId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM stock_movements WHERE product_id = ? ORDER BY occurred_at,id').all(productId)) as Record<string, unknown>[])
}
export function getOnHand(database: DatabaseHandle, productId: string): { qty: number; valuePiasters: number } {
  return execute(() => database.prepare('SELECT COALESCE(SUM(qty_delta),0) AS qty, COALESCE(SUM(value_delta_piasters),0) AS valuePiasters FROM stock_movements WHERE product_id = ?').get(productId)) as { qty: number; valuePiasters: number }
}
export function insertStockMovement(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO stock_movements (id,product_id,batch_id,qty_delta,value_delta_piasters,movement_type,reverses_movement_id,reference_type,reference_id,occurred_at,reason,created_by_user_id,created_at,updated_at,device_id) VALUES (@id,@product_id,@batch_id,@qty_delta,@value_delta_piasters,@movement_type,@reverses_movement_id,@reference_type,@reference_id,@occurred_at,@reason,@created_by_user_id,@created_at,@updated_at,@device_id)').run(row))
}
