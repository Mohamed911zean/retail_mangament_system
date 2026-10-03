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
    context.database.prepare("UPDATE sales SET status = 'voided', updated_at = ? WHERE id = 's1'").run(Date.now())
    expect(context.database.prepare("SELECT status FROM sales WHERE id = 's1'").get()).toEqual({ status: 'voided' })
    expect(() => context.database.exec("UPDATE sales SET total_piasters = 99 WHERE id = 's1'")).toThrow('guarded_sales_update')
    expect(() => context.database.exec("DELETE FROM sales WHERE id = 's1'")).toThrow('immutable_sales_delete')
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
