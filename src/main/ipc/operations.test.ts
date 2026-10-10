import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { IPC_CHANNELS, type IpcChannel, type IpcResult, type ProductSummary } from '../../shared/ipc'
import type { LicenseStatus } from '../../shared/license/api'
import { runOperation, operations, type OperationContext } from './operations'
import { SessionStore } from './session'
import { addProduct, cartTotals, emptyCart, lineKey, setLineDiscount, toSaleLines, type Cart } from '../../renderer/pages/pos/cart'
import type { Platform } from './platform'
import type { Clock } from '../services/clock'
import type { IdGenerator } from '../services/ids'

const fixedClock: Clock = { now: () => 1700000000000 }

function testIds(): IdGenerator {
  let counter = 0
  return { next: () => `01IPC${String(++counter).padStart(21, '0')}` }
}

const activeLicense: LicenseStatus = { mode: 'active', state: 'active', machineCode: 'TEST-MACHINE', machineChecksum: 'test-checksum' }

const tempRoots: string[] = []
const openContexts: Awaited<ReturnType<typeof openDatabase>>[] = []
afterAll(() => {
  for (const opened of openContexts) closeDatabase(opened)
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true })
})

function fakePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    version: '0.0.0-test',
    listPrinters: async () => [],
    printTestReceipt: async () => true,
    printSaleReceipt: async () => true,
    listBackups: () => [],
    createBackup: async () => ({ fileName: 'backup.db', createdAt: fixedClock.now(), sizeBytes: 1 }),
    restoreBackup: async () => [],
    licenseStatus: async () => activeLicense,
    activateLicense: async () => activeLicense,
    isWriteAllowed: async () => true,
    reportUnexpectedError: () => undefined,
    ...overrides,
  }
}

async function makeContext(overrides: Partial<Platform> = {}) {
  const root = join(tmpdir(), `small-shop-pos-ipc-${Date.now()}-${tempRoots.length}`)
  mkdirSync(root, { recursive: true })
  tempRoots.push(root)
  const opened = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
  openContexts.push(opened)
  const platform = fakePlatform(overrides)
  const context: OperationContext = {
    getDatabase: () => opened.database,
    session: new SessionStore(),
    platform,
    clock: fixedClock,
    ids: testIds(),
  }
  return { context, platform, database: opened.database }
}

/** Narrows an `IpcResult` to its error, failing the test when it succeeded. */
function expectFailure(result: IpcResult<unknown>) {
  if (result.ok) throw new Error(`expected a failure, got a value: ${JSON.stringify(result.value)}`)
  return result.error
}

