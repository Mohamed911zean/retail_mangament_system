import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from './database'

function seed(database: ReturnType<typeof openDatabase> extends Promise<infer Context>
  ? Context extends { database: infer Db } ? Db : never
  : never): void {
  const now = Date.now()
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','u1','User','hash','owner',1,${now},${now},'d1');
    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p1','Product','piece',0,1,100,100,0,0,${now},${now},'d1');
    INSERT INTO shifts (id,user_id,opened_at,opening_cash_piasters,status,created_at,updated_at,device_id)
    VALUES ('sh1','u1',${now},0,'open',${now},${now},'d1');
    INSERT INTO sales (id,invoice_number,user_id,subtotal_piasters,line_discount_piasters,invoice_discount_piasters,tax_piasters,total_piasters,paid_piasters,due_piasters,payment_status,status,created_at,updated_at,device_id)
    VALUES ('s1','000001','u1',100,0,0,0,100,100,0,'paid','completed',${now},${now},'d1');
    INSERT INTO sale_items (id,sale_id,product_id,unit_name_snapshot,priced_unit_qty_base,qty_base,unit_price_piasters,line_subtotal_piasters,line_discount_piasters,invoice_discount_allocated_piasters,tax_rate_bps_snapshot,tax_piasters,final_line_total_piasters,line_cost_piasters,product_name_snapshot,created_at,updated_at,device_id)
    VALUES ('si1','s1','p1','piece',1,1,100,100,0,0,0,0,100,100,'Product',${now},${now},'d1');
    INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('m1','p1',1,100,'purchase',${now},'u1',${now},${now},'d1');
    INSERT INTO money_ledger (id,entry_type,direction,amount_piasters,payment_method,sale_id,occurred_at,user_id,created_at,updated_at,device_id)
    VALUES ('ml1','sale_payment','in',100,'cash','s1',${now},'u1',${now},${now},'d1');
    INSERT INTO audit_log (id,occurred_at,action,entity_type,entity_id,device_id,created_at)
    VALUES ('a1',${now},'test','sale','s1','d1',${now});
  `)
}

describe('append-only and guarded triggers', () => {
  it('blocks immutable table updates and deletes with stable codes', async () => {
    const root = join(tmpdir(), `small-shop-pos-trigger-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seed(context.database)
    const statements = [
      ["UPDATE stock_movements SET reason = 'x' WHERE id = 'm1'", 'immutable_stock_movement_update'],
      ["DELETE FROM stock_movements WHERE id = 'm1'", 'immutable_stock_movement_delete'],
      ["UPDATE money_ledger SET reference_text = 'x' WHERE id = 'ml1'", 'immutable_money_ledger_update'],
      ["DELETE FROM money_ledger WHERE id = 'ml1'", 'immutable_money_ledger_delete'],
      ["UPDATE audit_log SET reason = 'x' WHERE id = 'a1'", 'immutable_audit_log_update'],
      ["DELETE FROM audit_log WHERE id = 'a1'", 'immutable_audit_log_delete'],
      ["UPDATE sale_items SET product_name_snapshot = 'x' WHERE id = 'si1'", 'immutable_sale_item_update'],
      ["DELETE FROM sale_items WHERE id = 'si1'", 'immutable_sale_item_delete'],
    ] as const
    for (const [sql, code] of statements) {
      expect(() => context.database.exec(sql)).toThrow(code)
    }
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('allows only guarded document columns and rejects other changes', async () => {
    const root = join(tmpdir(), `small-shop-pos-guard-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seed(context.database)
    expect(() => context.database.prepare("UPDATE sales SET status = 'voided', updated_at = ? WHERE id = 's1'").run(Date.now())).toThrow('void_requires_metadata')
    context.database.prepare("UPDATE sales SET status = 'voided', updated_at = ?, voided_at = ?, voided_by_user_id = 'u1', void_reason = 'test' WHERE id = 's1'").run(Date.now(), Date.now())
    expect(context.database.prepare("SELECT status FROM sales WHERE id = 's1'").get()).toEqual({ status: 'voided' })
    expect(() => context.database.exec("UPDATE sales SET total_piasters = 99 WHERE id = 's1'")).toThrow('guarded_sales_update')
    expect(() => context.database.exec("DELETE FROM sales WHERE id = 's1'")).toThrow('immutable_sales_delete')
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('covers hardening triggers for voids, expenses, counts, and payment status', async () => {
    const root = join(tmpdir(), `small-shop-pos-hardening-trigger-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seed(context.database)
    const now = Date.now()
    context.database.exec(`
      INSERT INTO expenses (id,category,description,amount_piasters,payment_method,expense_at,user_id,shift_id,status,created_at,updated_at,device_id)
      VALUES ('e1','misc','Test',1,'cash',${now},'u1','sh1','posted',${now},${now},'d1');
      INSERT INTO stock_counts (id,status,started_at,user_id,created_at,updated_at,device_id)
      VALUES ('sc1','draft',${now},'u1',${now},${now},'d1');
      INSERT INTO stock_count_items (id,stock_count_id,product_id,expected_qty_base,counted_qty_base,difference_qty_base,created_at,updated_at,device_id)
      VALUES ('sci1','sc1','p1',1,1,0,${now},${now},'d1');
      INSERT INTO purchases (id,purchase_number,user_id,total_piasters,paid_piasters,due_piasters,payment_status,status,created_at,updated_at,device_id)
      VALUES ('pur1','000001','u1',1,1,0,'paid','completed',${now},${now},'d1');
      INSERT INTO purchase_items (id,purchase_id,product_id,unit_name_snapshot,priced_unit_qty_base,qty_base,unit_cost_piasters,line_subtotal_piasters,tax_rate_bps_snapshot,tax_piasters,line_total_piasters,created_at,updated_at,device_id)
      VALUES ('puri1','pur1','p1','piece',1,1,1,1,0,0,1,${now},${now},'d1');
      INSERT INTO sale_returns (id,return_number,original_sale_id,user_id,total_piasters,cash_refunded_piasters,credited_to_account_piasters,status,created_at,updated_at,device_id)
      VALUES ('ret1','000001','s1','u1',1,1,0,'completed',${now},${now},'d1');
      INSERT INTO sale_return_items (id,sale_return_id,sale_item_id,product_id,qty_base,refund_piasters,condition,created_at,updated_at,device_id)
      VALUES ('reti1','ret1','si1','p1',1,1,'damaged',${now},${now},'d1');
    `)
    expect(() => context.database.exec("UPDATE expenses SET description = 'x' WHERE id = 'e1'")).toThrow('guarded_expenses_update')
    expect(() => context.database.prepare("UPDATE expenses SET status = 'voided', updated_at = ? WHERE id = 'e1'").run(now)).toThrow('void_requires_metadata')
    context.database.prepare("UPDATE expenses SET status = 'voided', voided_at = ?, voided_by_user_id = 'u1', void_reason = ?, updated_at = ? WHERE id = 'e1'").run(now, 'test', now)
    expect(() => context.database.exec("UPDATE expenses SET status = 'posted' WHERE id = 'e1'")).toThrow('void_is_final')
    expect(() => context.database.exec("DELETE FROM expenses WHERE id = 'e1'")).toThrow('immutable_expenses_delete')
    expect(() => context.database.exec("DELETE FROM stock_counts WHERE id = 'sc1'")).toThrow('immutable_stock_counts_delete')
    context.database.prepare("UPDATE stock_counts SET notes = 'ok', updated_at = ? WHERE id = 'sc1'").run(now)
    context.database.prepare("UPDATE stock_counts SET status = 'posted', posted_at = ?, updated_at = ? WHERE id = 'sc1'").run(now, now)
    expect(() => context.database.exec("UPDATE stock_count_items SET counted_qty_base = 2 WHERE id = 'sci1'")).toThrow('immutable_posted_stock_count_item')
    expect(() => context.database.exec("DELETE FROM stock_count_items WHERE id = 'sci1'")).toThrow('immutable_posted_stock_count_item')
    expect(() => context.database.exec("UPDATE purchase_items SET line_total_piasters = 2 WHERE id = 'puri1'")).toThrow('immutable_purchase_item_update')
    expect(() => context.database.exec("DELETE FROM purchase_items WHERE id = 'puri1'")).toThrow('immutable_purchase_item_delete')
    expect(() => context.database.exec("UPDATE sale_return_items SET refund_piasters = 2 WHERE id = 'reti1'")).toThrow('immutable_sale_return_item_update')
    expect(() => context.database.exec("DELETE FROM sale_return_items WHERE id = 'reti1'")).toThrow('immutable_sale_return_item_delete')
    expect(() => context.database.prepare("UPDATE purchases SET status = 'voided', updated_at = ? WHERE id = 'pur1'").run(now)).toThrow('void_requires_metadata')
    context.database.prepare("UPDATE purchases SET status = 'voided', voided_at = ?, voided_by_user_id = 'u1', void_reason = ?, updated_at = ? WHERE id = 'pur1'").run(now, 'test', now)
    expect(() => context.database.exec("UPDATE purchases SET status = 'completed' WHERE id = 'pur1'")).toThrow('void_is_final')
    expect(() => context.database.prepare("UPDATE sale_returns SET status = 'voided', updated_at = ? WHERE id = 'ret1'").run(now)).toThrow('void_requires_metadata')
    context.database.prepare("UPDATE sale_returns SET status = 'voided', voided_at = ?, voided_by_user_id = 'u1', void_reason = ?, updated_at = ? WHERE id = 'ret1'").run(now, 'test', now)
    expect(() => context.database.exec("UPDATE sale_returns SET status = 'completed' WHERE id = 'ret1'")).toThrow('void_is_final')
    expect(() => context.database.exec("DELETE FROM purchases WHERE id = 'pur1'")).toThrow('immutable_purchases_delete')
    expect(() => context.database.exec("DELETE FROM sale_returns WHERE id = 'ret1'")).toThrow('immutable_sale_returns_delete')
    expect(() => context.database.exec("INSERT INTO sales (id,invoice_number,user_id,subtotal_piasters,line_discount_piasters,invoice_discount_piasters,tax_piasters,total_piasters,paid_piasters,due_piasters,payment_status,status,created_at,updated_at,device_id) VALUES ('s2','000002','u1',1,0,0,0,1,1,0,'credit','completed',1,1,'d1')")).toThrow('payment_status_mismatch')
    expect(() => context.database.exec("INSERT INTO purchases (id,purchase_number,user_id,total_piasters,paid_piasters,due_piasters,payment_status,status,created_at,updated_at,device_id) VALUES ('pur2','000002','u1',1,1,0,'credit','completed',1,1,'d1')")).toThrow('payment_status_mismatch')
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
