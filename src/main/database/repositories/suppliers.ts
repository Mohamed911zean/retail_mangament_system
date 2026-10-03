import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { SupplierRow } from '../rows'
export function getSupplier(database: DatabaseHandle, id: string): SupplierRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM suppliers WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<SupplierRow>(row)
}
export function listSuppliers(database: DatabaseHandle): SupplierRow[] {
  return mapRows<SupplierRow>(execute(() => database.prepare('SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY name').all()) as Record<string, unknown>[])
}
export function insertSupplier(database: DatabaseHandle, row: Partial<SupplierRow>): void {
  execute(() => database.prepare('INSERT INTO suppliers (id,name,phone,address,metadata,created_at,updated_at,device_id) VALUES (@id,@name,@phone,@address,@metadata,@created_at,@updated_at,@device_id)').run(row))
}
export function updateSupplier(database: DatabaseHandle, id: string, fields: Pick<SupplierRow, 'name' | 'phone' | 'address' | 'metadata'>, updatedAt: number): void {
  execute(() => database.prepare('UPDATE suppliers SET name = ?, phone = ?, address = ?, metadata = ?, updated_at = ? WHERE id = ?').run(fields.name, fields.phone, fields.address, fields.metadata, updatedAt, id))
}
export function softDeleteSupplier(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE suppliers SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}
