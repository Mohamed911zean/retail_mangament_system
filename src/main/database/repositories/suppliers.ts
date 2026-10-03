import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
export function getSupplier(database: DatabaseHandle, id: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare('SELECT * FROM suppliers WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function listSuppliers(database: DatabaseHandle): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY name').all()) as Record<string, unknown>[])
}
export function insertSupplier(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO suppliers (id,name,phone,address,metadata,created_at,updated_at,device_id) VALUES (@id,@name,@phone,@address,@metadata,@created_at,@updated_at,@device_id)').run(row))
}
