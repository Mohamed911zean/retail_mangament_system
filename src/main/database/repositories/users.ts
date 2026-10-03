import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { UserRow } from '../rows'

export function getUser(database: DatabaseHandle, id: string): UserRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM users WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<UserRow>(row)
}
export function listUsers(database: DatabaseHandle): UserRow[] {
  return mapRows<UserRow>(execute(() => database.prepare('SELECT * FROM users ORDER BY username').all()) as Record<string, unknown>[])
}
export function insertUser(database: DatabaseHandle, row: Partial<UserRow>): void {
  execute(() => database.prepare(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES (@id,@username,@display_name,@password_hash,@role,@is_active,@created_at,@updated_at,@device_id)
  `).run(row))
}
export function updateUser(database: DatabaseHandle, id: string, fields: Pick<UserRow, 'displayName' | 'role' | 'isActive' | 'updatedAt'>): void {
  execute(() => database.prepare('UPDATE users SET display_name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?').run(fields.displayName, fields.role, fields.isActive ? 1 : 0, fields.updatedAt, id))
}
export function deactivateUser(database: DatabaseHandle, id: string, updatedAt: number): void {
  execute(() => database.prepare('UPDATE users SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?').run(updatedAt, updatedAt, id))
}
