import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { UserRow } from '../rows'

export function getUser(database: DatabaseHandle, id: string): UserRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM users WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<UserRow>(row)
}

export function getUserByUsername(database: DatabaseHandle, username: string): UserRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM users WHERE username = ? AND deleted_at IS NULL').get(username)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<UserRow>(row)
}

export function listUsers(database: DatabaseHandle): UserRow[] {
  return mapRows<UserRow>(execute(() => database.prepare('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY username').all()) as Record<string, unknown>[])
}

export function insertUser(database: DatabaseHandle, row: Partial<UserRow>): void {
  execute(() => database.prepare(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,last_login_at,deleted_at,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.username, row.displayName, row.passwordHash, row.role,
    row.isActive === undefined ? 1 : (row.isActive ? 1 : 0),
    row.lastLoginAt ?? null, row.deletedAt ?? null, row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function updateUser(database: DatabaseHandle, id: string, fields: Partial<Pick<UserRow, 'displayName' | 'role' | 'isActive' | 'passwordHash' | 'lastLoginAt' | 'updatedAt'>>): void {
  const current = getUser(database, id)
  if (current === undefined) return
  const displayName = fields.displayName ?? current.displayName
  const role = fields.role ?? current.role
  const isActive = fields.isActive !== undefined ? (fields.isActive ? 1 : 0) : (current.isActive ? 1 : 0)
  const passwordHash = fields.passwordHash ?? current.passwordHash
  const lastLoginAt = fields.lastLoginAt !== undefined ? fields.lastLoginAt : current.lastLoginAt
  const updatedAt = fields.updatedAt ?? Date.now()
  execute(() => database.prepare('UPDATE users SET display_name = ?, role = ?, is_active = ?, password_hash = ?, last_login_at = ?, updated_at = ? WHERE id = ?').run(
    displayName, role, isActive, passwordHash, lastLoginAt, updatedAt, id,
  ))
}

export function deactivateUser(database: DatabaseHandle, id: string, updatedAt: number): void {
  execute(() => database.prepare('UPDATE users SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?').run(updatedAt, updatedAt, id))
}
