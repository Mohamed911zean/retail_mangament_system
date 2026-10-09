import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { SaleService } from './sales'
import { PurchaseService } from './purchases'
import { SaleReturnService } from './saleReturns'
import { VoidService } from './voids'
import { verifyDatabase } from '../database/db-verify'
import type { Clock } from './clock'
import type { IdGenerator } from './ids'
import type { Actor } from './permissions'

const fixedClock: Clock = { now: () => 1700000000000 }
function testIds(): IdGenerator {
  let counter = 0
  return { next: () => `01VOID${String(++counter).padStart(20, '0')}` }
}

const cashierActor: Actor = { userId: 'u1', role: 'cashier', deviceId: 'd1' }
const managerActor: Actor = { userId: 'u2', role: 'manager', deviceId: 'd1' }

type TestDb = ReturnType<typeof openDatabase> extends Promise<infer C> ? C extends { database: infer D } ? D : never : never

function setupVoidDb(database: TestDb, options: { withSeedStock?: boolean } = {}) {
  const now = fixedClock.now()
  const seedStock = options.withSeedStock === false
    ? ''
    : `INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('sm_seed','p1',100,10000,'purchase',${now},'u1',${now},${now},'d1');`
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','cashier1','Cashier','hash','cashier',1,${now},${now},'d1'),
           ('u2','manager1','Manager','hash','manager',1,${now},${now},'d1');

    INSERT INTO customers (id,name,phone,address,credit_limit_piasters,metadata,created_at,updated_at,device_id)
    VALUES ('c1','Customer 1',NULL,NULL,NULL,NULL,${now},${now},'d1');

    INSERT INTO suppliers (id,name,phone,address,metadata,created_at,updated_at,device_id)
    VALUES ('s1','Supplier 1',NULL,NULL,NULL,${now},${now},'d1');

    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p1','Product 1','piece',0,1,100,150,0,0,0,${now},${now},'d1');

    INSERT INTO shifts (id,user_id,opened_at,opening_cash_piasters,status,created_at,updated_at,device_id)
    VALUES ('sh1','u1',${now},1000,'open',${now},${now},'d1');

    ${seedStock}
  `)
}

function makeServices(database: TestDb, ids: IdGenerator, allowNegativeStock = false) {
  const deps = { database, clock: fixedClock, ids, deviceId: 'd1', allowNegativeStock }
  return {
    sales: new SaleService(deps),
    purchases: new PurchaseService(deps),
    returns: new SaleReturnService(deps),
    voids: new VoidService(deps),
  }
}

function onHand(database: TestDb, productId: string): number {
  const row = database.prepare('SELECT COALESCE(SUM(qty_delta),0) AS qty FROM stock_movements WHERE product_id = ?').get(productId) as { qty: number }
  return row.qty
}

describe('VoidService', () => {
  it('voidSale: completes a sale then voids it — status, stock, and money are reversed', async () => {
    const root = join(tmpdir(), `small-shop-pos-void-sale-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupVoidDb(context.database)
    const services = makeServices(context.database, testIds())

    const saleResult = await services.sales.completeSale(cashierActor, {
      customerId: 'c1',
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 2, unitPricePiasters: 150 }],
      tenders: [{ method: 'cash', amountPiasters: 300 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    if (!saleResult.ok) throw new Error('sale failed')
    const saleId = saleResult.value.sale.id
    expect(onHand(context.database, 'p1')).toBe(98)

    const voidResult = await services.voids.voidSale(managerActor, { documentId: saleId, reason: 'test void' })
    expect(voidResult.ok).toBe(true)

    const sale = context.database.prepare('SELECT status, voided_at, voided_by_user_id, void_reason FROM sales WHERE id = ?').get(saleId) as { status: string; voided_at: number | null; voided_by_user_id: string | null; void_reason: string | null }
    expect(sale.status).toBe('voided')
    expect(sale.voided_at).not.toBeNull()
    expect(sale.voided_by_user_id).toBe('u2')
    expect(sale.void_reason).toBe('test void')

    expect(onHand(context.database, 'p1')).toBe(100)

    const stockComp = context.database.prepare("SELECT COUNT(*) AS c FROM stock_movements WHERE movement_type = 'void_compensation' AND reference_type = 'sale' AND reference_id = ?").get(saleId) as { c: number }
    expect(stockComp.c).toBe(1)
    const moneyComp = context.database.prepare("SELECT direction, amount_piasters, payment_method, customer_id FROM money_ledger WHERE entry_type = 'void_compensation' AND reference_type = 'sale' AND reference_id = ?").get(saleId) as { direction: string; amount_piasters: number; payment_method: string; customer_id: string | null }
    expect(moneyComp.direction).toBe('out')
    expect(moneyComp.amount_piasters).toBe(300)
    expect(moneyComp.payment_method).toBe('cash')
    expect(moneyComp.customer_id).toBe('c1')

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('voidSale: blocked when completed returns exist', async () => {
    const root = join(tmpdir(), `small-shop-pos-void-sale-blocked-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupVoidDb(context.database)
    const services = makeServices(context.database, testIds())

    const saleResult = await services.sales.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 2, unitPricePiasters: 150 }],
      tenders: [{ method: 'cash', amountPiasters: 300 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    if (!saleResult.ok) throw new Error('sale failed')

    const returnResult = await services.returns.processReturn(cashierActor, {
      originalSaleId: saleResult.value.sale.id,
      shiftId: 'sh1',
      lines: [{ saleItemId: saleResult.value.items[0].id, qtyBase: 1, condition: 'resalable' }],
    })
    if (!returnResult.ok) throw new Error('return failed')

    const voidResult = await services.voids.voidSale(managerActor, { documentId: saleResult.value.sale.id, reason: 'should fail' })
    expect(voidResult.ok).toBe(false)
    if (!voidResult.ok) {
      expect(voidResult.error.code).toBe('void_blocked_by_returns')
    }

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('voidSale: blocked when the sale is already voided', async () => {
    const root = join(tmpdir(), `small-shop-pos-void-sale-twice-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupVoidDb(context.database)
    const services = makeServices(context.database, testIds())

    const saleResult = await services.sales.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 1, unitPricePiasters: 150 }],
      tenders: [{ method: 'cash', amountPiasters: 150 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    if (!saleResult.ok) throw new Error('sale failed')
    const saleId = saleResult.value.sale.id

    const firstVoid = await services.voids.voidSale(managerActor, { documentId: saleId, reason: 'first' })
    expect(firstVoid.ok).toBe(true)

    const secondVoid = await services.voids.voidSale(managerActor, { documentId: saleId, reason: 'second' })
    expect(secondVoid.ok).toBe(false)
    if (!secondVoid.ok) {
      expect(secondVoid.error.code).toBe('document_already_voided')
    }

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('voidPurchase: blocked when voiding would create negative stock and allowNegativeStock is false', async () => {
    const root = join(tmpdir(), `small-shop-pos-void-purchase-neg-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupVoidDb(context.database, { withSeedStock: false })
    const services = makeServices(context.database, testIds(), false)

    const purchaseResult = await services.purchases.receivePurchase(managerActor, {
      supplierId: 's1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 5, unitCostPiasters: 100 }],
      tenders: [{ method: 'cash', amountPiasters: 500 }],
      taxEnabled: false,
    })
    if (!purchaseResult.ok) throw new Error('purchase failed')
    const purchaseId = purchaseResult.value.purchase.id

    // Sell 4 of the 5 purchased units; only 1 remains on hand from this purchase batch
    const saleResult = await services.sales.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 4, unitPricePiasters: 150 }],
      tenders: [{ method: 'cash', amountPiasters: 600 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    if (!saleResult.ok) throw new Error('sale failed')

    const voidResult = await services.voids.voidPurchase(managerActor, { documentId: purchaseId, reason: 'should fail' })
    expect(voidResult.ok).toBe(false)
    if (!voidResult.ok) {
      expect(voidResult.error.code).toBe('insufficient_stock')
    }

    // Failed void must leave the database untouched and consistent
    const purchase = context.database.prepare('SELECT status FROM purchases WHERE id = ?').get(purchaseId) as { status: string }
    expect(purchase.status).toBe('completed')
    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('voidPurchase: succeeds when purchased stock is still on hand', async () => {
    const root = join(tmpdir(), `small-shop-pos-void-purchase-ok-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupVoidDb(context.database)
    const services = makeServices(context.database, testIds(), false)

    const purchaseResult = await services.purchases.receivePurchase(managerActor, {
      supplierId: 's1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 5, unitCostPiasters: 100 }],
      tenders: [{ method: 'cash', amountPiasters: 500 }],
      taxEnabled: false,
    })
    if (!purchaseResult.ok) throw new Error('purchase failed')
    const purchaseId = purchaseResult.value.purchase.id
    expect(onHand(context.database, 'p1')).toBe(105)

    const voidResult = await services.voids.voidPurchase(managerActor, { documentId: purchaseId, reason: 'wrong supplier invoice' })
    expect(voidResult.ok).toBe(true)

    const purchase = context.database.prepare('SELECT status, voided_by_user_id FROM purchases WHERE id = ?').get(purchaseId) as { status: string; voided_by_user_id: string }
    expect(purchase.status).toBe('voided')
    expect(purchase.voided_by_user_id).toBe('u2')
    expect(onHand(context.database, 'p1')).toBe(100)

    const moneyComp = context.database.prepare("SELECT direction, amount_piasters, supplier_id FROM money_ledger WHERE entry_type = 'void_compensation' AND reference_type = 'purchase' AND reference_id = ?").get(purchaseId) as { direction: string; amount_piasters: number; supplier_id: string | null }
    expect(moneyComp.direction).toBe('in')
    expect(moneyComp.amount_piasters).toBe(500)
    expect(moneyComp.supplier_id).toBe('s1')

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('voidSaleReturn: completes a sale, returns one unit, then voids the return', async () => {
    const root = join(tmpdir(), `small-shop-pos-void-return-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupVoidDb(context.database)
    const services = makeServices(context.database, testIds())

    const saleResult = await services.sales.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 2, unitPricePiasters: 150 }],
      tenders: [{ method: 'cash', amountPiasters: 300 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    if (!saleResult.ok) throw new Error('sale failed')

    const returnResult = await services.returns.processReturn(cashierActor, {
      originalSaleId: saleResult.value.sale.id,
      shiftId: 'sh1',
      lines: [{ saleItemId: saleResult.value.items[0].id, qtyBase: 1, condition: 'resalable' }],
    })
    if (!returnResult.ok) throw new Error('return failed')
    const returnId = returnResult.value.saleReturn.id
    expect(onHand(context.database, 'p1')).toBe(99)

    const voidResult = await services.voids.voidSaleReturn(managerActor, { documentId: returnId, reason: 'return entered by mistake' })
    expect(voidResult.ok).toBe(true)

    const saleReturn = context.database.prepare('SELECT status, voided_by_user_id FROM sale_returns WHERE id = ?').get(returnId) as { status: string; voided_by_user_id: string }
    expect(saleReturn.status).toBe('voided')
    expect(saleReturn.voided_by_user_id).toBe('u2')
    // Restock is reversed: back to the post-sale quantity
    expect(onHand(context.database, 'p1')).toBe(98)

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('voidExpense: records an expense then voids it', async () => {
    const root = join(tmpdir(), `small-shop-pos-void-expense-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupVoidDb(context.database)
    const now = fixedClock.now()

    context.database.prepare(`
      INSERT INTO expenses (id,category,description,amount_piasters,payment_method,expense_at,user_id,shift_id,status,created_at,updated_at,device_id)
      VALUES ('exp1','supplies','Receipt paper',250,'cash',${now},'u1','sh1','posted',${now},${now},'d1')
    `).run()
    context.database.prepare(`
      INSERT INTO money_ledger (id,entry_type,direction,amount_piasters,payment_method,reference_type,reference_id,shift_id,occurred_at,user_id,created_at,updated_at,device_id)
      VALUES ('ml_exp1','expense','out',250,'cash','expense','exp1','sh1',${now},'u1',${now},${now},'d1')
    `).run()

    const services = makeServices(context.database, testIds())
    const voidResult = await services.voids.voidExpense(managerActor, { documentId: 'exp1', reason: 'duplicate entry' })
    expect(voidResult.ok).toBe(true)

    const expense = context.database.prepare('SELECT status, voided_by_user_id, void_reason FROM expenses WHERE id = ?').get('exp1') as { status: string; voided_by_user_id: string; void_reason: string }
    expect(expense.status).toBe('voided')
    expect(expense.voided_by_user_id).toBe('u2')
    expect(expense.void_reason).toBe('duplicate entry')

    const moneyComp = context.database.prepare("SELECT direction, amount_piasters, payment_method FROM money_ledger WHERE entry_type = 'void_compensation' AND reference_type = 'expense' AND reference_id = 'exp1'").get() as { direction: string; amount_piasters: number; payment_method: string }
    expect(moneyComp.direction).toBe('in')
    expect(moneyComp.amount_piasters).toBe(250)
    expect(moneyComp.payment_method).toBe('cash')

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})

// ─── Stock normalisation on void compensations (Decision #4) ──────────────────
//
// Every stock movement — including void compensations — must leave the ledger
// inside its invariants: (qty == 0 => value == 0) and (qty > 0 => value >= 0).
// Compensations keep the exact negated qty/value from `calculateVoidCompensation`
// and are then run through the engine: an incoming compensation that lifts stock
// out of negative receives the negative-stock settlement, and every compensation
// always finishes with `calculateStockNormalization`.

function onHandValue(database: TestDb, productId: string): number {
  const row = database.prepare('SELECT COALESCE(SUM(value_delta_piasters),0) AS value FROM stock_movements WHERE product_id = ?').get(productId) as { value: number }
  return row.value
}

function seedStock(database: TestDb, qty: number, value: number): void {
  const now = fixedClock.now()
  database.prepare(`
    INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('sm_seed','p1',?,?,'purchase',${now},'u1',${now},${now},'d1')
  `).run(qty, value)
}

function revaluationRows(database: TestDb): { qty_delta: number; value_delta_piasters: number; reason: string }[] {
  return database.prepare(
    "SELECT qty_delta, value_delta_piasters, reason FROM stock_movements WHERE movement_type = 'revaluation' ORDER BY rowid",
  ).all() as { qty_delta: number; value_delta_piasters: number; reason: string }[]
}

describe('VoidService stock normalisation', () => {
  it('voidPurchase: compensation that zeroes stock normalises the leftover value (revaluation +250)', async () => {
    // Hand-checked arithmetic (piasters / base units):
    //   seed            (qty 5,  value  500)        weighted average 100/unit
    //   receivePurchase 5 @ 200 = 1000              -> (10, 1500)
    //   sell 5 @ 150    cost = round(1500*5/10)=750 -> (5, 750)
    //   voidPurchase    reverses +5/+1000 with -5/-1000 -> (0, -250)
    //   normalisation   qty == 0 with value != 0 => revaluation +250 (qtyDelta 0) -> (0, 0)
    const root = join(tmpdir(), `small-shop-pos-void-norm-purchase-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupVoidDb(context.database, { withSeedStock: false })
    seedStock(context.database, 5, 500)
    const services = makeServices(context.database, testIds())

    const purchase = await services.purchases.receivePurchase(managerActor, {
      supplierId: 's1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 5, unitCostPiasters: 200 }],
      tenders: [{ method: 'cash', amountPiasters: 1000 }],
      taxEnabled: false,
    })
    if (!purchase.ok) throw new Error('purchase failed')
    expect(onHand(context.database, 'p1')).toBe(10)
    expect(onHandValue(context.database, 'p1')).toBe(1500)

    const sale = await services.sales.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 5, unitPricePiasters: 150 }],
      tenders: [{ method: 'cash', amountPiasters: 750 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    if (!sale.ok) throw new Error('sale failed')
    expect(sale.value.items[0].lineCostPiasters).toBe(750)
    expect(onHand(context.database, 'p1')).toBe(5)
    expect(onHandValue(context.database, 'p1')).toBe(750)

    const voided = await services.voids.voidPurchase(managerActor, { documentId: purchase.value.purchase.id, reason: 'wrong invoice' })
    expect(voided.ok).toBe(true)
    expect(onHand(context.database, 'p1')).toBe(0)
    expect(onHandValue(context.database, 'p1')).toBe(0)
    expect(revaluationRows(context.database)).toEqual([
      { qty_delta: 0, value_delta_piasters: 250, reason: 'stock_normalization' },
    ])

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('voidSale: restocking across zero applies negative-stock settlement (revaluation -600)', async () => {
    // allowNegativeStock = true. Product default cost 100.
    //   seed none                              -> (0, 0)
    //   sell 5 @ 150: cost = round(100*5/1) = 500 -> (-5, -500)
    //   receivePurchase 3 @ 300 = 900          -> (-2, 400)  (ends negative, no settlement)
    //   voidSale reverses -5/-500 with +5/+500 (incoming, crosses to +3):
    //     desired   = round(500 * 3 / 5) = 300
    //     valueAfter = 400 + 500 = 900
    //     revaluation = 300 - 900 = -600       -> (3, 300)
    const root = join(tmpdir(), `small-shop-pos-void-norm-negative-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupVoidDb(context.database, { withSeedStock: false })
    const services = makeServices(context.database, testIds(), true)

    const sale = await services.sales.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 5, unitPricePiasters: 150 }],
      tenders: [{ method: 'cash', amountPiasters: 750 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    if (!sale.ok) throw new Error('sale failed')
    expect(onHand(context.database, 'p1')).toBe(-5)
    expect(onHandValue(context.database, 'p1')).toBe(-500)

    const purchase = await services.purchases.receivePurchase(managerActor, {
      supplierId: 's1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 3, unitCostPiasters: 300 }],
      tenders: [{ method: 'cash', amountPiasters: 900 }],
      taxEnabled: false,
    })
    if (!purchase.ok) throw new Error('purchase failed')
    expect(onHand(context.database, 'p1')).toBe(-2)
    expect(onHandValue(context.database, 'p1')).toBe(400)

    const voided = await services.voids.voidSale(managerActor, { documentId: sale.value.sale.id, reason: 'mis-keyed sale' })
    expect(voided.ok).toBe(true)
    expect(onHand(context.database, 'p1')).toBe(3)
    expect(onHandValue(context.database, 'p1')).toBe(300)
    expect(revaluationRows(context.database)).toEqual([
      { qty_delta: 0, value_delta_piasters: -600, reason: 'negative_stock_settlement' },
    ])

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('voidSaleReturn: reverses the exact resalable restock value, not the current average', async () => {
    //   seed (qty 10, value 1000)              weighted average 100/unit
    //   sell 2 @ 150: cost = round(1000*2/10)=200 -> (8, 800); sale line cost 200
    //   return 1 resalable: restock = round(200*1/2) = 100 -> (9, 900)
    //   receivePurchase 10 @ 200 = 2000        -> (19, 2900)  (average now ~152.6)
    //   voidSaleReturn reverses +1/+100 with -1/-100 (the exact restock, NOT the new average)
    //                                          -> (18, 2800)
    const root = join(tmpdir(), `small-shop-pos-void-norm-return-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupVoidDb(context.database, { withSeedStock: false })
    seedStock(context.database, 10, 1000)
    const services = makeServices(context.database, testIds())

    const sale = await services.sales.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 2, unitPricePiasters: 150 }],
      tenders: [{ method: 'cash', amountPiasters: 300 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    if (!sale.ok) throw new Error('sale failed')
    expect(onHand(context.database, 'p1')).toBe(8)
    expect(onHandValue(context.database, 'p1')).toBe(800)

    const returned = await services.returns.processReturn(cashierActor, {
      originalSaleId: sale.value.sale.id,
      shiftId: 'sh1',
      lines: [{ saleItemId: sale.value.items[0].id, qtyBase: 1, condition: 'resalable' }],
    })
    if (!returned.ok) throw new Error('return failed')
    expect(onHand(context.database, 'p1')).toBe(9)
    expect(onHandValue(context.database, 'p1')).toBe(900)

    const purchase = await services.purchases.receivePurchase(managerActor, {
      supplierId: 's1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 10, unitCostPiasters: 200 }],
      tenders: [{ method: 'cash', amountPiasters: 2000 }],
      taxEnabled: false,
    })
    if (!purchase.ok) throw new Error('purchase failed')
    expect(onHand(context.database, 'p1')).toBe(19)
    expect(onHandValue(context.database, 'p1')).toBe(2900)

    const voided = await services.voids.voidSaleReturn(managerActor, { documentId: returned.value.saleReturn.id, reason: 'return entered by mistake' })
    expect(voided.ok).toBe(true)
    expect(onHand(context.database, 'p1')).toBe(18)
    expect(onHandValue(context.database, 'p1')).toBe(2800)

    const compensation = context.database.prepare(
      "SELECT qty_delta, value_delta_piasters FROM stock_movements WHERE movement_type = 'void_compensation' AND reference_type = 'sale_return' AND reference_id = ?",
    ).get(returned.value.saleReturn.id) as { qty_delta: number; value_delta_piasters: number }
    expect(compensation).toEqual({ qty_delta: -1, value_delta_piasters: -100 })

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
