import { execute, mapRows, type DatabaseHandle } from './common'
export function listExpenses(database: DatabaseHandle, shiftId?: string): Record<string, unknown>[] {
  const rows = shiftId === undefined
    ? execute(() => database.prepare('SELECT * FROM expenses ORDER BY expense_at,id').all())
    : execute(() => database.prepare('SELECT * FROM expenses WHERE shift_id = ? ORDER BY expense_at,id').all(shiftId))
  return mapRows(rows as Record<string, unknown>[])
}
export function insertExpense(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO expenses (id,category,description,amount_piasters,payment_method,expense_at,user_id,shift_id,status,created_at,updated_at,device_id) VALUES (@id,@category,@description,@amount_piasters,@payment_method,@expense_at,@user_id,@shift_id,@status,@created_at,@updated_at,@device_id)').run(row))
}
