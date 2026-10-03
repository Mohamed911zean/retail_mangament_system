import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database'
import { mapRow, runInTransaction } from './common'
import { insertSetting } from './settings'
import { getUser, insertUser } from './users'
import { getProduct, insertProduct } from './catalog'
import { insertCustomer } from './customers'
import { insertSupplier } from './suppliers'
import { getOnHand, insertStockMovement } from './stock'
import { insertSale } from './sales'
import { insertMoneyLedgerEntry } from './money-ledger'
import { getOpenShift, insertShift } from './shifts'
import { insertHeldSale } from './held-sales'
import { insertAuditLog } from './audit-log'
import { nextSequenceNumber } from './sequences'
import { insertPurchase } from './purchases'
import { insertSaleReturn } from './sale-returns'
import { insertStockCount } from './stock-counts'
import { insertExpense } from './expenses'

function fixtureValues(now: number): Record<string, unknown> {
  return { created_at: now, updated_at: now, device_id: 'd1' }
}

describe('database repositories', () => {
  it('maps rows, rolls back transactions, and maintains atomic sequences', () => {
    expect(mapRow({ id: 'x', is_active: 1, nullable: null, display_name: 'Name' })).toEqual({
      id: 'x',
      isActive: true,
      nullable: null,
      displayName: 'Name',
    })
  })

  it('supports aggregate round trips and typed constraint errors', async () => {
    const root = join(tmpdir(), `small-shop-pos-repositories-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    const now = Date.now()
    const common = fixtureValues(now)

    expect(() => runInTransaction(context.database, (transaction) => {
      insertSetting(transaction, { key: 'locale', value: 'ar', value_type: 'string', description: null, ...common })
      throw new Error('rollback')
    })).toThrow('rollback')
    expect(context.database.prepare('SELECT COUNT(*) AS count FROM settings').get()).toEqual({ count: 0 })

    insertUser(context.database, { id: 'u1', username: 'cashier', display_name: 'Cashier', password_hash: 'hash', role: 'cashier', is_active: 1, ...common })
    expect(getUser(context.database, 'u1')).toMatchObject({ id: 'u1', isActive: true })
    expect(() => insertUser(context.database, { id: 'u2', username: 'cashier', display_name: 'Duplicate', password_hash: 'hash', role: 'cashier', is_active: 1, ...common })).toThrowError(
      expect.objectContaining({ code: 'constraint_unique' }),
    )

    insertProduct(context.database, {
      id: 'p1', sku: 'SKU-1', name: 'Product', category_id: null, base_unit_name: 'piece', qty_scale: 0,
      price_unit_qty_base: 1, cost_price_piasters: 100, selling_price_piasters: 150, tax_rate_bps: 0,
      track_expiry: 0, is_weighted: 0, low_stock_threshold_qty: 0, metadata: null, ...common,
    })
    expect(getProduct(context.database, 'p1')).toMatchObject({ id: 'p1', trackExpiry: false, isWeighted: false })
    insertCustomer(context.database, { id: 'c1', name: 'Customer', phone: null, address: null, credit_limit_piasters: null, metadata: null, ...common })
    insertSupplier(context.database, { id: 's1', name: 'Supplier', phone: null, address: null, metadata: null, ...common })
    insertShift(context.database, { id: 'sh1', user_id: 'u1', opened_at: now, opening_cash_piasters: 0, expected_cash_piasters: 0, counted_cash_piasters: null, difference_piasters: null, status: 'open', closing_notes: null, ...common })
    expect(getOpenShift(context.database, 'd1')).toMatchObject({ id: 'sh1' })
    insertStockMovement(context.database, { id: 'm1', product_id: 'p1', batch_id: null, qty_delta: 2, value_delta_piasters: 200, movement_type: 'purchase', reverses_movement_id: null, reference_type: null, reference_id: null, occurred_at: now, reason: null, created_by_user_id: 'u1', ...common })
    expect(getOnHand(context.database, 'p1')).toEqual({ qty: 2, valuePiasters: 200 })

    insertSale(context.database, { id: 'sale1', invoice_number: '1', customer_id: null, user_id: 'u1', shift_id: 'sh1', subtotal_piasters: 0, line_discount_piasters: 0, invoice_discount_piasters: 0, tax_piasters: 0, rounding_adjustment_piasters: 0, total_piasters: 0, paid_piasters: 0, due_piasters: 0, payment_status: 'paid', status: 'completed', ...common })
    insertMoneyLedgerEntry(context.database, { id: 'l1', entry_type: 'cash_in', direction: 'in', amount_piasters: 1, payment_method: 'cash', customer_id: null, supplier_id: null, sale_id: null, reference_type: null, reference_id: null, reverses_entry_id: null, shift_id: 'sh1', reference_text: null, tendered_piasters: null, change_piasters: null, occurred_at: now, user_id: 'u1', ...common })
    insertHeldSale(context.database, { id: 'h1', label: null, user_id: 'u1', shift_id: 'sh1', customer_id: null, payload_json: '{}', held_at: now, ...common })
    insertAuditLog(context.database, { id: 'a1', occurred_at: now, user_id: 'u1', action: 'test', entity_type: 'product', entity_id: 'p1', changed_fields_json: null, before_json: null, after_json: null, reason: null, ...common })
    insertPurchase(context.database, { id: 'pur1', purchase_number: '1', supplier_id: 's1', user_id: 'u1', total_piasters: 0, paid_piasters: 0, due_piasters: 0, payment_status: 'paid', status: 'completed', ...common })
    insertSaleReturn(context.database, { id: 'ret1', return_number: '1', original_sale_id: 'sale1', customer_id: null, user_id: 'u1', shift_id: 'sh1', total_piasters: 0, cash_refunded_piasters: 0, credited_to_account_piasters: 0, status: 'completed', ...common })
    insertStockCount(context.database, { id: 'count1', status: 'draft', started_at: now, posted_at: null, user_id: 'u1', notes: null, ...common })
    insertExpense(context.database, { id: 'exp1', category: 'misc', description: 'Test', amount_piasters: 1, payment_method: 'cash', expense_at: now, user_id: 'u1', shift_id: 'sh1', status: 'posted', ...common })
    expect(nextSequenceNumber(context.database, 'd1', 'sale_invoice')).toBe(1)
    expect(nextSequenceNumber(context.database, 'd1', 'sale_invoice')).toBe(2)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
