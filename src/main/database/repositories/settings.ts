import { execute, mapRow, mapRows, type DatabaseHandle } from './common'

export type SettingRow = Record<string, unknown>

export function getSetting(database: DatabaseHandle, key: string): SettingRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM settings WHERE key = ?').get(key)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<SettingRow>(row)
}

export function listSettings(database: DatabaseHandle): SettingRow[] {
  return mapRows<SettingRow>(execute(() => database.prepare('SELECT * FROM settings ORDER BY key').all()) as Record<string, unknown>[])
}

export function insertSetting(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare(`
    INSERT INTO settings (key,value,value_type,description,created_at,updated_at,device_id)
    VALUES (@key,@value,@value_type,@description,@created_at,@updated_at,@device_id)
  `).run(row))
}
