import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { SaleService } from './sales'
import { PurchaseService } from './purchases'
import { SaleReturnService } from './saleReturns'
import { VoidService } from './voids'
import { ShiftService } from './shifts'
import { PaymentService } from './payments'
import { verifyDatabase } from '../database/db-verify'
import type { Clock } from './clock'
import type { IdGenerator } from './ids'
import type { Actor } from './permissions'

const fixedClock: Clock = { now: () => 1700000000000 }
function testIds(): IdGenerator {
  let counter = 0
  return { next: () => `01SCEN${String(++counter).padStart(20, '0')}` }
}

const cashier: Actor = { userId: 'u1', role: 'cashier', deviceId: 'd1' }
const manager: Actor = { userId: 'u2', role: 'manager', deviceId: 'd1' }

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type SaleRecord = { saleId: string; itemId: string; productId: string; qty: number; returned: number; shiftId: string; voided: boolean }
type ReturnRecord = { returnId: string; saleIndex: number; qty: number; shiftId: string; voided: boolean }
type ExpenseRecord = { expenseId: string; shiftId: string; voided: boolean }
type LedgerRecord = { entryId: string; shiftId: string; reversed: boolean }

const PRODUCTS = ['p1', 'p2', 'p3'] as const
const SELL_PRICE = 150
const BUY_COST = 100

