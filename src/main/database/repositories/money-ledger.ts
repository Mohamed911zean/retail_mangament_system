import { execute, mapRows, type DatabaseHandle } from './common'
import type { MoneyLedgerRow } from '../rows'
export function listMoneyLedger(database: DatabaseHandle, shiftId?: string): MoneyLedgerRow[] {
  const rows = shiftId === undefined
    ? execute(() => database.prepare('SELECT * FROM money_ledger ORDER BY occurred_at,id').all())
    : execute(() => database.prepare('SELECT * FROM money_ledger WHERE shift_id = ? ORDER BY occurred_at,id').all(shiftId))
  return mapRows<MoneyLedgerRow>(rows as Record<string, unknown>[])
}
export function insertMoneyLedgerEntry(database: DatabaseHandle, row: Partial<MoneyLedgerRow>): void {
  execute(() => database.prepare('INSERT INTO money_ledger (id,entry_type,direction,amount_piasters,payment_method,customer_id,supplier_id,sale_id,reference_type,reference_id,reverses_entry_id,shift_id,reference_text,tendered_piasters,change_piasters,occurred_at,user_id,created_at,updated_at,device_id) VALUES (@id,@entry_type,@direction,@amount_piasters,@payment_method,@customer_id,@supplier_id,@sale_id,@reference_type,@reference_id,@reverses_entry_id,@shift_id,@reference_text,@tendered_piasters,@change_piasters,@occurred_at,@user_id,@created_at,@updated_at,@device_id)').run(row))
}
