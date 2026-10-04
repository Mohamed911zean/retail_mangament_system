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
  execute(() => database.prepare(`
    INSERT INTO suppliers (id,name,phone,address,metadata,deleted_at,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.name, row.phone ?? null, row.address ?? null, row.metadata ?? null,
    row.deletedAt ?? null, row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function updateSupplier(database: DatabaseHandle, id: string, fields: Partial<Pick<SupplierRow, 'name' | 'phone' | 'address' | 'metadata' | 'updatedAt'>>): void {
  const current = getSupplier(database, id)
  if (current === undefined) return
  const name = fields.name ?? current.name
  const phone = fields.phone !== undefined ? fields.phone : current.phone
  const address = fields.address !== undefined ? fields.address : current.address
  const metadata = fields.metadata !== undefined ? fields.metadata : current.metadata
  const updatedAt = fields.updatedAt ?? Date.now()
  execute(() => database.prepare(`
    UPDATE suppliers SET name = ?, phone = ?, address = ?, metadata = ?, updated_at = ?
    WHERE id = ?
  `).run(name, phone, address, metadata, updatedAt, id))
}

export function softDeleteSupplier(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE suppliers SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}
