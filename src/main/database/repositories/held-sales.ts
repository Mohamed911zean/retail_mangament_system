import { execute, mapRows, type DatabaseHandle } from './common'
import type { HeldSaleRow } from '../rows'
export function listHeldSales(database: DatabaseHandle, userId: string): HeldSaleRow[] {
  return mapRows<HeldSaleRow>(execute(() => database.prepare('SELECT * FROM held_sales WHERE user_id = ? AND deleted_at IS NULL ORDER BY held_at DESC').all(userId)) as Record<string, unknown>[])
}
export function insertHeldSale(database: DatabaseHandle, row: Partial<HeldSaleRow>): void {
  execute(() => database.prepare('INSERT INTO held_sales (id,label,user_id,shift_id,customer_id,payload_json,held_at,created_at,updated_at,device_id) VALUES (@id,@label,@user_id,@shift_id,@customer_id,@payload_json,@held_at,@created_at,@updated_at,@device_id)').run(row))
}
export function softDeleteHeldSale(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE held_sales SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}
