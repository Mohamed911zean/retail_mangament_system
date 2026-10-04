import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { HeldSaleRow } from '../rows'

export function getHeldSale(database: DatabaseHandle, id: string): HeldSaleRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM held_sales WHERE id = ? AND deleted_at IS NULL').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<HeldSaleRow>(row)
}

export function listHeldSales(database: DatabaseHandle, userId?: string): HeldSaleRow[] {
  const rows = userId === undefined
    ? execute(() => database.prepare('SELECT * FROM held_sales WHERE deleted_at IS NULL ORDER BY held_at DESC').all())
    : execute(() => database.prepare('SELECT * FROM held_sales WHERE user_id = ? AND deleted_at IS NULL ORDER BY held_at DESC').all(userId))
  return mapRows<HeldSaleRow>(rows as Record<string, unknown>[])
}

export function insertHeldSale(database: DatabaseHandle, row: Partial<HeldSaleRow>): void {
  execute(() => database.prepare(`
    INSERT INTO held_sales (id,label,user_id,shift_id,customer_id,payload_json,held_at,deleted_at,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.label ?? null, row.userId, row.shiftId ?? null, row.customerId ?? null,
    row.payloadJson, row.heldAt, row.deletedAt ?? null, row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function softDeleteHeldSale(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE held_sales SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}
