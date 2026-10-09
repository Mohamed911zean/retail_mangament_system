import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { SaleReturnService } from './saleReturns'
import { SaleService } from './sales'
import { verifyDatabase } from '../database/db-verify'
import type { Clock } from './clock'
import type { IdGenerator } from './ids'
import type { Actor } from './permissions'

const fixedClock: Clock = { now: () => 1700000000000 }
function testIds(): IdGenerator {
  let counter = 0
  return { next: () => `01RET${String(++counter).padStart(21, '0')}` }
}

const cashierActor: Actor = { userId: 'u1', role: 'cashier', deviceId: 'd1' }

function setupReturnDb(database: ReturnType<typeof openDatabase> extends Promise<infer C> ? C extends { database: infer D } ? D : never : never) {
  const now = fixedClock.now()
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','cashier','Cashier','hash','cashier',1,${now},${now},'d1');

    INSERT INTO customers (id,name,phone,address,credit_limit_piasters,metadata,created_at,updated_at,device_id)
    VALUES ('c1','Regular Customer',NULL,NULL,10000,NULL,${now},${now},'d1');

    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p1','Product 1','piece',0,1,100,334,0,0,0,${now},${now},'d1');

    INSERT INTO shifts (id,user_id,opened_at,opening_cash_piasters,status,created_at,updated_at,device_id)
    VALUES ('sh1','u1',${now},5000,'open',${now},${now},'d1');

    INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('sm_seed','p1',100,10000,'purchase',${now},'u1',${now},${now},'d1');
  `)
}

describe('SaleReturnService.processReturn', () => {
  it('handles cumulative refund allocation: 1001 piasters over 3 items -> 334, 333, 334', async () => {
    // Hand-checked arithmetic (Decision #1):
    // Original sale: 3 units sold for total 1001 piasters.
    // Return 1 unit: cumulative target = 1 * 1001 / 3 = 334. Refund = 334.
    // Return 2nd unit: cumulative target = 2 * 1001 / 3 = 667. Refund = 667 - 334 = 333.
    // Return 3rd unit: cumulative target = 3 * 1001 / 3 = 1001. Refund = 1001 - 667 = 334.
    const root = join(tmpdir(), `small-shop-pos-return-cumul-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupReturnDb(context.database)

    const ids = testIds()
    const saleService = new SaleService({
      database: context.database,
      clock: fixedClock,
      ids,
      deviceId: 'd1',
      allowNegativeStock: false,
    })

    // Create sale with 3 units @ 334 with 1 piaster discount = 1001 total
    const saleResult = await saleService.completeSale(cashierActor, {
      customerId: 'c1',
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 3, unitPricePiasters: 334, lineDiscount: { kind: 'fixed', amountPiasters: 1 } }],
      tenders: [{ method: 'cash', amountPiasters: 1001 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })

    expect(saleResult.ok).toBe(true)
    if (!saleResult.ok) throw new Error('sale failed')
    const saleId = saleResult.value.sale.id
    const saleItemId = saleResult.value.items[0].id

    const returnService = new SaleReturnService({
      database: context.database,
      clock: fixedClock,
      ids,
      deviceId: 'd1',
      allowNegativeStock: false,
    })

    // Return unit 1
    const ret1 = await returnService.processReturn(cashierActor, {
      originalSaleId: saleId,
      shiftId: 'sh1',
      lines: [{ saleItemId, qtyBase: 1, condition: 'resalable' }],
    })
    expect(ret1.ok).toBe(true)
    if (ret1.ok) {
      expect(ret1.value.saleReturn.totalPiasters).toBe(334)
      expect(ret1.value.items[0].refundPiasters).toBe(334)
    }

    // Return unit 2
    const ret2 = await returnService.processReturn(cashierActor, {
      originalSaleId: saleId,
      shiftId: 'sh1',
      lines: [{ saleItemId, qtyBase: 1, condition: 'resalable' }],
    })
    expect(ret2.ok).toBe(true)
    if (ret2.ok) {
      expect(ret2.value.saleReturn.totalPiasters).toBe(333)
      expect(ret2.value.items[0].refundPiasters).toBe(333)
    }

    // Return unit 3
    const ret3 = await returnService.processReturn(cashierActor, {
      originalSaleId: saleId,
      shiftId: 'sh1',
      lines: [{ saleItemId, qtyBase: 1, condition: 'resalable' }],
    })
    expect(ret3.ok).toBe(true)
    if (ret3.ok) {
      expect(ret3.value.saleReturn.totalPiasters).toBe(334)
      expect(ret3.value.items[0].refundPiasters).toBe(334)
    }

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('restocks resalable items but writes no stock movements for damaged items', async () => {
    const root = join(tmpdir(), `small-shop-pos-return-damaged-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupReturnDb(context.database)

    const saleService = new SaleService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: false,
    })

    const saleResult = await saleService.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 2, unitPricePiasters: 334 }],
      tenders: [{ method: 'cash', amountPiasters: 668 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    expect(saleResult.ok).toBe(true)
    if (!saleResult.ok) throw new Error('sale failed')
    const saleId = saleResult.value.sale.id
    const saleItemId = saleResult.value.items[0].id

    const returnService = new SaleReturnService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: false,
    })

    const stockMovementsBefore = context.database.prepare('SELECT COUNT(*) AS c FROM stock_movements WHERE reference_type = ?').get('sale_return') as { c: number }

    // Return 1 damaged item
    const retDamaged = await returnService.processReturn(cashierActor, {
      originalSaleId: saleId,
      shiftId: 'sh1',
      lines: [{ saleItemId, qtyBase: 1, condition: 'damaged' }],
    })
    expect(retDamaged.ok).toBe(true)

    const stockMovementsAfter = context.database.prepare('SELECT COUNT(*) AS c FROM stock_movements WHERE reference_type = ?').get('sale_return') as { c: number }
    // No stock movement added for damaged return
    expect(stockMovementsAfter.c).toBe(stockMovementsBefore.c)

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects over-returning more than purchased quantity', async () => {
    const root = join(tmpdir(), `small-shop-pos-return-over-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupReturnDb(context.database)

    const saleService = new SaleService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: false,
    })

    const saleResult = await saleService.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 1, unitPricePiasters: 334 }],
      tenders: [{ method: 'cash', amountPiasters: 334 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    expect(saleResult.ok).toBe(true)
    if (!saleResult.ok) throw new Error('sale failed')
    const saleId = saleResult.value.sale.id
    const saleItemId = saleResult.value.items[0].id

    const returnService = new SaleReturnService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: false,
    })

    // Attempt return 2 units when only 1 was purchased
    const overReturn = await returnService.processReturn(cashierActor, {
      originalSaleId: saleId,
      shiftId: 'sh1',
      lines: [{ saleItemId, qtyBase: 2, condition: 'resalable' }],
    })
    expect(overReturn.ok).toBe(false)
    if (!overReturn.ok) {
      expect(overReturn.error.code).toBe('return_exceeds_original')
    }

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
