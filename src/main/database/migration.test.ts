import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from './database'

describe('Phase 1 migrations', () => {
  it('migrates every schema slice into STRICT tables', async () => {
    const root = join(tmpdir(), `small-shop-pos-migration-${Date.now()}`)
    const userData = join(root, 'user-data')
    mkdirSync(root, { recursive: true })
    const first = await openDatabase(userData, join(process.cwd(), 'migrations'))
    const tables = first.database
      .prepare("SELECT name, strict FROM pragma_table_list WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string; strict: number }[]
    const expected = [
      'audit_log',
      'barcodes',
      'categories',
      'customers',
      'device_sequences',
      'expenses',
      'held_sales',
      'money_ledger',
      'product_units',
      'products',
      'purchase_items',
      'purchases',
      'sale_items',
      'sale_return_items',
      'sale_returns',
      'sales',
      'schema_migrations',
      'settings',
      'shifts',
      'stock_batches',
      'stock_count_items',
      'stock_counts',
      'stock_movements',
      'suppliers',
      'users',
    ]
    expect(tables.map((table) => table.name)).toEqual(expected)
    expect(tables.every((table) => table.strict === 1)).toBe(true)
    expect(first.database.pragma('foreign_key_check')).toEqual([])
    expect(first.database.pragma('integrity_check', { simple: true })).toBe('ok')
    closeDatabase(first)

    const second = await openDatabase(userData, join(process.cwd(), 'migrations'))
    expect(second.database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 8 })
    const triggers = second.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all() as { name: string }[]
    expect(triggers.map((trigger) => trigger.name)).toEqual([
      'trg_audit_log_no_delete',
      'trg_audit_log_no_update',
      'trg_expenses_guarded_update',
      'trg_expenses_no_delete',
      'trg_expenses_void_is_final',
      'trg_expenses_void_requires_metadata',
      'trg_money_ledger_no_delete',
      'trg_money_ledger_no_update',
      'trg_purchase_items_no_delete',
      'trg_purchase_items_no_update',
      'trg_purchases_guarded_update',
      'trg_purchases_no_delete',
      'trg_purchases_payment_status_insert',
      'trg_purchases_void_is_final',
      'trg_purchases_void_requires_metadata',
      'trg_sale_items_no_delete',
      'trg_sale_items_no_update',
      'trg_sale_return_items_no_delete',
      'trg_sale_return_items_no_update',
      'trg_sale_returns_guarded_update',
      'trg_sale_returns_no_delete',
      'trg_sale_returns_void_is_final',
      'trg_sale_returns_void_requires_metadata',
      'trg_sales_guarded_update',
      'trg_sales_no_delete',
      'trg_sales_payment_status_insert',
      'trg_sales_void_is_final',
      'trg_sales_void_requires_metadata',
      'trg_stock_count_items_no_delete',
      'trg_stock_count_items_posted_immutable',
      'trg_stock_counts_guarded_update',
      'trg_stock_counts_no_delete',
      'trg_stock_movements_no_delete',
      'trg_stock_movements_no_update',
    ])
    const indexes = second.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
    expect(indexes.map((index) => index.name)).toEqual([
      'ix_audit_log_entity',
      'ix_barcodes_product_id',
      'ix_barcodes_product_unit_id',
      'ix_expenses_shift_id',
      'ix_expenses_user_id',
      'ix_held_sales_customer_id',
      'ix_held_sales_shift_id',
      'ix_held_sales_user_id',
      'ix_money_ledger_customer_id',
      'ix_money_ledger_occurred_at',
      'ix_money_ledger_sale_id',
      'ix_money_ledger_shift_id',
      'ix_money_ledger_supplier_id',
      'ix_product_units_product_id',
      'ix_products_category_id',
      'ix_purchase_items_product_id',
      'ix_purchase_items_purchase_id',
      'ix_purchases_supplier_id',
      'ix_sale_items_product_id',
      'ix_sale_items_sale_id',
      'ix_sale_return_items_product_id',
      'ix_sale_return_items_return_id',
      'ix_sale_return_items_sale_item_id',
      'ix_sale_returns_customer_id',
      'ix_sale_returns_original_sale_id',
      'ix_sale_returns_shift_id',
      'ix_sales_created_at',
      'ix_sales_customer_id',
      'ix_sales_shift_id',
      'ix_sales_user_id',
      'ix_shifts_user_id',
      'ix_stock_batches_product_id',
      'ix_stock_count_items_count_id',
      'ix_stock_count_items_product_id',
      'ix_stock_counts_user_id',
      'ix_stock_movements_batch_id',
      'ix_stock_movements_occurred_at',
      'ix_stock_movements_product_id',
      'ix_stock_movements_reference',
      'ux_barcodes_active_normalized',
      'ux_money_ledger_reversal',
      'ux_open_shift_per_device',
      'ux_products_active_sku',
      'ux_stock_movement_reversal',
    ])
    closeDatabase(second)
    rmSync(root, { recursive: true, force: true })
  })
})
