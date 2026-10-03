import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
export function getOpenShift(database: DatabaseHandle, deviceId: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare("SELECT * FROM shifts WHERE device_id = ? AND status = 'open'").get(deviceId)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function listShifts(database: DatabaseHandle): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM shifts ORDER BY opened_at,id').all()) as Record<string, unknown>[])
}
export function insertShift(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO shifts (id,user_id,opened_at,opening_cash_piasters,expected_cash_piasters,counted_cash_piasters,difference_piasters,status,closing_notes,created_at,updated_at,device_id) VALUES (@id,@user_id,@opened_at,@opening_cash_piasters,@expected_cash_piasters,@counted_cash_piasters,@difference_piasters,@status,@closing_notes,@created_at,@updated_at,@device_id)').run(row))
}
