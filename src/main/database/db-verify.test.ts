import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openDatabase, closeDatabase } from './database'
import { verifyDatabase } from './db-verify'

function seed(database: Database.Database): void {
  const now = Date.now()
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','u1','User','hash','owner',1,${now},${now},'d1');
    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p1','Product','piece',0,1,100,100,0,0,${now},${now},'d1');
    INSERT INTO shifts (id,user_id,opened_at,opening_cash_piasters,expected_cash_piasters,status,created_at,updated_at,device_id)
    VALUES ('sh1','u1',${now},0,0,'open',${now},${now},'d1');
    INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('m1','p1',1,100,'purchase',${now},'u1',${now},${now},'d1');
  `)
}

describe('db:verify', () => {
  it('passes a consistent fixture and reports corruption codes', async () => {
    const root = join(tmpdir(), `small-shop-pos-verify-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seed(context.database)
    expect(verifyDatabase(context.database)).toEqual({ ok: true, errors: [] })

    context.database.exec('DROP TRIGGER trg_stock_movements_no_update')
    context.database.prepare("UPDATE stock_movements SET value_delta_piasters = -100 WHERE id = 'm1'").run()
    const negative = verifyDatabase(context.database)
    expect(negative.errors.some((error) => error.code === 'stock_invariant_negative_value')).toBe(true)
    expect(negative.errors.some((error) => error.code === 'missing_append_only_trigger')).toBe(true)

    context.database.prepare("UPDATE stock_movements SET value_delta_piasters = 100 WHERE id = 'm1'").run()
    context.database.prepare("UPDATE shifts SET expected_cash_piasters = 99 WHERE id = 'sh1'").run()
    const cash = verifyDatabase(context.database)
    expect(cash.errors.some((error) => error.code === 'shift_cash_mismatch')).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
