import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { SettingRow } from '../rows'

export function getSetting(database: DatabaseHandle, key: string): SettingRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM settings WHERE key = ?').get(key)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<SettingRow>(row)
}

export function listSettings(database: DatabaseHandle): SettingRow[] {
  return mapRows<SettingRow>(execute(() => database.prepare('SELECT * FROM settings ORDER BY key').all()) as Record<string, unknown>[])
}

export function insertSetting(database: DatabaseHandle, row: Partial<SettingRow>): void {
  execute(() => database.prepare(`
    INSERT INTO settings (key,value,value_type,description,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?)
  `).run(row.key, row.value, row.valueType, row.description, row.createdAt, row.updatedAt, row.deviceId))
}
export function upsertSetting(database: DatabaseHandle, row: Partial<SettingRow>): void {
  execute(() => database.prepare(`
    INSERT INTO settings (key,value,value_type,description,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, value_type = excluded.value_type,
      description = excluded.description, updated_at = excluded.updated_at, device_id = excluded.device_id
  `).run(row.key, row.value, row.valueType, row.description, row.createdAt, row.updatedAt, row.deviceId))
}
