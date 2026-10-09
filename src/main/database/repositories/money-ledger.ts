import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { MoneyLedgerRow } from '../rows'

export function getMoneyLedgerEntry(database: DatabaseHandle, id: string): MoneyLedgerRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM money_ledger WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<MoneyLedgerRow>(row)
}

export function listMoneyLedger(database: DatabaseHandle, shiftId?: string): MoneyLedgerRow[] {
  const rows = shiftId === undefined
    ? execute(() => database.prepare('SELECT * FROM money_ledger ORDER BY occurred_at,id').all())
    : execute(() => database.prepare('SELECT * FROM money_ledger WHERE shift_id = ? ORDER BY occurred_at,id').all(shiftId))
  return mapRows<MoneyLedgerRow>(rows as Record<string, unknown>[])
}

export function listMoneyLedgerByReference(database: DatabaseHandle, referenceType: string, referenceId: string): MoneyLedgerRow[] {
  const rows = execute(() => database.prepare('SELECT * FROM money_ledger WHERE reference_type = ? AND reference_id = ? ORDER BY occurred_at,id').all(referenceType, referenceId))
  return mapRows<MoneyLedgerRow>(rows as Record<string, unknown>[])
}

export function findReversalOfEntry(database: DatabaseHandle, entryId: string): MoneyLedgerRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM money_ledger WHERE reverses_entry_id = ?').get(entryId)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<MoneyLedgerRow>(row)
}

export function insertMoneyLedgerEntry(database: DatabaseHandle, row: Partial<MoneyLedgerRow>): void {
  execute(() => database.prepare(`
    INSERT INTO money_ledger (id,entry_type,direction,amount_piasters,payment_method,customer_id,supplier_id,sale_id,
      reference_type,reference_id,reverses_entry_id,shift_id,reference_text,tendered_piasters,change_piasters,occurred_at,user_id,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.entryType, row.direction, row.amountPiasters, row.paymentMethod ?? null,
    row.customerId ?? null, row.supplierId ?? null, row.saleId ?? null,
    row.referenceType ?? null, row.referenceId ?? null, row.reversesEntryId ?? null,
    row.shiftId ?? null, row.referenceText ?? null, row.tenderedPiasters ?? null,
    row.changePiasters ?? null, row.occurredAt, row.userId, row.createdAt, row.updatedAt, row.deviceId,
  ))
}
