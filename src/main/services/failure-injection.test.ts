import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { SaleService } from './sales'
import { ShiftService } from './shifts'
import { VoidService } from './voids'
import { verifyDatabase } from '../database/db-verify'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import type { IdGenerator } from './ids'
import type { Actor } from './permissions'

const fixedClock: Clock = { now: () => 1700000000000 }
function testIds(): IdGenerator {
  let counter = 0
  return { next: () => `01FAULT${String(++counter).padStart(19, '0')}` }
}

const cashier: Actor = { userId: 'u1', role: 'cashier', deviceId: 'd1' }
const manager: Actor = { userId: 'u2', role: 'manager', deviceId: 'd1' }

function throwAt(step: string): FaultInjector {
  return {
    after: (s: string) => {
      if (s === step) throw new Error(`injected fault at ${s}`)
    },
  }
}

type TestDb = ReturnType<typeof openDatabase> extends Promise<infer C> ? C extends { database: infer D } ? D : never : never

function setupDb(database: TestDb) {
  const now = fixedClock.now()
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','cashier1','Cashier','hash','cashier',1,${now},${now},'d1'),
           ('u2','manager1','Manager','hash','manager',1,${now},${now},'d1');
    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p1','Product 1','piece',0,1,100,150,0,0,0,${now},${now},'d1');
    INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('sm_seed','p1',100,10000,'purchase',${now},'u1',${now},${now},'d1');
  `)
}

async function openTestDb(name: string) {
  const root = join(tmpdir(), `small-shop-pos-fault-${name}-${Date.now()}`)
  mkdirSync(root, { recursive: true })
  const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
  setupDb(context.database)
  return { root, context }
}

function rowCount(database: TestDb, sql: string, ...params: (string | number)[]): number {
  const row = database.prepare(sql).get(...params) as { c: number }
  return row.c
}

describe('failure injection: every service step rolls back atomically', () => {
  it('voidSale: fault at each step leaves the sale completed and the database verified', async () => {
    for (const step of ['void.sale.start', 'void.sale.stock_written', 'void.sale.money_written', 'void.sale.status_updated']) {
      const { root, context } = await openTestDb(`void-sale-${step.replace(/\./g, '-')}`)
      const ids = testIds()
      const deps = { database: context.database, clock: fixedClock, ids, deviceId: 'd1', allowNegativeStock: false }
      const sales = new SaleService(deps)

      const opened = await new ShiftService(deps).openShift(cashier, { openingCashPiasters: 1000 })
      if (!opened.ok) throw new Error('open shift failed')

      const saleResult = await sales.completeSale(cashier, {
        shiftId: opened.value.id,
        lines: [{ productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 2, unitPricePiasters: 150 }],
        tenders: [{ method: 'cash', amountPiasters: 300 }],
        taxEnabled: false,
        cashRoundingStep: 0,
      })
      if (!saleResult.ok) throw new Error('sale failed')
      const saleId = saleResult.value.sale.id

      const voids = new VoidService({ ...deps, faults: throwAt(step) })
      const voidResult = await voids.voidSale(manager, { documentId: saleId, reason: 'fault test' })
      expect(voidResult.ok).toBe(false)
      if (!voidResult.ok) expect(voidResult.error.code).toBe('database_error')

      const sale = context.database.prepare('SELECT status FROM sales WHERE id = ?').get(saleId) as { status: string }
      expect(sale.status).toBe('completed')
      expect(rowCount(context.database, "SELECT COUNT(*) AS c FROM stock_movements WHERE movement_type = 'void_compensation' AND reference_id = ?", saleId)).toBe(0)
      expect(rowCount(context.database, "SELECT COUNT(*) AS c FROM money_ledger WHERE entry_type = 'void_compensation' AND reference_id = ?", saleId)).toBe(0)
      expect(verifyDatabase(context.database).ok).toBe(true)

      // The service must still be usable after the rolled-back attempt
      const retry = await new VoidService(deps).voidSale(manager, { documentId: saleId, reason: 'retry after fault' })
      expect(retry.ok).toBe(true)
      expect(verifyDatabase(context.database).ok).toBe(true)

      closeDatabase(context)
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('openShift: fault after row insert leaves no shift row behind', async () => {
    const { root, context } = await openTestDb('shift-open')
    const shifts = new ShiftService({
      database: context.database, clock: fixedClock, ids: testIds(), deviceId: 'd1', faults: throwAt('shift.row_inserted'),
    })

    const result = await shifts.openShift(cashier, { openingCashPiasters: 1000 })
    expect(result.ok).toBe(false)
    expect(rowCount(context.database, 'SELECT COUNT(*) AS c FROM shifts')).toBe(0)
    expect(verifyDatabase(context.database).ok).toBe(true)

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('closeShift: fault after close update keeps the shift open', async () => {
    const { root, context } = await openTestDb('shift-close')
    const deps = { database: context.database, clock: fixedClock, ids: testIds(), deviceId: 'd1' }
    const shifts = new ShiftService(deps)

    const opened = await shifts.openShift(cashier, { openingCashPiasters: 1000 })
    if (!opened.ok) throw new Error('open failed')

    const failing = new ShiftService({ ...deps, faults: throwAt('shift.row_closed') })
    const closed = await failing.closeShift(cashier, { shiftId: opened.value.id, countedCashPiasters: 1000 })
    expect(closed.ok).toBe(false)

    const shift = context.database.prepare('SELECT status, closed_at FROM shifts WHERE id = ?').get(opened.value.id) as { status: string; closed_at: number | null }
    expect(shift.status).toBe('open')
    expect(shift.closed_at).toBeNull()
    expect(verifyDatabase(context.database).ok).toBe(true)

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('recordExpense: fault after ledger insert removes both the expense and ledger rows', async () => {
    const { root, context } = await openTestDb('expense-ledger')
    const deps = { database: context.database, clock: fixedClock, ids: testIds(), deviceId: 'd1' }
    const shifts = new ShiftService(deps)

    const opened = await shifts.openShift(cashier, { openingCashPiasters: 1000 })
    if (!opened.ok) throw new Error('open failed')

    const failing = new ShiftService({ ...deps, faults: throwAt('shift.expense_ledger_inserted') })
    const expense = await failing.recordExpense(cashier, {
      shiftId: opened.value.id, category: 'supplies', description: 'fault test', amountPiasters: 250, paymentMethod: 'cash',
    })
    expect(expense.ok).toBe(false)

    expect(rowCount(context.database, 'SELECT COUNT(*) AS c FROM expenses')).toBe(0)
    expect(rowCount(context.database, "SELECT COUNT(*) AS c FROM money_ledger WHERE entry_type = 'expense'")).toBe(0)
    expect(verifyDatabase(context.database).ok).toBe(true)

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('recordCashIn: fault after insert leaves no money ledger row', async () => {
    const { root, context } = await openTestDb('cash-in')
    const deps = { database: context.database, clock: fixedClock, ids: testIds(), deviceId: 'd1' }
    const shifts = new ShiftService(deps)

    const opened = await shifts.openShift(cashier, { openingCashPiasters: 1000 })
    if (!opened.ok) throw new Error('open failed')

    const failing = new ShiftService({ ...deps, faults: throwAt('shift.cash_in_inserted') })
    const cashIn = await failing.recordCashIn(cashier, { shiftId: opened.value.id, amountPiasters: 500 })
    expect(cashIn.ok).toBe(false)

    expect(rowCount(context.database, "SELECT COUNT(*) AS c FROM money_ledger WHERE entry_type = 'cash_in'")).toBe(0)
    expect(verifyDatabase(context.database).ok).toBe(true)

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
