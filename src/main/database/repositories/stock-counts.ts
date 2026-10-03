import { execute, mapRows, type DatabaseHandle } from './common'
import type { StockCountItemRow, StockCountRow } from '../rows'
export function listStockCounts(database: DatabaseHandle): StockCountRow[] {
  return mapRows<StockCountRow>(execute(() => database.prepare('SELECT * FROM stock_counts ORDER BY started_at,id').all()) as Record<string, unknown>[])
}
export function insertStockCount(database: DatabaseHandle, row: Partial<StockCountRow>): void {
  execute(() => database.prepare('INSERT INTO stock_counts (id,status,started_at,posted_at,user_id,notes,created_at,updated_at,device_id) VALUES (@id,@status,@started_at,@posted_at,@user_id,@notes,@created_at,@updated_at,@device_id)').run(row))
}
export function listStockCountItems(database: DatabaseHandle, stockCountId: string): StockCountItemRow[] {
  return mapRows<StockCountItemRow>(execute(() => database.prepare('SELECT * FROM stock_count_items WHERE stock_count_id = ? ORDER BY id').all(stockCountId)) as Record<string, unknown>[])
}
export function insertStockCountItem(database: DatabaseHandle, row: Partial<StockCountItemRow>): void {
  execute(() => database.prepare('INSERT INTO stock_count_items (id,stock_count_id,product_id,expected_qty_base,counted_qty_base,difference_qty_base,created_at,updated_at,device_id) VALUES (@id,@stock_count_id,@product_id,@expected_qty_base,@counted_qty_base,@difference_qty_base,@created_at,@updated_at,@device_id)').run(row))
}
