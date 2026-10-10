import { describe, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { CatalogService } from './catalog'
import type { Clock } from './clock'
import type { IdGenerator } from './ids'
import type { Actor } from './permissions'

const fixedClock: Clock = { now: () => 1700000000000 }
function testIds(): IdGenerator {
  let counter = 0
  return { next: () => `01CAT${String(++counter).padStart(21, '0')}` }
}

const ownerActor: Actor = { userId: 'u1', role: 'owner', deviceId: 'd1' }
const cashierActor: Actor = { userId: 'u2', role: 'cashier', deviceId: 'd1' }

let rootCounter = 0
async function makeService() {
  const root = join(tmpdir(), `small-shop-pos-catalog-${Date.now()}-${rootCounter++}`)
  mkdirSync(root, { recursive: true })
  const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
  const now = fixedClock.now()
  context.database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','owner','Owner','hash','owner',1,${now},${now},'d1'),
           ('u2','cashier','Cashier','hash','cashier',1,${now},${now},'d1');

    INSERT INTO categories (id,name,sort_order,created_at,updated_at,device_id)
    VALUES ('cat1','معلبات',0,${now},${now},'d1');
  `)
  const service = new CatalogService({ database: context.database, clock: fixedClock, ids: testIds(), deviceId: 'd1' })
  return { service, context, database: context.database, root }
}

/** One stock movement is what freezes the packaging fields (`product_has_movements`). */
function seedMovement(context: Awaited<ReturnType<typeof openDatabase>>, productId: string, qty: number): void {
  const now = fixedClock.now()
  context.database
    .prepare(
      `INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(`sm_${productId}`, productId, qty, qty * 100, 'purchase', now, 'u1', now, now, 'd1')
}

describe('CatalogService — product create and update', () => {
  it('stores the expiry flag the products screen sends', async () => {
    // Regression: `trackExpiry` existed in the service and in the schema, but the
    // wire type never carried it, so a shop could not switch expiry on for a
    // product and the expiry report would stay empty forever.
    const { service, context } = await makeService()
    const created = await service.createProduct(ownerActor, {
      name: 'جبنة رومي',
      categoryId: 'cat1',
      baseUnitName: 'كجم',
      qtyScale: 3,
      priceUnitQtyBase: 1000,
      trackExpiry: true,
      isWeighted: true,
      lowStockThresholdQty: 2000,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.trackExpiry).toBe(true)
    expect(created.value.isWeighted).toBe(true)
    expect(created.value.categoryId).toBe('cat1')
    expect(created.value.lowStockThresholdQty).toBe(2000)
    closeDatabase(context)
  })

  it('updates packaging, weight and expiry while the product has no movements', async () => {
    const { service, context } = await makeService()
    const created = await service.createProduct(ownerActor, { name: 'زبادي', baseUnitName: 'piece' })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const updated = await service.updateProduct(ownerActor, created.value.id, {
      baseUnitName: 'كجم',
      qtyScale: 3,
      priceUnitQtyBase: 1000,
      trackExpiry: true,
      isWeighted: true,
    })
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    expect(updated.value.baseUnitName).toBe('كجم')
    expect(updated.value.qtyScale).toBe(3)
    expect(updated.value.priceUnitQtyBase).toBe(1000)
    expect(updated.value.trackExpiry).toBe(true)
    expect(updated.value.isWeighted).toBe(true)
    closeDatabase(context)
  })

  it('refuses a packaging change once the product has moved, but accepts a resubmit', async () => {
    const { service, context } = await makeService()
    const created = await service.createProduct(ownerActor, { name: 'أرز', baseUnitName: 'piece' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    seedMovement(context, created.value.id, 5)

    const refused = await service.updateProduct(ownerActor, created.value.id, { qtyScale: 3 })
    expect(refused).toMatchObject({ ok: false, error: { code: 'product_has_movements' } })

    // A form submits every field on every save, so re-sending the value already
    // stored must not read as a change — otherwise the product could never be
    // saved again after its first purchase.
    const resubmit = await service.updateProduct(ownerActor, created.value.id, {
      name: 'أرز مصري',
      baseUnitName: 'piece',
      qtyScale: 0,
      priceUnitQtyBase: 1,
    })
    expect(resubmit.ok).toBe(true)
    if (!resubmit.ok) return
    expect(resubmit.value.name).toBe('أرز مصري')

    // A rename that leaves the packaging alone is fine on a moved product.
    const renameOnly = await service.updateProduct(ownerActor, created.value.id, { name: 'أرز بلدي' })
    expect(renameOnly).toMatchObject({ ok: true })
    closeDatabase(context)
  })
})

describe('CatalogService — units', () => {
  it('refuses a duplicate unit name on one product but allows it on another', async () => {
    const { service, context } = await makeService()
    const first = await service.createProduct(ownerActor, { name: 'شيبسي', baseUnitName: 'piece' })
    const second = await service.createProduct(ownerActor, { name: 'بسكويت', baseUnitName: 'piece' })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(await service.addProductUnit(ownerActor, first.value.id, 'كرتونة', 24, 24000)).toMatchObject({ ok: true })

    // Two units called "كرتونة" on the same product would make the POS cart's
    // line key (built from the unit name) ambiguous, so the second is refused.
    const duplicate = await service.addProductUnit(ownerActor, first.value.id, 'كرتونة', 12, 12000)
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'invalid_input' } })
    if (duplicate.ok) return
    expect(duplicate.error.details).toEqual({ field: 'unitName', message: 'unit name already used' })

    // The check is per product, not global.
    expect(await service.addProductUnit(ownerActor, second.value.id, 'كرتونة', 12, 12000)).toMatchObject({ ok: true })
    closeDatabase(context)
  })

  it('soft-deletes a unit, refuses a cashier, and frees the name again', async () => {
    const { service, context } = await makeService()
    const created = await service.createProduct(ownerActor, { name: 'لبن', baseUnitName: 'piece' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const added = await service.addProductUnit(ownerActor, created.value.id, 'كرتونة', 12, 12000)
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const unitId = added.value[0].id

    expect(await service.removeProductUnit(cashierActor, created.value.id, unitId)).toMatchObject({
      ok: false,
      error: { code: 'permission_denied' },
    })

    expect(await service.removeProductUnit(ownerActor, created.value.id, unitId)).toMatchObject({ ok: true, value: [] })
    expect(await service.listProductUnits(created.value.id)).toMatchObject({ ok: true, value: [] })

    // Soft delete, not a row delete: the row survives for documents that already
    // referenced it, and only leaves the list.
    const stored = context.database.prepare('SELECT deleted_at FROM product_units WHERE id = ?').get(unitId) as { deleted_at: number | null }
    expect(stored.deleted_at).toBe(fixedClock.now())

    expect(await service.removeProductUnit(ownerActor, created.value.id, unitId)).toMatchObject({ ok: false, error: { code: 'not_found' } })

    // Soft-deleted, so the name is free for a fresh unit.
    expect(await service.addProductUnit(ownerActor, created.value.id, 'كرتونة', 12, 12000)).toMatchObject({ ok: true })
    closeDatabase(context)
  })
})

describe('CatalogService — barcodes', () => {
  it('soft-deletes a code and frees it for reuse', async () => {
    const { service, context } = await makeService()
    const created = await service.createProduct(ownerActor, { name: 'مياه', baseUnitName: 'piece' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(await service.addBarcode(ownerActor, created.value.id, '6221031001234', true)).toMatchObject({ ok: true })

    // A second product may not take a live code.
    const other = await service.createProduct(ownerActor, { name: 'عصير', baseUnitName: 'piece' })
    expect(other.ok).toBe(true)
    if (!other.ok) return
    expect(await service.addBarcode(ownerActor, other.value.id, '6221031001234', true)).toMatchObject({
      ok: false,
      error: { code: 'invalid_input' },
    })

    expect(await service.removeBarcode(ownerActor, created.value.id, '6221031001234')).toMatchObject({ ok: true, value: [] })

    // The unique index is partial (`WHERE deleted_at IS NULL`), so a mis-typed
    // code is not burned forever.
    expect(await service.addBarcode(ownerActor, other.value.id, '6221031001234', true)).toMatchObject({ ok: true })
    closeDatabase(context)
  })

  it('refuses a barcode through the wrong product, and refuses a cashier', async () => {
    const { service, context } = await makeService()
    const first = await service.createProduct(ownerActor, { name: 'شاي', baseUnitName: 'piece' })
    const second = await service.createProduct(ownerActor, { name: 'قهوة', baseUnitName: 'piece' })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(await service.addBarcode(ownerActor, first.value.id, '6221031009999', true)).toMatchObject({ ok: true })

    expect(await service.removeBarcode(ownerActor, second.value.id, '6221031009999')).toMatchObject({
      ok: false,
      error: { code: 'not_found' },
    })
    expect(await service.removeBarcode(cashierActor, first.value.id, '6221031009999')).toMatchObject({
      ok: false,
      error: { code: 'permission_denied' },
    })
    expect(await service.removeBarcode(ownerActor, first.value.id, '6221031009999')).toMatchObject({ ok: true })
    closeDatabase(context)
  })
})
