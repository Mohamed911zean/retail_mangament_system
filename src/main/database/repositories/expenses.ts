import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
import type { ExpenseRow } from '../rows'

export function getExpense(database: DatabaseHandle, id: string): ExpenseRow | undefined {
  const row = execute(() => database.prepare('SELECT * FROM expenses WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow<ExpenseRow>(row)
}

export function listExpenses(database: DatabaseHandle, shiftId?: string): ExpenseRow[] {
  const rows = shiftId === undefined
    ? execute(() => database.prepare('SELECT * FROM expenses ORDER BY expense_at,id').all())
    : execute(() => database.prepare('SELECT * FROM expenses WHERE shift_id = ? ORDER BY expense_at,id').all(shiftId))
  return mapRows<ExpenseRow>(rows as Record<string, unknown>[])
}

export function insertExpense(database: DatabaseHandle, row: Partial<ExpenseRow>): void {
  execute(() => database.prepare(`
    INSERT INTO expenses (id,category,description,amount_piasters,payment_method,expense_at,user_id,shift_id,status,voided_at,voided_by_user_id,void_reason,created_at,updated_at,device_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.id, row.category, row.description, row.amountPiasters, row.paymentMethod, row.expenseAt,
    row.userId, row.shiftId ?? null, row.status ?? 'posted', row.voidedAt ?? null,
    row.voidedByUserId ?? null, row.voidReason ?? null, row.createdAt, row.updatedAt, row.deviceId,
  ))
}

export function updateExpenseVoidMetadata(database: DatabaseHandle, id: string, updatedAt: number, voidedAt: number, voidedByUserId: string, voidReason: string): void {
  execute(() => database.prepare("UPDATE expenses SET status = 'voided', updated_at = ?, voided_at = ?, voided_by_user_id = ?, void_reason = ? WHERE id = ?").run(updatedAt, voidedAt, voidedByUserId, voidReason, id))
}