describe('integration scenario (C9)', () => {
  it('stays verified across 320 seeded mixed operations', async () => {
    const root = join(tmpdir(), `small-shop-pos-scenario-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))

    const now = fixedClock.now()
    context.database.exec(`
      INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
      VALUES ('u1','cashier1','Cashier','hash','cashier',1,${now},${now},'d1'),
             ('u2','manager1','Manager','hash','manager',1,${now},${now},'d1');
      INSERT INTO customers (id,name,phone,address,credit_limit_piasters,metadata,created_at,updated_at,device_id)
      VALUES ('c1','Customer 1',NULL,NULL,NULL,NULL,${now},${now},'d1');
      INSERT INTO suppliers (id,name,phone,address,metadata,created_at,updated_at,device_id)
      VALUES ('s1','Supplier 1',NULL,NULL,NULL,${now},${now},'d1');
      INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,created_at,updated_at,device_id)
      VALUES ('p1','Product 1','piece',0,1,${BUY_COST},${SELL_PRICE},0,0,0,${now},${now},'d1'),
             ('p2','Product 2','piece',0,1,${BUY_COST},${SELL_PRICE},0,0,0,${now},${now},'d1'),
             ('p3','Product 3','piece',0,1,${BUY_COST},${SELL_PRICE},0,0,0,${now},${now},'d1');
      INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
      VALUES ('sm_seed1','p1',1000,${1000 * BUY_COST},'purchase',${now},'u1',${now},${now},'d1'),
             ('sm_seed2','p2',1000,${1000 * BUY_COST},'purchase',${now},'u1',${now},${now},'d1'),
             ('sm_seed3','p3',1000,${1000 * BUY_COST},'purchase',${now},'u1',${now},${now},'d1');
    `)

    const ids = testIds()
    const deps = { database: context.database, clock: fixedClock, ids, deviceId: 'd1', allowNegativeStock: false }
    const sales = new SaleService(deps)
    const purchases = new PurchaseService(deps)
    const returns = new SaleReturnService(deps)
    const voids = new VoidService(deps)
    const shifts = new ShiftService(deps)
    const payments = new PaymentService({ ...deps, shiftsEnabled: true })

    const rng = mulberry32(20261009)
    const salesPool: SaleRecord[] = []
    const returnsPool: ReturnRecord[] = []
    const expensesPool: ExpenseRecord[] = []
    const receiptsPool: LedgerRecord[] = []
    const supplierPaymentsPool: LedgerRecord[] = []

    const opened = await shifts.openShift(cashier, { openingCashPiasters: 5000 })
    if (!opened.ok) throw new Error('failed to open shift')
    let currentShiftId = opened.value.id
    let shiftCount = 1

    const onHand = (productId: string): number => {
      const row = context.database.prepare('SELECT COALESCE(SUM(qty_delta),0) AS qty FROM stock_movements WHERE product_id = ?').get(productId) as { qty: number }
      return row.qty
    }

    const verify = (opIndex: number, opName: string) => {
      const result = verifyDatabase(context.database)
      if (!result.ok) {
        throw new Error(`verifyDatabase failed after op ${opIndex} (${opName}): ${JSON.stringify(result.errors[0])}`)
      }
    }

    const doSale = async (opIndex: number) => {
      const productId = PRODUCTS[Math.floor(rng() * PRODUCTS.length)]
      const available = onHand(productId)
      if (available <= 0) return 'sale:skipped'
      const qty = 1 + Math.floor(rng() * Math.min(3, available))
      const result = await sales.completeSale(cashier, {
        customerId: rng() < 0.3 ? 'c1' : undefined,
        shiftId: currentShiftId,
        lines: [{ productId, unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: qty, unitPricePiasters: SELL_PRICE }],
        tenders: [{ method: 'cash', amountPiasters: qty * SELL_PRICE }],
        taxEnabled: false,
        cashRoundingStep: 0,
      })
      if (!result.ok) throw new Error(`sale failed at op ${opIndex}: ${JSON.stringify(result.error)}`)
      salesPool.push({ saleId: result.value.sale.id, itemId: result.value.items[0].id, productId, qty, returned: 0, shiftId: currentShiftId, voided: false })
      return 'sale'
    }

    const doPurchase = async (opIndex: number) => {
      const productId = PRODUCTS[Math.floor(rng() * PRODUCTS.length)]
      const qty = 2 + Math.floor(rng() * 8)
      const result = await purchases.receivePurchase(manager, {
        supplierId: 's1',
        lines: [{ productId, unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: qty, unitCostPiasters: BUY_COST }],
        tenders: [{ method: 'cash', amountPiasters: qty * BUY_COST }],
        taxEnabled: false,
      })
      if (!result.ok) throw new Error(`purchase failed at op ${opIndex}: ${JSON.stringify(result.error)}`)
      return 'purchase'
    }

    const doReturn = async (opIndex: number) => {
      const candidates = salesPool.filter((s) => !s.voided && s.qty - s.returned > 0)
      if (candidates.length === 0) return 'return:skipped'
      const sale = candidates[Math.floor(rng() * candidates.length)]
      const result = await returns.processReturn(cashier, {
        originalSaleId: sale.saleId,
        shiftId: currentShiftId,
        lines: [{ saleItemId: sale.itemId, qtyBase: 1, condition: 'resalable' }],
      })
      if (!result.ok) throw new Error(`return failed at op ${opIndex}: ${JSON.stringify(result.error)}`)
      sale.returned += 1
      returnsPool.push({ returnId: result.value.saleReturn.id, saleIndex: salesPool.indexOf(sale), qty: 1, shiftId: currentShiftId, voided: false })
      return 'return'
    }

    const doVoidSale = async (opIndex: number) => {
      const candidates = salesPool.filter((s) => !s.voided && s.returned === 0 && s.shiftId === currentShiftId)
      if (candidates.length === 0) return 'voidSale:skipped'
      const sale = candidates[Math.floor(rng() * candidates.length)]
      const result = await voids.voidSale(manager, { documentId: sale.saleId, reason: 'scenario void' })
      if (!result.ok) throw new Error(`voidSale failed at op ${opIndex}: ${JSON.stringify(result.error)}`)
      sale.voided = true
      return 'voidSale'
    }

    const doVoidReturn = async () => {
      const candidates = returnsPool.filter((r) => !r.voided && r.shiftId === currentShiftId)
      if (candidates.length === 0) return 'voidReturn:skipped'
      const record = candidates[Math.floor(rng() * candidates.length)]
      const result = await voids.voidSaleReturn(manager, { documentId: record.returnId, reason: 'scenario void return' })
      if (!result.ok) return `voidReturn:rejected:${result.error.code}`
      record.voided = true
      salesPool[record.saleIndex].returned -= record.qty
      return 'voidReturn'
    }

    const doExpense = async (opIndex: number) => {
      const amount = 50 + Math.floor(rng() * 450)
      const result = await shifts.recordExpense(cashier, {
        shiftId: currentShiftId, category: 'supplies', description: `expense ${opIndex}`, amountPiasters: amount, paymentMethod: 'cash',
      })
      if (!result.ok) throw new Error(`expense failed at op ${opIndex}: ${JSON.stringify(result.error)}`)
      expensesPool.push({ expenseId: result.value.id, shiftId: currentShiftId, voided: false })
      return 'expense'
    }

    const doVoidExpense = async () => {
      const candidates = expensesPool.filter((e) => !e.voided && e.shiftId === currentShiftId)
      if (candidates.length === 0) return 'voidExpense:skipped'
      const record = candidates[Math.floor(rng() * candidates.length)]
      const result = await voids.voidExpense(manager, { documentId: record.expenseId, reason: 'scenario void expense' })
      if (!result.ok) return `voidExpense:rejected:${result.error.code}`
      record.voided = true
      return 'voidExpense'
    }

    const doCashMove = async (opIndex: number) => {
      const amount = 25 + Math.floor(rng() * 200)
      const isIn = rng() < 0.5
      const result = isIn
        ? await shifts.recordCashIn(cashier, { shiftId: currentShiftId, amountPiasters: amount, referenceText: `cash in ${opIndex}` })
        : await shifts.recordCashOut(cashier, { shiftId: currentShiftId, amountPiasters: amount, referenceText: `cash out ${opIndex}` })
      if (!result.ok) throw new Error(`cash move failed at op ${opIndex}: ${JSON.stringify(result.error)}`)
      return isIn ? 'cashIn' : 'cashOut'
    }

    const doCloseReopenShift = async (opIndex: number) => {
      const cashRow = context.database.prepare(`
        SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_piasters ELSE -amount_piasters END),0) AS net
        FROM money_ledger WHERE shift_id = ? AND payment_method = 'cash'
      `).get(currentShiftId) as { net: number }
      const shiftRow = context.database.prepare('SELECT opening_cash_piasters FROM shifts WHERE id = ?').get(currentShiftId) as { opening_cash_piasters: number }
      const expected = shiftRow.opening_cash_piasters + cashRow.net

      const closed = await shifts.closeShift(cashier, { shiftId: currentShiftId, countedCashPiasters: expected, closingNotes: `scenario close ${opIndex}` })
      if (!closed.ok) throw new Error(`closeShift failed at op ${opIndex}: ${JSON.stringify(closed.error)}`)
      const reopened = await shifts.openShift(cashier, { openingCashPiasters: 5000 })
      if (!reopened.ok) throw new Error(`openShift failed at op ${opIndex}: ${JSON.stringify(reopened.error)}`)
      currentShiftId = reopened.value.id
      shiftCount += 1
      return 'shiftCycle'
    }

    const doCustomerReceipt = async (opIndex: number) => {
      const amount = 100 + Math.floor(rng() * 900)
      const method = rng() < 0.7 ? 'cash' : 'card'
      const result = await payments.recordCustomerReceipt(cashier, { customerId: 'c1', amountPiasters: amount, method })
      if (!result.ok) throw new Error(`receipt failed at op ${opIndex}: ${JSON.stringify(result.error)}`)
      receiptsPool.push({ entryId: result.value.id, shiftId: currentShiftId, reversed: false })
      return `customerReceipt:${method}`
    }

    const doSupplierPayment = async (opIndex: number) => {
      const amount = 100 + Math.floor(rng() * 900)
      const method = rng() < 0.7 ? 'cash' : 'wallet'
      const result = await payments.recordSupplierPayment(manager, { supplierId: 's1', amountPiasters: amount, method })
      if (!result.ok) throw new Error(`supplier payment failed at op ${opIndex}: ${JSON.stringify(result.error)}`)
      supplierPaymentsPool.push({ entryId: result.value.id, shiftId: currentShiftId, reversed: false })
      return `supplierPayment:${method}`
    }

    const doReverseReceipt = async () => {
      const candidates = receiptsPool.filter((r) => !r.reversed && r.shiftId === currentShiftId)
      if (candidates.length === 0) return 'reverseReceipt:skipped'
      const record = candidates[Math.floor(rng() * candidates.length)]
      const result = await payments.reverseCustomerReceipt(manager, { entryId: record.entryId, reason: 'scenario reversal' })
      if (!result.ok) return `reverseReceipt:rejected:${result.error.code}`
      record.reversed = true
      return 'reverseReceipt'
    }

    const doReverseSupplierPayment = async () => {
      const candidates = supplierPaymentsPool.filter((r) => !r.reversed && r.shiftId === currentShiftId)
      if (candidates.length === 0) return 'reverseSupplierPayment:skipped'
      const record = candidates[Math.floor(rng() * candidates.length)]
      const result = await payments.reverseSupplierPayment(manager, { entryId: record.entryId, reason: 'scenario reversal' })
      if (!result.ok) return `reverseSupplierPayment:rejected:${result.error.code}`
      record.reversed = true
      return 'reverseSupplierPayment'
    }

    let fallbackSkips = 0
    for (let i = 0; i < 320; i++) {
      const roll = Math.floor(rng() * 100)
      let opName: string
      if (roll < 22) opName = await doSale(i)
      else if (roll < 40) opName = await doPurchase(i)
      else if (roll < 51) opName = await doReturn(i)
      else if (roll < 60) opName = await doVoidSale(i)
      else if (roll < 67) opName = await doVoidReturn()
      else if (roll < 74) opName = await doExpense(i)
      else if (roll < 78) opName = await doVoidExpense()
      else if (roll < 82) opName = await doCashMove(i)
      else if (roll < 86) opName = await doCustomerReceipt(i)
      else if (roll < 89) opName = await doSupplierPayment(i)
      else if (roll < 92) opName = await doReverseReceipt()
      else if (roll < 95) opName = await doReverseSupplierPayment()
      else opName = await doCloseReopenShift(i)

      if (opName.endsWith(':skipped')) fallbackSkips += 1
      verify(i, opName)
    }

    // Final invariants: at least some of every operation type actually happened
    expect(salesPool.length).toBeGreaterThan(20)
    expect(returnsPool.length).toBeGreaterThan(5)
    expect(salesPool.some((s) => s.voided)).toBe(true)
    expect(returnsPool.some((r) => r.voided)).toBe(true)
    expect(expensesPool.length).toBeGreaterThan(10)
    expect(receiptsPool.length).toBeGreaterThan(5)
    expect(supplierPaymentsPool.length).toBeGreaterThan(3)
    expect(receiptsPool.some((r) => r.reversed)).toBe(true)
    expect(supplierPaymentsPool.some((r) => r.reversed)).toBe(true)
    expect(shiftCount).toBeGreaterThan(1)
    expect(fallbackSkips).toBeLessThan(80)

    const finalVerify = verifyDatabase(context.database)
    expect(finalVerify.ok).toBe(true)

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  }, 120000)
})
