import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { PurchaseService } from './purchases'
import { getBalances, verifyDatabase } from '../database/db-verify'
import type { Clock } from './clock'
import type { IdGenerator } from './ids'
import type { Actor } from './permissions'

const fixedClock: Clock = { now: () => 1700000000000 }
function testIds(): IdGenerator {
  let counter = 0
  return { next: () => `01PUR${String(++counter).padStart(21, '0')}` }
}

const managerActor: Actor = { userId: 'u1', role: 'manager', deviceId: 'd1' }
const cashierActor: Actor = { userId: 'u2', role: 'cashier', deviceId: 'd1' }

function setupPurchaseDb(database: ReturnType<typeof openDatabase> extends Promise<infer C> ? C extends { database: infer D } ? D : never : never) {
  const now = fixedClock.now()
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','manager','Manager','hash','manager',1,${now},${now},'d1'),
           ('u2','cashier','Cashier','hash','cashier',1,${now},${now},'d1');

    INSERT INTO suppliers (id,name,phone,address,metadata,created_at,updated_at,device_id)
    VALUES ('sup1','Primary Supplier',NULL,NULL,NULL,${now},${now},'d1');

    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p_milk','Milk Pack','piece',0,1,100,150,0,1,0,${now},${now},'d1'),
           ('p_cheese','Block Cheese','gram',3,1000,5000,8000,0,0,1,${now},${now},'d1');
  `)
}

describe('PurchaseService.receivePurchase', () => {
  it('rejects cashier receiving purchases', async () => {
    const root = join(tmpdir(), `small-shop-pos-pur-cashier-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupPurchaseDb(context.database)

    const service = new PurchaseService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: true,
    })

    const result = await service.receivePurchase(cashierActor, {
      supplierId: 'sup1',
      lines: [{ productId: 'p_milk', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 10, unitCostPiasters: 100 }],
      tenders: [{ method: 'cash', amountPiasters: 1000 }],
      taxEnabled: false,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('permission_denied')
    }

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('receives a zero-value purchase (gift / bonus stock)', async () => {
    // Hand-checked arithmetic:
    // 5 units @ 0 unit cost = 0 total piasters.
    // Tenders = []. Total = 0, paid = 0, due = 0.
    const root = join(tmpdir(), `small-shop-pos-pur-zeroval-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupPurchaseDb(context.database)

    const service = new PurchaseService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: true,
    })

    const result = await service.receivePurchase(managerActor, {
      supplierId: 'sup1',
      lines: [{ productId: 'p_milk', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 5, unitCostPiasters: 0 }],
      tenders: [],
      taxEnabled: false,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.purchase.totalPiasters).toBe(0)
      expect(result.value.purchase.paidPiasters).toBe(0)
      expect(result.value.purchase.duePiasters).toBe(0)
      expect(result.value.purchase.paymentStatus).toBe('paid')
    }

    const onHand = context.database.prepare('SELECT COALESCE(SUM(qty_delta),0) AS qty, COALESCE(SUM(value_delta_piasters),0) AS value FROM stock_movements WHERE product_id = ?').get('p_milk') as { qty: number; value: number }
    expect(onHand.qty).toBe(5)
    expect(onHand.value).toBe(0)

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('receives purchase with batches, expiry tracking, and partial cash payment', async () => {
    // Hand-checked arithmetic:
    // 20 units @ 100 = 2000 piasters.
    // Paid in cash: 1500 piasters. Due to supplier: 500 piasters.
    // Payment status: 'partial'.
    // Batch created with expiry: 1750000000000.
    const root = join(tmpdir(), `small-shop-pos-pur-batch-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupPurchaseDb(context.database)

    const service = new PurchaseService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: true,
    })

    const result = await service.receivePurchase(managerActor, {
      supplierId: 'sup1',
      lines: [{
        productId: 'p_milk',
        unitNameSnapshot: 'piece',
        pricedUnitQtyBase: 1,
        qtyBase: 20,
        unitCostPiasters: 100,
        batchCode: 'LOT-2026-A',
        expiryAt: 1750000000000,
        createBatch: true,
      }],
      tenders: [{ method: 'cash', amountPiasters: 1500 }],
      taxEnabled: false,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.purchase.totalPiasters).toBe(2000)
      expect(result.value.purchase.paidPiasters).toBe(1500)
      expect(result.value.purchase.duePiasters).toBe(500)
      expect(result.value.purchase.paymentStatus).toBe('partial')
    }

    const batches = context.database.prepare('SELECT * FROM stock_batches WHERE product_id = ?').all('p_milk')
    expect(batches.length).toBe(1)

    // Verify supplier balance is 500 payable
    const balances = getBalances(context.database)
    expect(balances.suppliers[0].balancePiasters).toBe(500)
    expect(balances.suppliers[0].status).toBe('payable')

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('settles negative stock revaluation when purchase crosses from negative stock', async () => {
    // Hand-checked arithmetic:
    // 1. Pre-seed -10 units @ default cost 100 -> on-hand = -10 qty, -1000 piasters.
    // 2. Receive purchase of 15 units @ 120 piasters = 1800 piasters.
    // 3. Crossing -10 to +5: revalues 10 units at 120 (1200) vs old 1000 -> revaluation variance -200.
    // 4. Net on-hand qty = 5, net on-hand value = -1000 + 1800 - 200 = 600 piasters (5 * 120).
    const root = join(tmpdir(), `small-shop-pos-pur-negcross-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupPurchaseDb(context.database)

    const now = fixedClock.now()
    context.database.exec(`
      INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
      VALUES ('sm_neg','p_milk',-10,-1000,'sale',${now},'u1',${now},${now},'d1');
    `)

    const service = new PurchaseService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: true,
    })

    const result = await service.receivePurchase(managerActor, {
      supplierId: 'sup1',
      lines: [{ productId: 'p_milk', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 15, unitCostPiasters: 120 }],
      tenders: [{ method: 'cash', amountPiasters: 1800 }],
      taxEnabled: false,
    })

    expect(result.ok).toBe(true)

    const onHand = context.database.prepare('SELECT COALESCE(SUM(qty_delta),0) AS qty, COALESCE(SUM(value_delta_piasters),0) AS value FROM stock_movements WHERE product_id = ?').get('p_milk') as { qty: number; value: number }
    expect(onHand.qty).toBe(5)
    expect(onHand.value).toBe(600)

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
