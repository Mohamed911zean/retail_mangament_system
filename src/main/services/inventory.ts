import type { DatabaseHandle } from '../database/repositories/common'
import { runInTransaction } from '../database/repositories/common'
import { getOnHand, insertStockBatch, listStockMovements, listStockBatches } from '../database/repositories/stock'
import { getStockCount, insertStockCount, updateStockCount, insertStockCountItem, listStockCountItems, listStockCounts } from '../database/repositories/stock-counts'
import { getProduct } from '../database/repositories/catalog'
import type { StockBatchRow, StockCountItemRow, StockCountRow, StockMovementRow } from '../database/rows'
import { applyMovement, type StockEngineDependencies } from './stockEngine'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import { noFaults } from './fault-injector'
import type { IdGenerator } from './ids'
import { createUlidGenerator } from './ids'
import type { Actor } from './permissions'
import { serviceErr, serviceOk, type ServiceResult } from './result'
import { writeAudit } from './audit'

type InventoryDeps = {
  database: DatabaseHandle
  clock: Clock
  ids?: IdGenerator
  deviceId: string
  allowNegativeStock: boolean
  faults?: FaultInjector
}

export class InventoryService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector
  private readonly engineDeps: StockEngineDependencies
  constructor(private readonly deps: InventoryDeps) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
    this.engineDeps = { ids: this.ids, clock: deps.clock, faults: this.faults, allowNegativeStock: deps.allowNegativeStock }
  }

  // ─── Ledger queries ────────────────────────────────────────────────────────

  async getOnHand(productId: string): Promise<ServiceResult<{ qty: number; valuePiasters: number }>> {
    try { return serviceOk(getOnHand(this.deps.database, productId)) } catch (e) { return serviceErr('database_error', e) }
  }

  async listMovements(productId?: string): Promise<ServiceResult<StockMovementRow[]>> {
    try { return serviceOk(listStockMovements(this.deps.database, productId)) } catch (e) { return serviceErr('database_error', e) }
  }

  async listBatches(productId: string): Promise<ServiceResult<StockBatchRow[]>> {
    try { return serviceOk(listStockBatches(this.deps.database, productId)) } catch (e) { return serviceErr('database_error', e) }
  }

  // ─── Adjustments (owner/manager only) ─────────────────────────────────────

  async adjust(actor: Actor, productId: string, qtyDelta: number, valuePiasters: number | undefined, reason: string): Promise<ServiceResult<{ movementId: string }>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      if (getProduct(this.deps.database, productId) === undefined) return serviceErr('not_found')
      let result!: ServiceResult<{ movementId: string; costPiasters: number; revaluationRows: string[] }>
      runInTransaction(this.deps.database, (tx) => {
        result = applyMovement(tx, this.engineDeps, {
          productId, qtyDelta, valuePiasters, movementType: 'adjustment', reason,
          userId: actor.userId, deviceId: this.deps.deviceId,
        })
        if (result.ok) {
          writeAudit(tx, this.ids, { userId: actor.userId, action: 'stock_adjusted', entityType: 'product', entityId: productId, after: { qtyDelta, reason }, now: this.deps.clock.now(), deviceId: this.deps.deviceId })
        }
        this.faults.after('inventory.adjusted_audited')
      })
      if (!result.ok) return result
      return serviceOk({ movementId: result.value.movementId })
    } catch (e) { return serviceErr('database_error', e) }
  }

  async recordDamage(actor: Actor, productId: string, qtyBase: number, reason: string): Promise<ServiceResult<{ movementId: string }>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      if (getProduct(this.deps.database, productId) === undefined) return serviceErr('not_found')
      let result!: ServiceResult<{ movementId: string; costPiasters: number; revaluationRows: string[] }>
      runInTransaction(this.deps.database, (tx) => {
        result = applyMovement(tx, this.engineDeps, {
          productId, qtyDelta: -qtyBase, movementType: 'damage', reason,
          userId: actor.userId, deviceId: this.deps.deviceId,
        })
        if (result.ok) {
          writeAudit(tx, this.ids, { userId: actor.userId, action: 'stock_damage', entityType: 'product', entityId: productId, after: { qtyDelta: -qtyBase, reason }, now: this.deps.clock.now(), deviceId: this.deps.deviceId })
        }
        this.faults.after('inventory.damage_audited')
      })
      if (!result.ok) return result
      return serviceOk({ movementId: result.value.movementId })
    } catch (e) { return serviceErr('database_error', e) }
  }

  // ─── Stock batches ─────────────────────────────────────────────────────────

  async createBatch(actor: Actor, productId: string, batchCode: string | null, expiryAt: number | null, receivedAt: number, initialQtyBase: number): Promise<ServiceResult<StockBatchRow[]>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      if (getProduct(this.deps.database, productId) === undefined) return serviceErr('not_found')
      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertStockBatch(tx, { id, productId, batchCode, expiryAt, receivedAt, initialQtyBase, createdAt: now, updatedAt: now, deviceId: this.deps.deviceId })
        this.faults.after('inventory.batch_created')
      })
      return serviceOk(listStockBatches(this.deps.database, productId))
    } catch (e) { return serviceErr('database_error', e) }
  }

  // ─── Stock counts ──────────────────────────────────────────────────────────

  async openStockCount(actor: Actor, notes: string | null): Promise<ServiceResult<StockCountRow>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertStockCount(tx, { id, status: 'draft', startedAt: now, userId: actor.userId, notes, createdAt: now, updatedAt: now, deviceId: this.deps.deviceId })
        this.faults.after('inventory.count_opened')
      })
      const row = getStockCount(this.deps.database, id)
      if (row === undefined) return serviceErr('database_error')
      return serviceOk(row)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async addCountItem(actor: Actor, stockCountId: string, productId: string, expectedQtyBase: number, countedQtyBase: number): Promise<ServiceResult<StockCountItemRow[]>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      const count = getStockCount(this.deps.database, stockCountId)
      if (count === undefined) return serviceErr('not_found')
      if (count.status !== 'draft') return serviceErr('stock_count_not_draft')
      const now = this.deps.clock.now()
      const id = this.ids.next()
      const differenceQtyBase = countedQtyBase - expectedQtyBase
      runInTransaction(this.deps.database, (tx) => {
        insertStockCountItem(tx, { id, stockCountId, productId, expectedQtyBase, countedQtyBase, differenceQtyBase, createdAt: now, updatedAt: now, deviceId: this.deps.deviceId })
        this.faults.after('inventory.count_item_added')
      })
      return serviceOk(listStockCountItems(this.deps.database, stockCountId))
    } catch (e) { return serviceErr('database_error', e) }
  }

  async postStockCount(actor: Actor, stockCountId: string): Promise<ServiceResult<StockCountRow>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      const count = getStockCount(this.deps.database, stockCountId)
      if (count === undefined) return serviceErr('not_found')
      if (count.status !== 'draft') return serviceErr('stock_count_not_draft')
      const items = listStockCountItems(this.deps.database, stockCountId)
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        for (const item of items) {
          if (item.differenceQtyBase === 0) continue
          applyMovement(tx, this.engineDeps, {
            productId: item.productId,
            qtyDelta: item.differenceQtyBase,
            movementType: 'count',
            referenceType: 'stock_count',
            referenceId: stockCountId,
            reason: 'stock_count',
            userId: actor.userId,
            deviceId: this.deps.deviceId,
          })
        }
        updateStockCount(tx, stockCountId, { status: 'posted', postedAt: now, updatedAt: now })
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'stock_count_posted', entityType: 'stock_count', entityId: stockCountId, after: { itemCount: items.length }, now, deviceId: this.deps.deviceId })
        this.faults.after('inventory.count_posted_audited')
      })
      const row = getStockCount(this.deps.database, stockCountId)
      if (row === undefined) return serviceErr('database_error')
      return serviceOk(row)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async listStockCounts(): Promise<ServiceResult<StockCountRow[]>> {
    try { return serviceOk(listStockCounts(this.deps.database)) } catch (e) { return serviceErr('database_error', e) }
  }
}
