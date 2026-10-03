import type Database from 'better-sqlite3'
import { calculateCustomerBalance, calculateSupplierBalance } from '../../domain/balances'
import { calculateExpectedShiftCash } from '../../domain/shifts'

export type VerifyError = {
  code:
    | 'db_foreign_key'
    | 'db_integrity'
    | 'stock_invariant_zero_value'
    | 'stock_invariant_negative_value'
    | 'sale_total_mismatch'
    | 'sale_paid_due_mismatch'
    | 'reversal_missing'
    | 'reversal_sign'
    | 'missing_append_only_trigger'
    | 'shift_cash_mismatch'
  message: string
  details?: unknown
}

export type VerifyReport = {
  ok: boolean
  errors: VerifyError[]
}

type ProductRow = { product_id: string; qty: number; value: number }
type SaleRow = {
  id: string
  total_piasters: number
  paid_piasters: number
  due_piasters: number
  rounding_adjustment_piasters: number
  item_total: number | null
}

function signedRows(
  database: Database.Database,
  query: string,
  parameters: unknown[] = [],
): { direction: 'in' | 'out'; amountPiasters: number }[] {
  return database.prepare(query).all(...parameters) as {
    direction: 'in' | 'out'
    amountPiasters: number
  }[]
}

export function verifyDatabase(database: Database.Database): VerifyReport {
  const errors: VerifyError[] = []
  const foreignKeys = database.pragma('foreign_key_check') as unknown[]
  if (foreignKeys.length > 0) {
    errors.push({ code: 'db_foreign_key', message: 'foreign_key_check returned violations', details: foreignKeys })
  }
  const integrity = database.pragma('integrity_check', { simple: true })
  if (integrity !== 'ok') {
    errors.push({ code: 'db_integrity', message: `integrity_check returned ${String(integrity)}` })
  }

  const products = database.prepare(`
    SELECT product_id, COALESCE(SUM(qty_delta), 0) AS qty,
           COALESCE(SUM(value_delta_piasters), 0) AS value
    FROM stock_movements
    GROUP BY product_id
  `).all() as ProductRow[]
  for (const product of products) {
    if (product.qty === 0 && product.value !== 0) {
      errors.push({
        code: 'stock_invariant_zero_value',
        message: `product ${product.product_id} has zero quantity and non-zero value`,
        details: product,
      })
    }
    if (product.qty > 0 && product.value < 0) {
      errors.push({
        code: 'stock_invariant_negative_value',
        message: `product ${product.product_id} has positive quantity and negative value`,
        details: product,
      })
    }
  }

  const sales = database.prepare(`
    SELECT sales.id, sales.total_piasters, sales.paid_piasters, sales.due_piasters,
           sales.rounding_adjustment_piasters,
           (SELECT COALESCE(SUM(final_line_total_piasters), 0)
              FROM sale_items WHERE sale_items.sale_id = sales.id) AS item_total
    FROM sales
  `).all() as SaleRow[]
  for (const sale of sales) {
    if ((sale.item_total ?? 0) + sale.rounding_adjustment_piasters !== sale.total_piasters) {
      errors.push({
        code: 'sale_total_mismatch',
        message: `sale ${sale.id} total does not match line totals plus rounding`,
        details: sale,
      })
    }
    if (sale.paid_piasters + sale.due_piasters !== sale.total_piasters) {
      errors.push({
        code: 'sale_paid_due_mismatch',
        message: `sale ${sale.id} paid plus due does not match total`,
        details: sale,
      })
    }
  }

  const movementReversals = database.prepare(`
    SELECT original.id AS original_id, original.qty_delta AS original_qty,
           original.value_delta_piasters AS original_value,
           reversal.id AS reversal_id, reversal.qty_delta AS reversal_qty,
           reversal.value_delta_piasters AS reversal_value
    FROM stock_movements AS reversal
    LEFT JOIN stock_movements AS original
      ON original.id = reversal.reverses_movement_id
    WHERE reversal.reverses_movement_id IS NOT NULL
  `).all() as {
    original_id: string | null
    original_qty: number | null
    original_value: number | null
    reversal_id: string
    reversal_qty: number
    reversal_value: number
  }[]
  for (const row of movementReversals) {
    if (row.original_id === null) {
      errors.push({ code: 'reversal_missing', message: `movement reversal ${row.reversal_id} points to no row` })
    } else if (
      row.original_qty === null ||
      row.original_value === null ||
      row.reversal_qty !== -row.original_qty ||
      row.reversal_value !== -row.original_value
    ) {
      errors.push({ code: 'reversal_sign', message: `movement reversal ${row.reversal_id} does not invert its original` })
    }
  }

  const ledgerReversals = database.prepare(`
    SELECT original.id AS original_id, original.direction AS original_direction,
           original.amount_piasters AS original_amount,
           reversal.id AS reversal_id, reversal.direction AS reversal_direction,
           reversal.amount_piasters AS reversal_amount
    FROM money_ledger AS reversal
    LEFT JOIN money_ledger AS original
      ON original.id = reversal.reverses_entry_id
    WHERE reversal.reverses_entry_id IS NOT NULL
  `).all() as {
    original_id: string | null
    original_direction: 'in' | 'out' | null
    original_amount: number | null
    reversal_id: string
    reversal_direction: 'in' | 'out'
    reversal_amount: number
  }[]
  for (const row of ledgerReversals) {
    if (row.original_id === null) {
      errors.push({ code: 'reversal_missing', message: `ledger reversal ${row.reversal_id} points to no row` })
    } else if (
      row.reversal_amount !== row.original_amount ||
      row.reversal_direction === row.original_direction
    ) {
      errors.push({ code: 'reversal_sign', message: `ledger reversal ${row.reversal_id} does not invert its original` })
    }
  }

  const triggerNames = new Set(
    (database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as { name: string }[])
      .map((row) => row.name),
  )
  const requiredTriggers = [
    'trg_stock_movements_no_update',
    'trg_stock_movements_no_delete',
    'trg_money_ledger_no_update',
    'trg_money_ledger_no_delete',
    'trg_audit_log_no_update',
    'trg_audit_log_no_delete',
    'trg_sale_items_no_update',
    'trg_sale_items_no_delete',
    'trg_purchase_items_no_update',
    'trg_purchase_items_no_delete',
    'trg_sale_return_items_no_update',
    'trg_sale_return_items_no_delete',
    'trg_sales_guarded_update',
    'trg_sales_no_delete',
    'trg_purchases_guarded_update',
    'trg_purchases_no_delete',
    'trg_sale_returns_guarded_update',
    'trg_sale_returns_no_delete',
  ]
  for (const trigger of requiredTriggers) {
    if (!triggerNames.has(trigger)) {
      errors.push({ code: 'missing_append_only_trigger', message: `required trigger ${trigger} is missing` })
    }
  }

  const customerIds = database.prepare(`
    SELECT id FROM customers
    WHERE EXISTS (SELECT 1 FROM sales WHERE customer_id = customers.id)
       OR EXISTS (SELECT 1 FROM money_ledger WHERE customer_id = customers.id)
       OR EXISTS (SELECT 1 FROM sale_returns WHERE customer_id = customers.id)
  `).all() as { id: string }[]
  for (const customer of customerIds) {
    const salesForCustomer = database.prepare(
      "SELECT status, due_piasters AS duePiasters FROM sales WHERE customer_id = ?",
    ).all(customer.id) as { status: 'completed' | 'voided'; duePiasters: number }[]
    const receipts = signedRows(
      database,
      "SELECT direction, amount_piasters AS amountPiasters FROM money_ledger WHERE customer_id = ? AND entry_type = 'customer_receipt'",
      [customer.id],
    )
    const returns = database.prepare(
      'SELECT status, credited_to_account_piasters AS creditedToAccountPiasters FROM sale_returns WHERE customer_id = ?',
    ).all(customer.id) as { status: 'completed' | 'voided'; creditedToAccountPiasters: number }[]
    const result = calculateCustomerBalance({ sales: salesForCustomer, receipts, returns })
    if (!result.ok) errors.push({ code: 'db_integrity', message: `customer balance calculation failed for ${customer.id}` })
  }

  const supplierIds = database.prepare(`
    SELECT id FROM suppliers
    WHERE EXISTS (SELECT 1 FROM purchases WHERE supplier_id = suppliers.id)
       OR EXISTS (SELECT 1 FROM money_ledger WHERE supplier_id = suppliers.id)
  `).all() as { id: string }[]
  for (const supplier of supplierIds) {
    const purchases = database.prepare(
      'SELECT status, due_piasters AS duePiasters FROM purchases WHERE supplier_id = ?',
    ).all(supplier.id) as { status: 'completed' | 'voided'; duePiasters: number }[]
    const payments = signedRows(
      database,
      "SELECT direction, amount_piasters AS amountPiasters FROM money_ledger WHERE supplier_id = ? AND entry_type IN ('supplier_payment','purchase_payment')",
      [supplier.id],
    )
    const result = calculateSupplierBalance({ purchases, payments })
    if (!result.ok) errors.push({ code: 'db_integrity', message: `supplier balance calculation failed for ${supplier.id}` })
  }

  const shifts = database.prepare(
    'SELECT id, opening_cash_piasters, expected_cash_piasters FROM shifts WHERE expected_cash_piasters IS NOT NULL',
  ).all() as { id: string; opening_cash_piasters: number; expected_cash_piasters: number }[]
  for (const shift of shifts) {
    const entries = signedRows(
      database,
      'SELECT shift_id AS shiftId, payment_method AS method, direction, amount_piasters AS amountPiasters FROM money_ledger WHERE shift_id = ?',
      [shift.id],
    ) as unknown as { shiftId: string | null; method: string; direction: 'in' | 'out'; amountPiasters: number }[]
    const result = calculateExpectedShiftCash(shift.opening_cash_piasters, shift.id, entries)
    if (!result.ok || result.value.expectedCashPiasters !== shift.expected_cash_piasters) {
      errors.push({ code: 'shift_cash_mismatch', message: `shift ${shift.id} expected cash mismatch` })
    }
  }

  return { ok: errors.length === 0, errors }
}
