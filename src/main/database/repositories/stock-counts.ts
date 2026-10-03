import { execute, mapRows, type DatabaseHandle } from './common'
export function listStockCounts(database: DatabaseHandle): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM stock_counts ORDER BY started_at,id').all()) as Record<string, unknown>[])
}
export function insertStockCount(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO stock_counts (id,status,started_at,posted_at,user_id,notes,created_at,updated_at,device_id) VALUES (@id,@status,@started_at,@posted_at,@user_id,@notes,@created_at,@updated_at,@device_id)').run(row))
}
export function listStockCountItems(database: DatabaseHandle, stockCountId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM stock_count_items WHERE stock_count_id = ? ORDER BY id').all(stockCountId)) as Record<string, unknown>[])
}
