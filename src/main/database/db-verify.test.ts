import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDatabase, closeDatabase } from './database'
import { getBalances, verifyDatabase } from './db-verify'

function seedConsistentDatabase(database: Database.Database): void {
  const now = 1700000000000
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','owner1','Owner','hash','owner',1,${now},${now},'d1');

    INSERT INTO customers (id,name,phone,address,credit_limit_piasters,metadata,created_at,updated_at,device_id)
    VALUES ('c1','Customer 1',NULL,NULL,100000,NULL,${now},${now},'d1');

    INSERT INTO suppliers (id,name,phone,address,metadata,created_at,updated_at,device_id)
    VALUES ('s1','Supplier 1',NULL,NULL,NULL,${now},${now},'d1');

    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p1','Product 1','piece',0,1,100,150,0,0,${now},${now},'d1');

    INSERT INTO shifts (id,user_id,opened_at,closed_at,opening_cash_piasters,expected_cash_piasters,counted_cash_piasters,difference_piasters,status,created_at,updated_at,device_id)
    VALUES ('sh1','u1',${now},${now + 1000},0,150,150,0,'closed',${now},${now},'d1');

    -- Purchase of 10 units @ 100 piasters = 1000
    INSERT INTO purchases (id,purchase_number,supplier_id,user_id,total_piasters,paid_piasters,due_piasters,payment_status,status,created_at,updated_at,device_id)
    VALUES ('pur1','PUR-001','s1','u1',1000,1000,0,'paid','completed',${now},${now},'d1');

    INSERT INTO purchase_items (id,purchase_id,product_id,unit_name_snapshot,priced_unit_qty_base,qty_base,unit_cost_piasters,line_subtotal_piasters,tax_rate_bps_snapshot,tax_piasters,line_total_piasters,created_at,updated_at,device_id)
    VALUES ('pi1','pur1','p1','piece',1,10,100,1000,0,0,1000,${now},${now},'d1');

    INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,reference_type,reference_id,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('sm_pur1','p1',10,1000,'purchase','purchase','pur1',${now},'u1',${now},${now},'d1');

    INSERT INTO money_ledger (id,entry_type,direction,amount_piasters,payment_method,supplier_id,reference_type,reference_id,occurred_at,user_id,created_at,updated_at,device_id)
    VALUES ('ml_pur1','purchase_payment','out',1000,'cash','s1','purchase','pur1',${now},'u1',${now},${now},'d1');

    -- Sale of 1 unit @ 150 piasters, cost = 100
    INSERT INTO sales (id,invoice_number,customer_id,user_id,shift_id,subtotal_piasters,line_discount_piasters,invoice_discount_piasters,tax_piasters,rounding_adjustment_piasters,total_piasters,paid_piasters,due_piasters,payment_status,status,created_at,updated_at,device_id)
    VALUES ('sale1','INV-001','c1','u1','sh1',150,0,0,0,0,150,150,0,'paid','completed',${now},${now},'d1');

    INSERT INTO sale_items (id,sale_id,product_id,unit_name_snapshot,priced_unit_qty_base,qty_base,unit_price_piasters,line_subtotal_piasters,line_discount_piasters,invoice_discount_allocated_piasters,tax_rate_bps_snapshot,tax_piasters,final_line_total_piasters,line_cost_piasters,product_name_snapshot,created_at,updated_at,device_id)
    VALUES ('si1','sale1','p1','piece',1,1,150,150,0,0,0,0,150,100,'Product 1',${now},${now},'d1');

    INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,reference_type,reference_id,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('sm_sale1','p1',-1,-100,'sale','sale','sale1',${now},'u1',${now},${now},'d1');

    INSERT INTO money_ledger (id,entry_type,direction,amount_piasters,payment_method,customer_id,sale_id,reference_type,reference_id,shift_id,occurred_at,user_id,created_at,updated_at,device_id)
    VALUES ('ml_sale1','sale_payment','in',150,'cash','c1','sale1','sale','sale1','sh1',${now},'u1',${now},${now},'d1');
  `)
}

describe('db:verify comprehensive suite', () => {
  it('passes a fully consistent database fixture and returns typed balance snapshots', async () => {
    const root = join(tmpdir(), `small-shop-pos-verify-clean-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seedConsistentDatabase(context.database)

    const report = verifyDatabase(context.database)
    expect(report.ok).toBe(true)
    expect(report.errors).toEqual([])

    const balances = getBalances(context.database)
    expect(balances.customers.length).toBe(1)
    expect(balances.customers[0]).toEqual({ customerId: 'c1', balancePiasters: 0, status: 'settled' })
    expect(balances.suppliers.length).toBe(1)
    expect(balances.suppliers[0]).toEqual({ supplierId: 's1', balancePiasters: 0, status: 'settled' })

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('detects and reports every verification code when corrupted', async () => {
    const root = join(tmpdir(), `small-shop-pos-verify-corrupted-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    const db = context.database
    seedConsistentDatabase(db)

    // 1. missing_append_only_trigger
    db.exec('DROP TRIGGER trg_stock_movements_no_update')
    db.exec('DROP TRIGGER trg_stock_movements_no_delete')
    db.exec('DROP TRIGGER trg_sales_guarded_update')
    db.exec('DROP TRIGGER trg_sales_payment_status_insert')
    db.exec('DROP TRIGGER trg_purchases_guarded_update')
    db.exec('DROP TRIGGER trg_expenses_guarded_update')
    db.exec('DROP TRIGGER trg_sale_returns_guarded_update')
    db.exec('DROP TRIGGER trg_money_ledger_no_update')
    db.exec('DROP TRIGGER trg_money_ledger_no_delete')
    db.exec('DROP TRIGGER trg_sale_items_no_update')
    db.exec('DROP TRIGGER trg_sale_items_no_delete')
    db.exec('DROP TRIGGER trg_sale_return_items_no_update')
    db.exec('DROP TRIGGER trg_sale_return_items_no_delete')

    const triggerReport = verifyDatabase(db)
    expect(triggerReport.errors.some((e) => e.code === 'missing_append_only_trigger')).toBe(true)

    // 2. stock_invariant_zero_value (qty == 0, value != 0)
    db.prepare("UPDATE stock_movements SET qty_delta = 1, value_delta_piasters = 200 WHERE id = 'sm_pur1'").run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'stock_invariant_zero_value')).toBe(true)
    db.prepare("UPDATE stock_movements SET qty_delta = 10, value_delta_piasters = 1000 WHERE id = 'sm_pur1'").run()

    // 3. stock_invariant_negative_value (qty > 0, value < 0)
    db.prepare("UPDATE stock_movements SET value_delta_piasters = -100 WHERE id = 'sm_pur1'").run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'stock_invariant_negative_value')).toBe(true)
    db.prepare("UPDATE stock_movements SET value_delta_piasters = 1000 WHERE id = 'sm_pur1'").run()

    // 4. sale_total_mismatch (item_total does not match total)
    db.prepare("UPDATE sale_items SET line_subtotal_piasters = 200, final_line_total_piasters = 200 WHERE id = 'si1'").run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'sale_total_mismatch')).toBe(true)
    db.prepare("UPDATE sale_items SET line_subtotal_piasters = 150, final_line_total_piasters = 150 WHERE id = 'si1'").run()

    // 5. sale_paid_due_mismatch
    // Recreate sales table without CHECK constraint to test corrupted paid/due state
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE sales_corrupt (
        id TEXT PRIMARY KEY, invoice_number TEXT, customer_id TEXT, user_id TEXT, shift_id TEXT,
        subtotal_piasters INTEGER, line_discount_piasters INTEGER, invoice_discount_piasters INTEGER,
        tax_piasters INTEGER, rounding_adjustment_piasters INTEGER, total_piasters INTEGER,
        paid_piasters INTEGER, due_piasters INTEGER, payment_status TEXT, status TEXT,
        voided_at INTEGER, voided_by_user_id TEXT, void_reason TEXT, notes TEXT,
        created_at INTEGER, updated_at INTEGER, device_id TEXT
      );
      INSERT INTO sales_corrupt SELECT * FROM sales;
      DROP TABLE sales;
      ALTER TABLE sales_corrupt RENAME TO sales;
      PRAGMA foreign_keys = ON;
    `)
    db.prepare("UPDATE sales SET paid_piasters = 100, due_piasters = 0 WHERE id = 'sale1'").run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'sale_paid_due_mismatch')).toBe(true)
    db.prepare("UPDATE sales SET paid_piasters = 150, due_piasters = 0 WHERE id = 'sale1'").run()

    // 6. document_ledger_mismatch (for sale)
    db.prepare("UPDATE money_ledger SET amount_piasters = 100 WHERE id = 'ml_sale1'").run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'document_ledger_mismatch')).toBe(true)
    db.prepare("UPDATE money_ledger SET amount_piasters = 150 WHERE id = 'ml_sale1'").run()

    // 7. document_stock_mismatch (for sale)
    db.prepare("UPDATE sale_items SET line_cost_piasters = 120 WHERE id = 'si1'").run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'document_stock_mismatch')).toBe(true)
    db.prepare("UPDATE sale_items SET line_cost_piasters = 100 WHERE id = 'si1'").run()

    // 8. shift_cash_mismatch
    db.prepare("UPDATE shifts SET expected_cash_piasters = 999 WHERE id = 'sh1'").run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'shift_cash_mismatch')).toBe(true)
    db.prepare("UPDATE shifts SET expected_cash_piasters = 150 WHERE id = 'sh1'").run()

    // 9. reversal_missing & reversal_sign (stock movements)
    db.exec('PRAGMA foreign_keys = OFF;')
    db.prepare(`
      INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,reverses_movement_id,occurred_at,created_by_user_id,created_at,updated_at,device_id)
      VALUES ('sm_rev_missing','p1',1,100,'void_compensation','non_existent',1700000000000,'u1',1700000000000,1700000000000,'d1')
    `).run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'reversal_missing')).toBe(true)
    db.prepare("DELETE FROM stock_movements WHERE id = 'sm_rev_missing'").run()
    db.exec('PRAGMA foreign_keys = ON;')

    db.prepare(`
      INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,reverses_movement_id,occurred_at,created_by_user_id,created_at,updated_at,device_id)
      VALUES ('sm_rev_bad_sign','p1',1,100,'void_compensation','sm_pur1',1700000000000,'u1',1700000000000,1700000000000,'d1')
    `).run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'reversal_sign')).toBe(true)
    db.prepare("DELETE FROM stock_movements WHERE id = 'sm_rev_bad_sign'").run()

    // 10. reversal_metadata_mismatch (money ledger)
    db.prepare(`
      INSERT INTO money_ledger (id,entry_type,direction,amount_piasters,payment_method,customer_id,reverses_entry_id,occurred_at,user_id,created_at,updated_at,device_id)
      VALUES ('ml_rev_bad_meta','sale_payment','out',150,'cash',NULL,'ml_sale1',1700000000000,'u1',1700000000000,1700000000000,'d1')
    `).run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'reversal_metadata_mismatch')).toBe(true)
    db.prepare("DELETE FROM money_ledger WHERE id = 'ml_rev_bad_meta'").run()

    // 11. return_total_mismatch, return_refund_mismatch, return_restock_mismatch
    db.exec(`
      INSERT INTO sale_returns (id,return_number,original_sale_id,customer_id,user_id,shift_id,total_piasters,cash_refunded_piasters,credited_to_account_piasters,status,created_at,updated_at,device_id)
      VALUES ('ret1','RET-001','sale1','c1','u1','sh1',150,150,0,'completed',1700000000000,1700000000000,'d1');

      INSERT INTO sale_return_items (id,sale_return_id,sale_item_id,product_id,qty_base,refund_piasters,condition,created_at,updated_at,device_id)
      VALUES ('sri1','ret1','si1','p1',1,100,'resalable',1700000000000,1700000000000,'d1');
    `)
    const returnErrors = verifyDatabase(db).errors
    expect(returnErrors.some((e) => e.code === 'return_total_mismatch')).toBe(true)
    expect(returnErrors.some((e) => e.code === 'return_refund_mismatch')).toBe(true)
    expect(returnErrors.some((e) => e.code === 'return_restock_mismatch')).toBe(true)

    // Fix return
    db.prepare("UPDATE sale_return_items SET refund_piasters = 150 WHERE id = 'sri1'").run()
    db.prepare(`
      INSERT INTO money_ledger (id,entry_type,direction,amount_piasters,payment_method,customer_id,reference_type,reference_id,shift_id,occurred_at,user_id,created_at,updated_at,device_id)
      VALUES ('ml_ret1','sale_return_refund','out',150,'cash','c1','sale_return','ret1','sh1',1700000000000,'u1',1700000000000,1700000000000,'d1')
    `).run()
    db.prepare(`
      INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,reference_type,reference_id,occurred_at,created_by_user_id,created_at,updated_at,device_id)
      VALUES ('sm_ret1','p1',1,100,'sale_return','sale_return','sri1',1700000000000,'u1',1700000000000,1700000000000,'d1')
    `).run()

    // 12. missing_void_compensation
    db.prepare("UPDATE sales SET status = 'voided' WHERE id = 'sale1'").run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'missing_void_compensation')).toBe(true)
    db.prepare("UPDATE sales SET status = 'completed' WHERE id = 'sale1'").run()

    // 13. db_foreign_key
    db.exec('PRAGMA foreign_keys = OFF;')
    db.prepare("UPDATE purchases SET supplier_id = 'non_existent' WHERE id = 'pur1'").run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'db_foreign_key')).toBe(true)
    db.prepare("UPDATE purchases SET supplier_id = 's1' WHERE id = 'pur1'").run()
    db.exec('PRAGMA foreign_keys = ON;')

    // 14. balance_mismatch and db_integrity
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE money_ledger_corrupt (
        id TEXT PRIMARY KEY, entry_type TEXT, direction TEXT, amount_piasters INTEGER,
        payment_method TEXT, customer_id TEXT, supplier_id TEXT, sale_id TEXT,
        reference_type TEXT, reference_id TEXT, reverses_entry_id TEXT, shift_id TEXT,
        reference_text TEXT, tendered_piasters INTEGER, change_piasters INTEGER,
        occurred_at INTEGER, user_id TEXT, created_at INTEGER, updated_at INTEGER, device_id TEXT
      );
      INSERT INTO money_ledger_corrupt SELECT * FROM money_ledger;
      DROP TABLE money_ledger;
      ALTER TABLE money_ledger_corrupt RENAME TO money_ledger;
      PRAGMA foreign_keys = ON;
    `)
    db.prepare(`
      INSERT INTO money_ledger (id,entry_type,direction,amount_piasters,payment_method,customer_id,occurred_at,user_id,created_at,updated_at,device_id)
      VALUES ('ml_overflow','customer_receipt','in',9007199254740992,'cash','c1',1700000000000,'u1',1700000000000,1700000000000,'d1')
    `).run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'balance_mismatch')).toBe(true)
    expect(() => getBalances(db)).toThrow()
    db.prepare("DELETE FROM money_ledger WHERE id = 'ml_overflow'").run()

    // 15. db_integrity (corrupted supplier calculation)
    db.prepare(`
      INSERT INTO money_ledger (id,entry_type,direction,amount_piasters,payment_method,supplier_id,occurred_at,user_id,created_at,updated_at,device_id)
      VALUES ('ml_sup_inv','supplier_payment','out',9007199254740992,'cash','s1',1700000000000,'u1',1700000000000,1700000000000,'d1')
    `).run()
    expect(verifyDatabase(db).errors.some((e) => e.code === 'db_integrity' || e.code === 'balance_mismatch')).toBe(true)
    db.prepare("DELETE FROM money_ledger WHERE id = 'ml_sup_inv'").run()

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
