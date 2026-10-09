import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { SaleService } from './sales'
import { ShiftService } from './shifts'
import { verifyDatabase } from '../database/db-verify'
import type { Clock } from './clock'
import type { IdGenerator } from './ids'
import type { Actor } from './permissions'

const fixedClock: Clock = { now: () => 1700000000000 }
function testIds(): IdGenerator {
  let counter = 0
  return { next: () => `01SHIFT${String(++counter).padStart(19, '0')}` }
}

const cashierActor: Actor = { userId: 'u1', role: 'cashier', deviceId: 'd1' }

type TestDb = ReturnType<typeof openDatabase> extends Promise<infer C> ? C extends { database: infer D } ? D : never : never

function setupShiftDb(database: TestDb) {
  const now = fixedClock.now()
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','cashier1','Cashier','hash','cashier',1,${now},${now},'d1');

    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p1','Product 1','piece',0,1,100,150,0,0,0,${now},${now},'d1');

    INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('sm_seed','p1',100,10000,'purchase',${now},'u1',${now},${now},'d1');
  `)
}

async function openTestDb(name: string) {
  const root = join(tmpdir(), `small-shop-pos-shift-${name}-${Date.now()}`)
  mkdirSync(root, { recursive: true })
  const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
  setupShiftDb(context.database)
  return { root, context }
}

describe('ShiftService', () => {
  it('opens a shift and rejects a second open shift on the same device', async () => {
    const { root, context } = await openTestDb('open')
    const shifts = new ShiftService({ database: context.database, clock: fixedClock, ids: testIds(), deviceId: 'd1' })

    const opened = await shifts.openShift(cashierActor, { openingCashPiasters: 1000 })
    expect(opened.ok).toBe(true)

    const openNow = await shifts.getOpenShift()
    expect(openNow.ok).toBe(true)
    if (openNow.ok) {
      expect(openNow.value).not.toBeNull()
      expect(openNow.value?.openingCashPiasters).toBe(1000)
      expect(openNow.value?.status).toBe('open')
    }

    const second = await shifts.openShift(cashierActor, { openingCashPiasters: 500 })
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.error.code).toBe('invalid_shift_state')
    }

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('closes a shift with expected cash computed from sales and expenses (balanced)', async () => {
    // Hand-checked arithmetic:
    // Opening cash: 1000. Cash sale: +300. Cash expense: -250.
    // Expected cash: 1000 + 300 - 250 = 1050. Counted: 1050 -> balanced, difference 0.
    const { root, context } = await openTestDb('close-balanced')
    const ids = testIds()
    const deps = { database: context.database, clock: fixedClock, ids, deviceId: 'd1' }
    const shifts = new ShiftService(deps)
    const sales = new SaleService({ ...deps, allowNegativeStock: false })

    const opened = await shifts.openShift(cashierActor, { openingCashPiasters: 1000 })
    if (!opened.ok) throw new Error('open failed')
    const shiftId = opened.value.id

    const sale = await sales.completeSale(cashierActor, {
      shiftId,
      lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 2, unitPricePiasters: 150 }],
      tenders: [{ method: 'cash', amountPiasters: 300 }],
      taxEnabled: false,
      cashRoundingStep: 0,
    })
    if (!sale.ok) throw new Error('sale failed')

    const expense = await shifts.recordExpense(cashierActor, {
      shiftId, category: 'supplies', description: 'Receipt paper', amountPiasters: 250, paymentMethod: 'cash',
    })
    expect(expense.ok).toBe(true)

    const closed = await shifts.closeShift(cashierActor, { shiftId, countedCashPiasters: 1050 })
    expect(closed.ok).toBe(true)
    if (closed.ok) {
      expect(closed.value.expectedCashPiasters).toBe(1050)
      expect(closed.value.differencePiasters).toBe(0)
      expect(closed.value.reconciliation).toBe('balanced')
      expect(closed.value.shift.status).toBe('closed')
      expect(closed.value.shift.closedAt).not.toBeNull()
    }

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('reports a short difference when counted cash is below expected', async () => {
    // Opening 1000 + cash in 500 - cash out 200 = 1300 expected.
    // Counted 1250 -> difference -50 -> status 'short'.
    const { root, context } = await openTestDb('close-short')
    const shifts = new ShiftService({ database: context.database, clock: fixedClock, ids: testIds(), deviceId: 'd1' })

    const opened = await shifts.openShift(cashierActor, { openingCashPiasters: 1000 })
    if (!opened.ok) throw new Error('open failed')
    const shiftId = opened.value.id

    const cashIn = await shifts.recordCashIn(cashierActor, { shiftId, amountPiasters: 500, referenceText: 'owner deposit' })
    expect(cashIn.ok).toBe(true)
    const cashOut = await shifts.recordCashOut(cashierActor, { shiftId, amountPiasters: 200, referenceText: 'petty cash' })
    expect(cashOut.ok).toBe(true)

    const cashInEntry = context.database.prepare("SELECT entry_type, direction, payment_method FROM money_ledger WHERE id = ?").get(cashIn.ok ? cashIn.value.id : '') as { entry_type: string; direction: string; payment_method: string }
    expect(cashInEntry.entry_type).toBe('cash_in')
    expect(cashInEntry.direction).toBe('in')
    expect(cashInEntry.payment_method).toBe('cash')
    const cashOutEntry = context.database.prepare("SELECT entry_type, direction FROM money_ledger WHERE id = ?").get(cashOut.ok ? cashOut.value.id : '') as { entry_type: string; direction: string }
    expect(cashOutEntry.entry_type).toBe('cash_out')
    expect(cashOutEntry.direction).toBe('out')

    const closed = await shifts.closeShift(cashierActor, { shiftId, countedCashPiasters: 1250, closingNotes: 'short at close' })
    expect(closed.ok).toBe(true)
    if (closed.ok) {
      expect(closed.value.expectedCashPiasters).toBe(1300)
      expect(closed.value.differencePiasters).toBe(-50)
      expect(closed.value.reconciliation).toBe('short')
    }

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects closing an already-closed shift and cash moves on a closed shift', async () => {
    const { root, context } = await openTestDb('closed-guards')
    const shifts = new ShiftService({ database: context.database, clock: fixedClock, ids: testIds(), deviceId: 'd1' })

    const opened = await shifts.openShift(cashierActor, { openingCashPiasters: 100 })
    if (!opened.ok) throw new Error('open failed')
    const shiftId = opened.value.id

    const closed = await shifts.closeShift(cashierActor, { shiftId, countedCashPiasters: 100 })
    expect(closed.ok).toBe(true)

    const secondClose = await shifts.closeShift(cashierActor, { shiftId, countedCashPiasters: 100 })
    expect(secondClose.ok).toBe(false)
    if (!secondClose.ok) {
      expect(secondClose.error.code).toBe('invalid_shift_state')
    }

    const expenseAfterClose = await shifts.recordExpense(cashierActor, {
      shiftId, category: 'supplies', description: 'late expense', amountPiasters: 50, paymentMethod: 'cash',
    })
    expect(expenseAfterClose.ok).toBe(false)
    if (!expenseAfterClose.ok) {
      expect(expenseAfterClose.error.code).toBe('invalid_shift_state')
    }

    const cashInAfterClose = await shifts.recordCashIn(cashierActor, { shiftId, amountPiasters: 50 })
    expect(cashInAfterClose.ok).toBe(false)

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('records an expense with its money ledger entry in one transaction', async () => {
    const { root, context } = await openTestDb('expense')
    const shifts = new ShiftService({ database: context.database, clock: fixedClock, ids: testIds(), deviceId: 'd1' })

    const opened = await shifts.openShift(cashierActor, { openingCashPiasters: 2000 })
    if (!opened.ok) throw new Error('open failed')
    const shiftId = opened.value.id

    const expense = await shifts.recordExpense(cashierActor, {
      shiftId, category: 'utilities', description: 'Electricity', amountPiasters: 750, paymentMethod: 'cash',
    })
    expect(expense.ok).toBe(true)
    if (!expense.ok) throw new Error('expense failed')

    const expenseRow = context.database.prepare('SELECT category, amount_piasters, status, shift_id FROM expenses WHERE id = ?').get(expense.value.id) as { category: string; amount_piasters: number; status: string; shift_id: string }
    expect(expenseRow.category).toBe('utilities')
    expect(expenseRow.amount_piasters).toBe(750)
    expect(expenseRow.status).toBe('posted')
    expect(expenseRow.shift_id).toBe(shiftId)

    const ledgerRow = context.database.prepare("SELECT entry_type, direction, amount_piasters, reference_type, reference_id FROM money_ledger WHERE reference_type = 'expense' AND reference_id = ?").get(expense.value.id) as { entry_type: string; direction: string; amount_piasters: number; reference_type: string; reference_id: string }
    expect(ledgerRow.entry_type).toBe('expense')
    expect(ledgerRow.direction).toBe('out')
    expect(ledgerRow.amount_piasters).toBe(750)

    // Non-cash expenses do not affect expected cash
    const cardExpense = await shifts.recordExpense(cashierActor, {
      shiftId, category: 'supplies', description: 'Card-paid box', amountPiasters: 300, paymentMethod: 'card',
    })
    expect(cardExpense.ok).toBe(true)

    const closed = await shifts.closeShift(cashierActor, { shiftId, countedCashPiasters: 1250 })
    expect(closed.ok).toBe(true)
    if (closed.ok) {
      expect(closed.value.expectedCashPiasters).toBe(1250)
      expect(closed.value.reconciliation).toBe('balanced')
    }

    expect(verifyDatabase(context.database).ok).toBe(true)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects invalid amounts', async () => {
    const { root, context } = await openTestDb('invalid-amounts')
    const shifts = new ShiftService({ database: context.database, clock: fixedClock, ids: testIds(), deviceId: 'd1' })

    const opened = await shifts.openShift(cashierActor, { openingCashPiasters: 100 })
    if (!opened.ok) throw new Error('open failed')
    const shiftId = opened.value.id

    const zeroExpense = await shifts.recordExpense(cashierActor, { shiftId, category: 'x', description: 'x', amountPiasters: 0, paymentMethod: 'cash' })
    expect(zeroExpense.ok).toBe(false)
    if (!zeroExpense.ok) expect(zeroExpense.error.code).toBe('invalid_money')

    const negativeCashIn = await shifts.recordCashIn(cashierActor, { shiftId, amountPiasters: -5 })
    expect(negativeCashIn.ok).toBe(false)

    const negativeOpen = await shifts.openShift(cashierActor, { openingCashPiasters: -1 })
    expect(negativeOpen.ok).toBe(false)

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
