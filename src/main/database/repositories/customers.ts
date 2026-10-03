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
  execute(() => database.prepare('INSERT INTO customers (id,name,phone,address,credit_limit_piasters,metadata,created_at,updated_at,device_id) VALUES (@id,@name,@phone,@address,@credit_limit_piasters,@metadata,@created_at,@updated_at,@device_id)').run(row))
}
export function updateCustomer(database: DatabaseHandle, id: string, fields: Pick<CustomerRow, 'name' | 'phone' | 'address' | 'creditLimitPiasters' | 'metadata'>, updatedAt: number): void {
  execute(() => database.prepare('UPDATE customers SET name = ?, phone = ?, address = ?, credit_limit_piasters = ?, metadata = ?, updated_at = ? WHERE id = ?').run(fields.name, fields.phone, fields.address, fields.creditLimitPiasters, fields.metadata, updatedAt, id))
}
export function softDeleteCustomer(database: DatabaseHandle, id: string, deletedAt: number): void {
  execute(() => database.prepare('UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ?').run(deletedAt, deletedAt, id))
}
