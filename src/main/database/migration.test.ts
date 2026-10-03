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
    expect(second.database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 7 })
    const triggers = second.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all() as { name: string }[]
    expect(triggers.map((trigger) => trigger.name)).toEqual([
      'trg_audit_log_no_delete',
      'trg_audit_log_no_update',
      'trg_money_ledger_no_delete',
      'trg_money_ledger_no_update',
      'trg_purchase_items_no_delete',
      'trg_purchase_items_no_update',
      'trg_purchases_guarded_update',
      'trg_purchases_no_delete',
      'trg_sale_items_no_delete',
      'trg_sale_items_no_update',
      'trg_sale_return_items_no_delete',
      'trg_sale_return_items_no_update',
      'trg_sale_returns_guarded_update',
      'trg_sale_returns_no_delete',
      'trg_sales_guarded_update',
      'trg_sales_no_delete',
      'trg_stock_movements_no_delete',
      'trg_stock_movements_no_update',
    ])
    closeDatabase(second)
    rmSync(root, { recursive: true, force: true })
  })
})
