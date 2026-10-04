import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { ShiftRow } from '../rows'

export function getOpenShift(database: DatabaseHandle, deviceId: string): ShiftRow | undefined {
  const row = execute(() => database.prepare("SELECT * FROM shifts WHERE device_id = ? AND status = 'open'").get(deviceId)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<ShiftRow>(row)
}

export function getShift(database: DatabaseHandle, id: string): ShiftRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM shifts WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<ShiftRow>(row)
}

export function listShifts(database: DatabaseHandle): ShiftRow[] {
  return mapRows<ShiftRow>(execute(() => database.prepare('SELECT * FROM shifts ORDER BY opened_at,id').all()) as Record<string, unknown>[])
}

export function insertShift(database: DatabaseHandle, row: Partial<ShiftRow>): void {
  execute(() => database.prepare(`
    INSERT INTO shifts (id,user_id,opened_at,closed_at,opening_cash_piasters,expected_cash_piasters,counted_cash_piasters,difference_piasters,status,closing_notes,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.userId, row.openedAt, row.closedAt ?? null, row.openingCashPiasters ?? 0,
    row.expectedCashPiasters ?? null, row.countedCashPiasters ?? null, row.differencePiasters ?? null,
    row.status ?? 'open', row.closingNotes ?? null, row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function closeShift(database: DatabaseHandle, id: string, fields: Pick<ShiftRow, 'closedAt' | 'expectedCashPiasters' | 'countedCashPiasters' | 'differencePiasters' | 'closingNotes' | 'updatedAt'>): void {
  execute(() => database.prepare("UPDATE shifts SET closed_at = ?, expected_cash_piasters = ?, counted_cash_piasters = ?, difference_piasters = ?, closing_notes = ?, status = 'closed', updated_at = ? WHERE id = ?").run(fields.closedAt, fields.expectedCashPiasters, fields.countedCashPiasters, fields.differencePiasters, fields.closingNotes, fields.updatedAt, id))
}
