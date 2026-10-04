import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { CustomerRow } from '../rows'

export function getCustomer(database: DatabaseHandle, id: string): CustomerRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM customers WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<CustomerRow>(row)
}

export function listCustomers(database: DatabaseHandle): CustomerRow[] {
  return mapRows<CustomerRow>(execute(() => database.prepare('SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name').all()) as Record<string, unknown>[])
}

export function insertCustomer(database: DatabaseHandle, row: Partial<CustomerRow>): void {
  execute(() => database.prepare(`
    INSERT INTO customers (id,name,phone,address,credit_limit_piasters,metadata,deleted_at,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.name, row.phone ?? null, row.address ?? null, row.creditLimitPiasters ?? null,
    row.metadata ?? null, row.deletedAt ?? null, row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function updateCustomer(database: DatabaseHandle, id: string, fields: Partial<Pick<CustomerRow, 'name' | 'phone' | 'address' | 'creditLimitPiasters' | 'metadata' | 'updatedAt'>>): void {
  const current = getCustomer(database, id)
  if (current === undefined) return
  const name = fields.name ?? current.name
  const phone = fields.phone !== undefined ? fields.phone : current.phone
  const address = fields.address !== undefined ? fields.address : current.address
  const creditLimitPiasters = fields.creditLimitPiasters !== undefined ? fields.creditLimitPiasters : current.creditLimitPiasters
  const metadata = fields.metadata !== undefined ? fields.metadata : current.metadata
  const updatedAt = fields.updatedAt ?? Date.now()
  execute(() => database.prepare(`
    UPDATE customers SET name = ?, phone = ?, address = ?, credit_limit_piasters = ?, metadata = ?, updated_at = ?
    WHERE id = ?
  `).run(name, phone, address, creditLimitPiasters, metadata, updatedAt, id))
}

export function softDeleteCustomer(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}
