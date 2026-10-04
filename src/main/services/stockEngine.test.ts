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

  it('handles zero-value on-hand costing: vector (5 qty, 0 value, sell 2 @ 100 default cost) -> 0 cost', async () => {
    // Hand-checked arithmetic:
    // On-hand: qty = 5, value = 0 (e.g. promotional/free stock).
    // Selling 2 pieces: because on-hand qty > 0 with 0 value, weighted-average cost is 0 piasters.
    // Cost removed = 0, leaving on-hand qty = 3, value = 0.
    const root = join(tmpdir(), `small-shop-pos-stock-zero-cost-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seed(context.database)
    const dependencies = { ids: ids(), clock, allowNegativeStock: true }

    // Seed 5 units @ 0 value
    applyMovement(context.database, dependencies, { productId: 'p1', qtyDelta: 5, movementType: 'purchase', valuePiasters: 0, userId: 'u1', deviceId: 'd1' })

    // Sell 2 units
    const saleResult = applyMovement(context.database, dependencies, { productId: 'p1', qtyDelta: -2, movementType: 'sale', userId: 'u1', deviceId: 'd1' })
    expect(saleResult.ok).toBe(true)
    if (saleResult.ok) {
      expect(saleResult.value.costPiasters).toBe(0)
    }

    const onHand = context.database.prepare('SELECT COALESCE(SUM(qty_delta),0) AS qty, COALESCE(SUM(value_delta_piasters),0) AS value FROM stock_movements WHERE product_id = ?').get('p1') as { qty: number; value: number }
    expect(onHand.qty).toBe(3)
    expect(onHand.value).toBe(0)

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('settles negative stock when crossing zero on incoming purchase', async () => {
    // Hand-checked arithmetic:
    // 1. Initial on-hand = 0.
    // 2. Sell 5 units (default product cost 100) -> on-hand qty = -5, value = -500.
    // 3. Purchase 10 units @ 120 piasters = 1200 piasters.
    //    Crossing from -5 to +5.
    //    Settlement for -5 units at incoming unit cost 120 = -600 piasters.
    //    Previous recorded cost = -500 piasters.
    //    Revaluation variance = -500 - (-600) = -100 piasters.
    //    Total on-hand after purchase + settlement:
    //    qty = -5 + 10 = 5.
    //    value = -500 + 1200 - 100 = 600 piasters (exact 5 * 120).
    const root = join(tmpdir(), `small-shop-pos-stock-settlement-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seed(context.database)
    const dependencies = { ids: ids(), clock, allowNegativeStock: true }

    // Outgoing sale into negative stock
    const saleResult = applyMovement(context.database, dependencies, { productId: 'p1', qtyDelta: -5, movementType: 'sale', userId: 'u1', deviceId: 'd1' })
    expect(saleResult.ok).toBe(true)

    // Incoming purchase crossing negative stock
    const purchaseResult = applyMovement(context.database, dependencies, { productId: 'p1', qtyDelta: 10, movementType: 'purchase', valuePiasters: 1200, userId: 'u1', deviceId: 'd1' })
    expect(purchaseResult.ok).toBe(true)
    if (purchaseResult.ok) {
      expect(purchaseResult.value.revaluationRows.length).toBe(1)
      const revRow = context.database.prepare('SELECT value_delta_piasters FROM stock_movements WHERE id = ?').get(purchaseResult.value.revaluationRows[0]) as { value_delta_piasters: number }
      expect(revRow.value_delta_piasters).toBe(-100)
    }

    const onHand = context.database.prepare('SELECT COALESCE(SUM(qty_delta),0) AS qty, COALESCE(SUM(value_delta_piasters),0) AS value FROM stock_movements WHERE product_id = ?').get('p1') as { qty: number; value: number }
    expect(onHand.qty).toBe(5)
    expect(onHand.value).toBe(600)

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects insufficient stock when negative stock is disabled and rolls back', async () => {
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

  it('maintains invariants through a randomized sequence with verifyDatabase checks', async () => {
    const root = join(tmpdir(), `small-shop-pos-stock-random-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seed(context.database)
    const dependencies = { ids: ids(), clock, allowNegativeStock: true }

    // Seeded pseudo-random PRNG
    let seedVal = 42
    function next(max: number): number {
      seedVal = (seedVal * 1664525 + 1013904223) % 4294967296
      return Math.floor((seedVal / 4294967296) * max)
    }

    const { verifyDatabase } = await import('../database/db-verify')

    for (let i = 0; i < 50; i++) {
      const isIncoming = next(2) === 0
      const qty = next(10) + 1
      if (isIncoming) {
        const unitCost = next(100) + 50
        applyMovement(context.database, dependencies, {
          productId: 'p1',
          qtyDelta: qty,
          movementType: 'purchase',
          valuePiasters: qty * unitCost,
          userId: 'u1',
          deviceId: 'd1',
        })
      } else {
        applyMovement(context.database, dependencies, {
          productId: 'p1',
          qtyDelta: -qty,
          movementType: 'sale',
          userId: 'u1',
          deviceId: 'd1',
        })
      }
      const report = verifyDatabase(context.database)
      expect(report.ok).toBe(true)
    }

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
