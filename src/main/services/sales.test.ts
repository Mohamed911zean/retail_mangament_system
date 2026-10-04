import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { SaleService } from './sales'
import { verifyDatabase } from '../database/db-verify'
import type { Clock } from './clock'
import type { IdGenerator } from './ids'
import type { Actor } from './permissions'

const fixedClock: Clock = { now: () => 1700000000000 }
function testIds(): IdGenerator {
  let counter = 0
  return { next: () => `01SALE${String(++counter).padStart(20, '0')}` }
}

const cashierActor: Actor = { userId: 'u1', role: 'cashier', deviceId: 'd1' }
const managerActor: Actor = { userId: 'u2', role: 'manager', deviceId: 'd1' }

function setupSaleDb(database: ReturnType<typeof openDatabase> extends Promise<infer C> ? C extends { database: infer D } ? D : never : never) {
  const now = fixedClock.now()
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','cashier1','Cashier','hash','cashier',1,${now},${now},'d1'),
           ('u2','manager1','Manager','hash','manager',1,${now},${now},'d1');

    INSERT INTO customers (id,name,phone,address,credit_limit_piasters,metadata,created_at,updated_at,device_id)
    VALUES ('c_nolimit','Customer No Limit',NULL,NULL,NULL,NULL,${now},${now},'d1'),
           ('c_zerolimit','Customer Zero Limit',NULL,NULL,0,NULL,${now},${now},'d1'),
           ('c_limit500','Customer 500 Limit',NULL,NULL,500,NULL,${now},${now},'d1');

    -- Counted product: priceUnitQtyBase = 1, cost = 100, price = 150
    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p_counted','Counted Item','piece',0,1,100,150,0,0,0,${now},${now},'d1');

    -- Weighted product: priceUnitQtyBase = 1000 (1 kg), cost = 8000, price = 12000 (120 EGP/kg)
    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p_weighted','Cheese','gram',3,1000,8000,12000,0,0,1,${now},${now},'d1');

    -- Shift 1 (open)
    INSERT INTO shifts (id,user_id,opened_at,opening_cash_piasters,status,created_at,updated_at,device_id)
    VALUES ('sh1','u1',${now},1000,'open',${now},${now},'d1');

    -- Pre-seed stock
    INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('sm_init1','p_counted',100,10000,'purchase',${now},'u1',${now},${now},'d1'),
           ('sm_init2','p_weighted',10000,80000,'purchase',${now},'u1',${now},${now},'d1');
  `)
}

describe('SaleService.completeSale', () => {
  it('completes a single-line cash sale with change and zero-padded sequence', async () => {
    // Hand-checked arithmetic:
    // 2 units of counted item @ 150 piasters = 300 piasters.
    // Tendered: 500 piasters cash. Change: 200 piasters.
    // Paid: 300 piasters. Due: 0.
    const root = join(tmpdir(), `small-shop-pos-sale-cash-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupSaleDb(context.database)

    const service = new SaleService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: false,
    })

    const result = await service.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{
        productId: 'p_counted',
        unitNameSnapshot: 'piece',
        pricedUnitQtyBase: 1,
        qtyBase: 2,
        unitPricePiasters: 150,
      }],
      tenders: [{ method: 'cash', amountPiasters: 300, tenderedPiasters: 500, changePiasters: 200 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.sale.totalPiasters).toBe(300)
      expect(result.value.sale.paidPiasters).toBe(300)
      expect(result.value.sale.duePiasters).toBe(0)
      expect(result.value.sale.paymentStatus).toBe('paid')
      expect(result.value.sale.invoiceNumber).toBe('1')
      expect(result.value.items.length).toBe(1)
      expect(result.value.items[0].lineCostPiasters).toBe(200) // 2 * 100
    }

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('completes a weighted item sale: 350g @ 12000 piasters/kg -> 4200 piasters', async () => {
    // Hand-checked arithmetic:
    // 350 g @ 12000 piasters per 1000 g:
    // lineSubtotal = 350 * 12000 / 1000 = 4200 piasters.
    // Cost: 350 * 8000 / 1000 = 2800 piasters.
    const root = join(tmpdir(), `small-shop-pos-sale-weighted-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupSaleDb(context.database)

    const service = new SaleService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: false,
    })

    const result = await service.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{
        productId: 'p_weighted',
        unitNameSnapshot: 'gram',
        pricedUnitQtyBase: 1000,
        qtyBase: 350,
        unitPricePiasters: 12000,
      }],
      tenders: [{ method: 'card', amountPiasters: 4200 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.sale.totalPiasters).toBe(4200)
      expect(result.value.items[0].finalLineTotalPiasters).toBe(4200)
      expect(result.value.items[0].lineCostPiasters).toBe(2800)
    }

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('handles multi-tender payment (cash + card + wallet) and partial credit', async () => {
    // Hand-checked arithmetic:
    // 4 units @ 150 = 600 piasters.
    // Tenders: cash 200, card 200, wallet 100 = total paid 500.
    // Due (credit): 100 piasters.
    // Payment status: 'partial'.
    const root = join(tmpdir(), `small-shop-pos-sale-multi-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupSaleDb(context.database)

    const service = new SaleService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: false,
    })

    const result = await service.completeSale(cashierActor, {
      customerId: 'c_limit500',
      shiftId: 'sh1',
      lines: [{
        productId: 'p_counted',
        unitNameSnapshot: 'piece',
        pricedUnitQtyBase: 1,
        qtyBase: 4,
        unitPricePiasters: 150,
      }],
      tenders: [
        { method: 'cash', amountPiasters: 200 },
        { method: 'card', amountPiasters: 200 },
        { method: 'wallet', amountPiasters: 100 },
      ],
      taxEnabled: false,
      cashRoundingStep: 0,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.sale.totalPiasters).toBe(600)
      expect(result.value.sale.paidPiasters).toBe(500)
      expect(result.value.sale.duePiasters).toBe(100)
      expect(result.value.sale.paymentStatus).toBe('partial')
    }

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('allocates invoice discount proportionally and applies cash rounding step', async () => {
    // Hand-checked arithmetic:
    // Line 1: 2 units @ 150 = 300 piasters.
    // Line 2: 1 unit @ 150 = 150 piasters.
    // Subtotal: 450 piasters.
    // Invoice discount: fixed 60 piasters.
    // Line 1 allocation: 60 * 300 / 450 = 40 piasters -> net 260 piasters.
    // Line 2 allocation: 60 * 150 / 450 = 20 piasters -> net 130 piasters.
    // After discount: 390 piasters.
    // Cash rounding step 25 (half-up to nearest 25 piasters):
    // 390 is rounded to 400 (adjustment +10 piasters).
    // Final total: 400 piasters.
    const root = join(tmpdir(), `small-shop-pos-sale-discount-round-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupSaleDb(context.database)

    const service = new SaleService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: false,
    })

    const result = await service.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [
        { productId: 'p_counted', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 2, unitPricePiasters: 150 },
        { productId: 'p_counted', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 1, unitPricePiasters: 150 },
      ],
      invoiceDiscount: { kind: 'fixed', amountPiasters: 60 },
      tenders: [{ method: 'cash', amountPiasters: 400 }],
      taxEnabled: false,
      cashRoundingStep: 25,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.sale.subtotalPiasters).toBe(450)
      expect(result.value.sale.invoiceDiscountPiasters).toBe(60)
      expect(result.value.sale.roundingAdjustmentPiasters).toBe(10)
      expect(result.value.sale.totalPiasters).toBe(400)
      expect(result.value.items[0].finalLineTotalPiasters).toBe(260)
      expect(result.value.items[1].finalLineTotalPiasters).toBe(130)
    }

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('enforces zero-price permission: cashier denied, manager allowed', async () => {
    const root = join(tmpdir(), `small-shop-pos-sale-zeroprice-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    setupSaleDb(context.database)

    const service = new SaleService({
      database: context.database,
      clock: fixedClock,
      ids: testIds(),
      deviceId: 'd1',
      allowNegativeStock: false,
    })

    // Cashier is denied
    const cashierResult = await service.completeSale(cashierActor, {
      shiftId: 'sh1',
      lines: [{
        productId: 'p_counted',
        unitNameSnapshot: 'piece',
        pricedUnitQtyBase: 1,
        qtyBase: 1,
        unitPricePiasters: 0,
      }],
      tenders: [],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    expect(cashierResult.ok).toBe(false)
    if (!cashierResult.ok) {
      expect(cashierResult.error.code).toBe('permission_denied')
    }

    // Manager is allowed
    const managerResult = await service.completeSale(managerActor, {
      shiftId: 'sh1',
      lines: [{
        productId: 'p_counted',
        unitNameSnapshot: 'piece',
        pricedUnitQtyBase: 1,
        qtyBase: 1,
        unitPricePiasters: 0,
      }],
      tenders: [],
      taxEnabled: false,
      cashRoundingStep: 0,
    })

    expect(managerResult.ok).toBe(true)
    if (managerResult.ok) {
      expect(managerResult.value.sale.totalPiasters).toBe(0)
      expect(managerResult.value.sale.paymentStatus).toBe('paid')
    }

    const audit = context.database.prepare("SELECT * FROM audit_log WHERE action = 'sale_completed'").get()
    expect(audit).toBeDefined()

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
