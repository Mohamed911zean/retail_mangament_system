import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
export function getCustomer(database: DatabaseHandle, id: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare('SELECT * FROM customers WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function listCustomers(database: DatabaseHandle): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name').all()) as Record<string, unknown>[])
}
export function insertCustomer(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO customers (id,name,phone,address,credit_limit_piasters,metadata,created_at,updated_at,device_id) VALUES (@id,@name,@phone,@address,@credit_limit_piasters,@metadata,@created_at,@updated_at,@device_id)').run(row))
}
