import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { applyMovement } from './stockEngine'
import type { Clock } from './clock'
import type { IdGenerator } from './ids'

const clock: Clock = { now: () => 1700000000000 }
function ids(): IdGenerator {
  let index = 0
  return { next: () => `01STOCK${String(++index).padStart(19, '0')}` }
}

function seed(database: ReturnType<typeof openDatabase> extends Promise<infer C> ? C extends { database: infer D } ? D : never : never): void {
  const now = clock.now()
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','owner','Owner','hash','owner',1,${now},${now},'d1');
    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p1','Product','piece',0,1,100,100,0,0,${now},${now},'d1');
  `)
}

describe('stock engine', () => {
  it('applies exact purchase/sale/void normalization vectors transactionally', async () => {
    const root = join(tmpdir(), `small-shop-pos-stock-engine-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seed(context.database)
    const dependencies = { ids: ids(), clock, allowNegativeStock: true }
    expect(applyMovement(context.database, dependencies, { productId: 'p1', qtyDelta: 5, movementType: 'purchase', valuePiasters: 500, userId: 'u1', deviceId: 'd1' }).ok).toBe(true)
    const sale = applyMovement(context.database, dependencies, { productId: 'p1', qtyDelta: -5, movementType: 'sale', userId: 'u1', deviceId: 'd1' })
    expect(sale).toMatchObject({ ok: true, value: { costPiasters: 500 } })
    const voided = applyMovement(context.database, dependencies, { productId: 'p1', qtyDelta: -5, movementType: 'void_compensation', valuePiasters: -500, userId: 'u1', deviceId: 'd1' })
    expect(voided.ok).toBe(true)
    const onHand = context.database.prepare('SELECT COALESCE(SUM(qty_delta),0) AS qty, COALESCE(SUM(value_delta_piasters),0) AS value FROM stock_movements WHERE product_id = ?').get('p1')
    expect(onHand).toEqual({ qty: -5, value: -500 })
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects insufficient stock when negative stock is disabled', async () => {
    const root = join(tmpdir(), `small-shop-pos-stock-engine-reject-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seed(context.database)
    const before = context.database.prepare('SELECT COUNT(*) AS count FROM stock_movements').get()
    const result = applyMovement(context.database, { ids: ids(), clock, allowNegativeStock: false }, {
      productId: 'p1', qtyDelta: -1, movementType: 'sale', userId: 'u1', deviceId: 'd1',
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'insufficient_stock' } })
    expect(context.database.prepare('SELECT COUNT(*) AS count FROM stock_movements').get()).toEqual(before)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