function expectSuccess<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error.code} (${result.error.messageKey})`)
  return result.value
}

async function setupOwner(context: OperationContext) {
  const current = expectSuccess(
    await runOperation('auth:setup', { username: 'owner1', displayName: 'المالك', password: 'pass1234' }, context),
  ) as { id: string; role: string }
  return current
}

describe('runOperation — channel contract', () => {
  it('registers exactly the channels the preload is allowed to invoke', () => {
    for (const channel of IPC_CHANNELS) {
      expect(operations[channel], `missing operation for ${channel}`).toBeDefined()
    }
    // The record is typed as a total map, so a stray key would be a type error;
    // this guards the runtime side of the same rule.
    expect(Object.keys(operations).sort()).toEqual([...IPC_CHANNELS].sort())
  })

  it('rejects an unknown channel without throwing', async () => {
    const { context } = await makeContext()
    const error = expectFailure(await runOperation('nope:channel' as IpcChannel, {}, context))
    expect(error.code).toBe('unknown_channel')
    expect(error.messageKey).toBe('errors.unknown_channel')
  })

  it('never rejects, even when the database handle itself explodes', async () => {
    const { context: base, platform } = await makeContext()
    const report = vi.fn()
    const context: OperationContext = {
      ...base,
      platform: { ...platform, reportUnexpectedError: report },
      getDatabase: () => {
        throw new Error('the database exploded')
      },
    }
    const error = expectFailure(await runOperation('app:get-info', {}, context))
    expect(error.code).toBe('internal_error')
    expect(error.messageKey).toBe('errors.internal_error')
    expect(error.details).toEqual({ channel: 'app:get-info' })
    // The stack stays in the main process, never in the payload sent to the UI.
    expect(JSON.stringify(error)).not.toContain('exploded')
    expect(report).toHaveBeenCalledWith('app:get-info failed', expect.any(Error))
  })
})

describe('runOperation — session and licence gating', () => {
  it('refuses an authenticated channel before login', async () => {
    const { context } = await makeContext()
    const error = expectFailure(await runOperation('users:list', {}, context))
    expect(error.code).toBe('not_authenticated')
  })

  it('refuses a write while the licence puts the app in read-only mode', async () => {
    const { context } = await makeContext({ isWriteAllowed: async () => false })
    await setupOwner(context)
    const settings = expectSuccess(await runOperation('settings:get', {}, context))
    expect(settings).toBeDefined()

    const error = expectFailure(await runOperation('settings:set', { key: 'shifts', value: false }, context))
    expect(error.code).toBe('read_only_mode')
  })

  it('still serves read-only channels in read-only mode', async () => {
    const { context } = await makeContext({ isWriteAllowed: async () => false })
    await setupOwner(context)
    const products = expectSuccess(await runOperation('catalog:list-products', {}, context))
    expect(products).toEqual([])
  })

  it('checks authentication before the licence, so an anonymous write is not a licence error', async () => {
    const { context } = await makeContext({ isWriteAllowed: async () => false })
    const error = expectFailure(await runOperation('settings:set', { key: 'shifts', value: false }, context))
    expect(error.code).toBe('not_authenticated')
  })
})

describe('runOperation — first-run setup and login', () => {
  it('reports needsSetup on an empty device and creates the owner through auth:setup', async () => {
    const { context } = await makeContext()
    const before = expectSuccess(await runOperation('auth:current', {}, context)) as { user: unknown; needsSetup: boolean }
    expect(before).toEqual({ user: null, needsSetup: true })

    const owner = await setupOwner(context)
    expect(owner.role).toBe('owner')

    const after = expectSuccess(await runOperation('auth:current', {}, context)) as { user: { username: string } | null; needsSetup: boolean }
    expect(after.needsSetup).toBe(false)
    expect(after.user?.username).toBe('owner1')
    // setup logs the new owner straight in
    expectSuccess(await runOperation('users:list', {}, context))
  })

  it('refuses a second setup so it cannot be used to escalate later', async () => {
    const { context } = await makeContext()
    await setupOwner(context)
    const error = expectFailure(
      await runOperation('auth:setup', { username: 'intruder', displayName: 'X', password: 'pass1234' }, context),
    )
    expect(error.code).toBe('setup_already_completed')
  })

  it('rejects a short password and a blank username at the boundary', async () => {
    const { context } = await makeContext()
    const shortPassword = expectFailure(
      await runOperation('auth:setup', { username: 'owner1', displayName: 'المالك', password: '123' }, context),
    )
    expect(shortPassword.code).toBe('invalid_input')
    expect(shortPassword.details).toEqual({ field: 'password' })

    const blankUsername = expectFailure(
      await runOperation('auth:setup', { username: '   ', displayName: 'المالك', password: 'pass1234' }, context),
    )
    expect(blankUsername.details).toEqual({ field: 'username' })
  })

  it('logs in with the right password and refuses the wrong one', async () => {
    const { context } = await makeContext()
    await setupOwner(context)
    expectSuccess(await runOperation('auth:logout', {}, context))

    const wrong = expectFailure(await runOperation('auth:login', { username: 'owner1', password: 'nope' }, context))
    expect(wrong.code).toBe('wrong_password')

    const missing = expectFailure(await runOperation('auth:login', { username: 'ghost', password: 'nope' }, context))
    expect(missing.code).toBe('not_found')

    const current = expectSuccess(await runOperation('auth:login', { username: 'owner1', password: 'pass1234' }, context)) as { permissions: string[] }
    expect(current.permissions.length).toBeGreaterThan(0)
  })

  it('clears the session on logout', async () => {
    const { context } = await makeContext()
    await setupOwner(context)
    expect(expectSuccess(await runOperation('auth:logout', {}, context))).toBe(true)
    expect(context.session.user()).toBeNull()
    expect(expectFailure(await runOperation('users:list', {}, context)).code).toBe('not_authenticated')
  })
})

describe('runOperation — validation errors carry the offending field', () => {
  it('reports the field name for a bad settings value', async () => {
    const { context } = await makeContext()
    await setupOwner(context)
    const error = expectFailure(await runOperation('settings:set', { key: 'shifts', value: 'yes' }, context))
    expect(error.code).toBe('invalid_input')
    expect(error.messageKey).toBe('errors.invalid_input')
    expect(error.details).toEqual({ field: 'value' })
  })

  it('rejects an unknown settings key', async () => {
    const { context } = await makeContext()
    await setupOwner(context)
    const error = expectFailure(await runOperation('settings:set', { key: 'telemetry', value: true }, context))
    expect(error.details).toEqual({ field: 'key' })
  })

  it('points at the indexed line field for a bad sale line', async () => {
    const { context } = await makeContext()
    await setupOwner(context)
    const error = expectFailure(
      await runOperation(
        'sales:complete',
        {
          lines: [{ productId: 'p1', unitNameSnapshot: 'piece', qtyBase: 0, unitPricePiasters: 1500 }],
          tenders: [],
          taxEnabled: false,
          cashRoundingStep: 0,
        },
        context,
      ),
    )
    expect(error.code).toBe('invalid_input')
    expect(error.details).toEqual({ field: 'lines[0].qtyBase' })
  })

  it('does not let a fractional piaster reach the services', async () => {
    const { context } = await makeContext()
    await setupOwner(context)
    const error = expectFailure(
      await runOperation(
        'sales:complete',
        {
          lines: [{ productId: 'p1', unitNameSnapshot: 'piece', qtyBase: 1, unitPricePiasters: 12.5 }],
          tenders: [],
          taxEnabled: false,
          cashRoundingStep: 0,
        },
        context,
      ),
    )
    expect(error.details).toEqual({ field: 'lines[0].unitPricePiasters' })
  })

  it('rejects a payload that is not an object', async () => {
    const { context } = await makeContext()
    const error = expectFailure(await runOperation('auth:login', 'not-an-object', context))
    expect(error.code).toBe('invalid_input')
    expect(error.details).toEqual({ field: 'payload' })
  })
})

describe('runOperation — a sale end to end over IPC', () => {
  it('prices a cash sale and reports the paid total', async () => {
    const { context, database } = await makeContext()
    const owner = await setupOwner(context)

    const product = expectSuccess(
      await runOperation(
        'catalog:create-product',
        {
          name: 'بطاطس',
          baseUnitName: 'piece',
          qtyScale: 0,
          costPricePiasters: 1000,
          sellingPricePiasters: 1500,
        },
        context,
      ),
    ) as { id: string; onHandQty: number }
    expect(product.onHandQty).toBe(0)

    // Stock arrives through purchases in Phase 2; seed the ledger directly here.
    const now = fixedClock.now()
    const settings = expectSuccess(await runOperation('settings:get', {}, context)) as { device_id: string }
    database
      .prepare(
        `INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run('sm_seed', product.id, 10, 10_000, 'purchase', now, owner.id, now, now, settings.device_id)

    const barcode = expectFailure(await runOperation('catalog:lookup-barcode', { barcode: '0000000000' }, context))
    expect(barcode.code).toBe('not_found')

    const sale = expectSuccess(
      await runOperation(
        'sales:complete',
        {
          lines: [{ productId: product.id, unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 2, unitPricePiasters: 1500 }],
          tenders: [{ method: 'cash', amountPiasters: 3000 }],
          taxEnabled: false,
          cashRoundingStep: 0,
        },
        context,
      ),
    ) as { sale: { totalPiasters: number; paidPiasters: number; duePiasters: number; invoiceNumber: string }; items: { qtyBase: number }[] }

    // 2 pieces × 1500 piasters = 3000 piasters, paid in full in cash.
    expect(sale.sale.totalPiasters).toBe(3000)
    expect(sale.sale.paidPiasters).toBe(3000)
    expect(sale.sale.duePiasters).toBe(0)
    expect(sale.sale.invoiceNumber).toBe('1')
    expect(sale.items).toHaveLength(1)

    const onHand = expectSuccess(await runOperation('inventory:on-hand', { productId: product.id }, context)) as { qty: number; valuePiasters: number }
    expect(onHand.qty).toBe(8)
    expect(onHand.valuePiasters).toBe(8000)
  })

  it('applies a percentage line discount and a percentage invoice discount', async () => {
    // Regression: the wire calls a percentage discount `percent`/`basisPoints`
    // while the domain calls it `percentage`/`rateBps`. Before the two were
    // mapped, any percentage discount failed inside the domain with
    // `invalid_discount` — a fixed discount worked, which is what hid it.
    const { context, database } = await makeContext()
    const owner = await setupOwner(context)

    const product = expectSuccess(
      await runOperation(
        'catalog:create-product',
        { name: 'جبنة', baseUnitName: 'piece', qtyScale: 0, costPricePiasters: 1000, sellingPricePiasters: 1500 },
        context,
      ),
    ) as { id: string }

    const now = fixedClock.now()
    const settings = expectSuccess(await runOperation('settings:get', {}, context)) as { device_id: string }
    database
      .prepare(
        `INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run('sm_seed_pct', product.id, 10, 10_000, 'purchase', now, owner.id, now, now, settings.device_id)

    const sale = expectSuccess(
      await runOperation(
        'sales:complete',
        {
          lines: [
            {
              productId: product.id,
              unitNameSnapshot: 'piece',
              pricedUnitQtyBase: 1,
              qtyBase: 2,
              unitPricePiasters: 1500,
              lineDiscount: { kind: 'percent', basisPoints: 500 },
            },
          ],
          invoiceDiscount: { kind: 'percent', basisPoints: 1000 },
          tenders: [{ method: 'cash', amountPiasters: 2565 }],
          taxEnabled: false,
          cashRoundingStep: 0,
        },
        context,
      ),
    ) as { sale: { totalPiasters: number; lineDiscountPiasters: number; invoiceDiscountPiasters: number; paidPiasters: number } }

    // 2 × 1500 = 3000; 5% line discount = 150 → 2850;
    // 10% invoice discount of 2850 = 285 → 2565 payable, tendered in cash.
    expect(sale.sale.lineDiscountPiasters).toBe(150)
    expect(sale.sale.invoiceDiscountPiasters).toBe(285)
    expect(sale.sale.totalPiasters).toBe(2565)
    expect(sale.sale.paidPiasters).toBe(2565)
  })

  /**
   * The selling screen is the only thing in the app that assembles a
   * `CompleteSaleInput`, so this half of the contract can only be proven from
   * the cart's side. The test is deliberately written *through* `cart.ts` — a
   * hand-written payload would pass while the cart quietly drifted away from
   * it, which is the failure that would matter (the screen showing one total
   * and the invoice recording another).
   */
  it('accepts the payload the POS cart builds, for the same total the screen shows', async () => {
    const { context, database } = await makeContext()
    const owner = await setupOwner(context)

    // A weighed product: the base unit is 1 kg held in thousandths, and the
    // price covers 1000 of them — so 30.00 is the price of one kilogram.
    const product = expectSuccess(
      await runOperation(
        'catalog:create-product',
        {
          name: 'رز',
          baseUnitName: 'كجم',
          qtyScale: 3,
          priceUnitQtyBase: 1000,
          costPricePiasters: 2000,
          sellingPricePiasters: 3000,
        },
        context,
      ),
    ) as ProductSummary

    const now = fixedClock.now()
    const settings = expectSuccess(await runOperation('settings:get', {}, context)) as { device_id: string }
    database
      .prepare(
        `INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run('sm_seed_cart', product.id, 5000, 10_000, 'purchase', now, owner.id, now, now, settings.device_id)

    // 1.5 kg, with 10% off that line.
    let cart: Cart = addProduct(emptyCart, product, -1, 1500)
    cart = setLineDiscount(cart, lineKey(product.id, 'كجم'), { kind: 'percent', basisPoints: 1000 })

    const options = { taxEnabled: false, cashRoundingStep: 0 }
    const screenTotals = cartTotals(cart, options)
    expect(screenTotals).not.toBeNull()
    if (screenTotals === null) return

    // 1500 g at 3000 piasters per 1000 g = 4500; 10% off = 450 → 4050 payable.
    expect(screenTotals.subtotal).toBe(4500)
    expect(screenTotals.lineDiscount).toBe(450)
    expect(screenTotals.total).toBe(4050)

    const sale = expectSuccess(
      await runOperation(
        'sales:complete',
        {
          customerId: null,
          shiftId: null,
          lines: toSaleLines(cart),
          ...(cart.invoiceDiscount === undefined ? {} : { invoiceDiscount: cart.invoiceDiscount }),
          tenders: [{ method: 'cash', amountPiasters: screenTotals.total }],
          notes: null,
          taxEnabled: options.taxEnabled,
          cashRoundingStep: options.cashRoundingStep,
        },
        context,
      ),
    ) as { sale: { totalPiasters: number; lineDiscountPiasters: number; duePiasters: number } }

    // The invoice records exactly what the screen showed.
    expect(sale.sale.totalPiasters).toBe(screenTotals.total)
    expect(sale.sale.lineDiscountPiasters).toBe(screenTotals.lineDiscount)
    expect(sale.sale.duePiasters).toBe(0)
  })
})
