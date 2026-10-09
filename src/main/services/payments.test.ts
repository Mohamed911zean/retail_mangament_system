import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { SaleService } from './sales'
import { PurchaseService } from './purchases'
import { PaymentService } from './payments'
import { verifyDatabase } from '../database/db-verify'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import type { IdGenerator } from './ids'
import type { Actor } from './permissions'

const fixedClock: Clock = { now: () => 1700000000000 }
function testIds(): IdGenerator {
  let counter = 0
  return { next: () => `01PAY${String(++counter).padStart(21, '0')}` }
}

const cashier: Actor = { userId: 'u1', role: 'cashier', deviceId: 'd1' }
const manager: Actor = { userId: 'u2', role: 'manager', deviceId: 'd1' }

type TestDb = ReturnType<typeof openDatabase> extends Promise<infer C> ? C extends { database: infer D } ? D : never : never

function setupDb(database: TestDb) {
  const now = fixedClock.now()
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','cashier1','Cashier','hash','cashier',1,${now},${now},'d1'),
           ('u2','manager1','Manager','hash','manager',1,${now},${now},'d1');

    INSERT INTO customers (id,name,phone,address,credit_limit_piasters,metadata,created_at,updated_at,device_id)
    VALUES ('c1','Limited Customer',NULL,NULL,6000,NULL,${now},${now},'d1'),
           ('c2','Unlimited Customer',NULL,NULL,NULL,NULL,${now},${now},'d1');

    INSERT INTO suppliers (id,name,phone,address,metadata,created_at,updated_at,device_id)
    VALUES ('s1','Supplier 1',NULL,NULL,NULL,${now},${now},'d1');

    -- Counted product: cost 100, price 150, priceUnitQtyBase 1
    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p1','Product 1','piece',0,1,100,150,0,0,0,${now},${now},'d1');

    INSERT INTO shifts (id,user_id,opened_at,opening_cash_piasters,status,created_at,updated_at,device_id)
    VALUES ('sh1','u1',${now},0,'open',${now},${now},'d1');

    INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('sm_seed','p1',1000,100000,'purchase',${now},'u1',${now},${now},'d1');
  `)
}

// One id generator is shared across every service in a test, matching the single
// ULID generator the app injects in production.
function deps(database: TestDb, ids: IdGenerator, faults?: FaultInjector) {
  return { database, clock: fixedClock, ids, deviceId: 'd1', allowNegativeStock: false, shiftsEnabled: true, faults }
}

function salesDeps(database: TestDb, ids: IdGenerator) {
  return { database, clock: fixedClock, ids, deviceId: 'd1', allowNegativeStock: false }
}

async function openTestDb(name: string) {
  const root = join(tmpdir(), `small-shop-pos-payments-${name}-${Date.now()}`)
  mkdirSync(root, { recursive: true })
  const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
  setupDb(context.database)
  return { root, context }
}

describe('PaymentService', () => {
  it('customer receipt reduces the balance and its reversal restores it', async () => {
    const { root, context } = await openTestDb('receipt')
    const database = context.database
    const ids = testIds()
    const sales = new SaleService(salesDeps(database, ids))
    const payments = new PaymentService(deps(database, ids))

    // Sale of 40 units @ 150 = 6000 piasters, unpaid (credit) against a 6000 limit.
    const sale = await sales.completeSale(cashier, {
      customerId: 'c1',
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 40, unitPricePiasters: 150 }],
      tenders: [],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    if (!sale.ok) throw new Error('sale failed')
    expect(sale.value.sale.duePiasters).toBe(6000)

    const before = await payments.getCustomerBalance('c1')
    expect(before.ok && before.value).toEqual({ balancePiasters: 6000, status: 'due' })

    const receipt = await payments.recordCustomerReceipt(cashier, { customerId: 'c1', amountPiasters: 2000, method: 'cash', referenceText: 'partial payment' })
    if (!receipt.ok) throw new Error('receipt failed')
    const afterReceipt = await payments.getCustomerBalance('c1')
    expect(afterReceipt.ok && afterReceipt.value).toEqual({ balancePiasters: 4000, status: 'due' })

    const entry = database.prepare('SELECT entry_type, direction, amount_piasters, payment_method, customer_id, shift_id FROM money_ledger WHERE id = ?').get(receipt.value.id) as { entry_type: string; direction: string; amount_piasters: number; payment_method: string; customer_id: string; shift_id: string | null }
    expect(entry).toEqual({ entry_type: 'customer_receipt', direction: 'in', amount_piasters: 2000, payment_method: 'cash', customer_id: 'c1', shift_id: 'sh1' })

    const reversed = await payments.reverseCustomerReceipt(manager, { entryId: receipt.value.id, reason: 'keyed on the wrong customer' })
    if (!reversed.ok) throw new Error('reversal failed')
    const afterReversal = await payments.getCustomerBalance('c1')
    expect(afterReversal.ok && afterReversal.value).toEqual({ balancePiasters: 6000, status: 'due' })

    const reversal = database.prepare('SELECT entry_type, direction, amount_piasters, payment_method, customer_id, reverses_entry_id FROM money_ledger WHERE id = ?').get(reversed.value.id) as { entry_type: string; direction: string; amount_piasters: number; payment_method: string; customer_id: string; reverses_entry_id: string }
    expect(reversal).toEqual({ entry_type: 'customer_receipt', direction: 'out', amount_piasters: 2000, payment_method: 'cash', customer_id: 'c1', reverses_entry_id: receipt.value.id })

    expect(verifyDatabase(database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('a receipt larger than the outstanding balance leaves a credit balance', async () => {
    // sale 1000 + receipt 1500 -> balance -500 (the shop owes the customer).
    const { root, context } = await openTestDb('credit')
    const database = context.database
    const ids = testIds()
    const sales = new SaleService(salesDeps(database, ids))
    const payments = new PaymentService(deps(database, ids))

    const sale = await sales.completeSale(cashier, {
      customerId: 'c2',
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 1, unitPricePiasters: 1000 }],
      tenders: [],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    if (!sale.ok) throw new Error('sale failed')

    const receipt = await payments.recordCustomerReceipt(cashier, { customerId: 'c2', amountPiasters: 1500, method: 'card' })
    if (!receipt.ok) throw new Error('receipt failed')

    const balance = await payments.getCustomerBalance('c2')
    expect(balance.ok && balance.value).toEqual({ balancePiasters: -500, status: 'credit' })

    expect(verifyDatabase(database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('the credit-limit check uses the receipt-aware balance', async () => {
    const { root, context } = await openTestDb('credit-limit')
    const database = context.database
    const ids = testIds()
    const sales = new SaleService(salesDeps(database, ids))
    const payments = new PaymentService(deps(database, ids))

    const sale = async (qty: number, unitPricePiasters: number, actor: Actor) => sales.completeSale(actor, {
      customerId: 'c1',
      shiftId: 'sh1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: qty, unitPricePiasters }],
      tenders: [],
      taxEnabled: false,
      cashRoundingStep: 0,
    })

    // 6000 due against a 6000 limit is exactly at the limit -> allowed.
    const atLimit = await sale(40, 150, cashier)
    expect(atLimit.ok).toBe(true)

    // 1000 more would exceed the limit -> refused, and nothing is written.
    const overLimit = await sale(1, 1000, cashier)
    expect(overLimit.ok).toBe(false)
    if (!overLimit.ok) expect(overLimit.error.code).toBe('credit_limit_exceeded')

    // A receipt frees credit again: balance 4000, so the same 1000 sale now fits.
    const receipt = await payments.recordCustomerReceipt(cashier, { customerId: 'c1', amountPiasters: 2000, method: 'cash' })
    if (!receipt.ok) throw new Error('receipt failed')

    const afterReceipt = await sale(1, 1000, cashier)
    expect(afterReceipt.ok).toBe(true)

    const balance = await payments.getCustomerBalance('c1')
    expect(balance.ok && balance.value).toEqual({ balancePiasters: 5000, status: 'due' })

    expect(verifyDatabase(database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects a double reversal and enforces document.void', async () => {
    const { root, context } = await openTestDb('reversal-guards')
    const database = context.database
    const ids = testIds()
    const payments = new PaymentService(deps(database, ids))

    const receipt = await payments.recordCustomerReceipt(cashier, { customerId: 'c1', amountPiasters: 500, method: 'cash' })
    if (!receipt.ok) throw new Error('receipt failed')

    const cashierReversal = await payments.reverseCustomerReceipt(cashier, { entryId: receipt.value.id })
    expect(cashierReversal.ok).toBe(false)
    if (!cashierReversal.ok) expect(cashierReversal.error.code).toBe('permission_denied')

    const first = await payments.reverseCustomerReceipt(manager, { entryId: receipt.value.id })
    expect(first.ok).toBe(true)

    const second = await payments.reverseCustomerReceipt(manager, { entryId: receipt.value.id })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.code).toBe('reversal_already_exists')

    const missing = await payments.reverseCustomerReceipt(manager, { entryId: 'nope' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('not_found')

    expect(verifyDatabase(database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('supplier payment reduces the payable balance and its reversal restores it', async () => {
    const { root, context } = await openTestDb('supplier')
    const database = context.database
    const ids = testIds()
    const purchases = new PurchaseService(salesDeps(database, ids))
    const payments = new PaymentService(deps(database, ids))

    // Purchase of 40 units @ 150 = 6000 piasters, unpaid.
    const purchase = await purchases.receivePurchase(manager, {
      supplierId: 's1',
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 40, unitCostPiasters: 150 }],
      tenders: [],
      taxEnabled: false,
    })
    if (!purchase.ok) throw new Error('purchase failed')
    expect(purchase.value.purchase.duePiasters).toBe(6000)

    const before = await payments.getSupplierBalance('s1')
    expect(before.ok && before.value).toEqual({ balancePiasters: 6000, status: 'payable' })

    const payment = await payments.recordSupplierPayment(cashier, { supplierId: 's1', amountPiasters: 2000, method: 'cash' })
    if (!payment.ok) throw new Error('payment failed')
    const afterPayment = await payments.getSupplierBalance('s1')
    expect(afterPayment.ok && afterPayment.value).toEqual({ balancePiasters: 4000, status: 'payable' })

    const entry = database.prepare('SELECT entry_type, direction, amount_piasters, supplier_id, shift_id FROM money_ledger WHERE id = ?').get(payment.value.id) as { entry_type: string; direction: string; amount_piasters: number; supplier_id: string; shift_id: string | null }
    expect(entry).toEqual({ entry_type: 'supplier_payment', direction: 'out', amount_piasters: 2000, supplier_id: 's1', shift_id: 'sh1' })

    const reversed = await payments.reverseSupplierPayment(manager, { entryId: payment.value.id, reason: 'wrong supplier' })
    if (!reversed.ok) throw new Error('reversal failed')
    const afterReversal = await payments.getSupplierBalance('s1')
    expect(afterReversal.ok && afterReversal.value).toEqual({ balancePiasters: 6000, status: 'payable' })

    expect(verifyDatabase(database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('cash receipts and payments require an open shift when shifts are enabled', async () => {
    const { root, context } = await openTestDb('shift-required')
    const database = context.database
    database.prepare("UPDATE shifts SET status = 'closed', closed_at = ?, expected_cash_piasters = 0, counted_cash_piasters = 0, difference_piasters = 0 WHERE id = 'sh1'").run(fixedClock.now())

    const payments = new PaymentService(deps(database, testIds()))
    const receipt = await payments.recordCustomerReceipt(cashier, { customerId: 'c1', amountPiasters: 500, method: 'cash' })
    expect(receipt.ok).toBe(false)
    if (!receipt.ok) expect(receipt.error.code).toBe('invalid_shift_state')

    // A card receipt does not touch the drawer, so it needs no shift.
    const card = await payments.recordCustomerReceipt(cashier, { customerId: 'c1', amountPiasters: 500, method: 'card' })
    expect(card.ok).toBe(true)

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('a fault mid-receipt rolls back the ledger row', async () => {
    const { root, context } = await openTestDb('fault')
    const database = context.database
    const failing = new PaymentService(deps(database, testIds(), {
      after: (step: string) => {
        if (step === 'payment.customer_receipt_inserted') throw new Error('injected fault')
      },
    }))

    const result = await failing.recordCustomerReceipt(cashier, { customerId: 'c1', amountPiasters: 500, method: 'cash' })
    expect(result.ok).toBe(false)
    const count = database.prepare("SELECT COUNT(*) AS c FROM money_ledger WHERE entry_type = 'customer_receipt'").get() as { c: number }
    expect(count.c).toBe(0)
    expect(verifyDatabase(database).ok).toBe(true)

    // Service stays usable after the rolled-back attempt.
    const retry = await new PaymentService(deps(database, testIds())).recordCustomerReceipt(cashier, { customerId: 'c1', amountPiasters: 500, method: 'cash' })
    expect(retry.ok).toBe(true)

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('a fault mid-reversal rolls back the compensating row', async () => {
    const { root, context } = await openTestDb('reversal-fault')
    const database = context.database
    const ids = testIds()
    const payments = new PaymentService(deps(database, ids))
    const receipt = await payments.recordCustomerReceipt(cashier, { customerId: 'c1', amountPiasters: 500, method: 'cash' })
    if (!receipt.ok) throw new Error('receipt failed')

    const failing = new PaymentService(deps(database, ids, {
      after: (step: string) => {
        if (step === 'payment.customer_receipt_reversal_inserted') throw new Error('injected fault')
      },
    }))
    const result = await failing.reverseCustomerReceipt(manager, { entryId: receipt.value.id })
    expect(result.ok).toBe(false)

    const reversals = database.prepare("SELECT COUNT(*) AS c FROM money_ledger WHERE reverses_entry_id IS NOT NULL").get() as { c: number }
    expect(reversals.c).toBe(0)
    const balance = await payments.getCustomerBalance('c1')
    expect(balance.ok && balance.value).toEqual({ balancePiasters: -500, status: 'credit' })
    expect(verifyDatabase(database).ok).toBe(true)

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
