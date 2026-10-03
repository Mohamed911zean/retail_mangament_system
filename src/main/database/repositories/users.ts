import { execute, mapRow, mapRows, type DatabaseHandle } from './common'

export function getUser(database: DatabaseHandle, id: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare('SELECT * FROM users WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function listUsers(database: DatabaseHandle): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM users ORDER BY username').all()) as Record<string, unknown>[])
}
export function insertUser(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES (@id,@username,@display_name,@password_hash,@role,@is_active,@created_at,@updated_at,@device_id)
  `).run(row))
}
