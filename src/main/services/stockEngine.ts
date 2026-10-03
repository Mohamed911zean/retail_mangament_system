import {
  allocateCostAcrossBatches,
  allocateFefoBatches,
  type FefoBatch,
} from '../../domain/fefo'
import {
  calculateIncomingValueAtAverage,
  calculateNegativeStockSettlement,
  calculateOutgoingCost,
  calculateStockNormalization,
} from '../../domain/inventory'
import type { DatabaseHandle } from '../database/repositories/common'
import { getOnHand, insertStockMovement, listStockBatches } from '../database/repositories/stock'
import { getProduct } from '../database/repositories/catalog'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import type { IdGenerator } from './ids'
import { serviceErr, serviceOk, type ServiceResult } from './result'

export type MovementInput = {
  productId: string
  qtyDelta: number
  movementType: 'purchase' | 'sale' | 'sale_return' | 'adjustment' | 'damage' | 'count' | 'void_compensation'
  valuePiasters?: number
  batchId?: string | null
  referenceType?: string | null
  referenceId?: string | null
  reversesMovementId?: string | null
  reason?: string | null
  userId: string
  deviceId: string
}

export type StockEngineDependencies = {
  ids: IdGenerator
  clock: Clock
  faults?: FaultInjector
  allowNegativeStock: boolean
}

export type AppliedMovement = {
  movementId: string
  costPiasters: number
  revaluationRows: string[]
}

export function applyMovement(
  database: DatabaseHandle,
  dependencies: StockEngineDependencies,
  movement: MovementInput,
): ServiceResult<AppliedMovement> {
  try {
    const product = getProduct(database, movement.productId)
    if (product === undefined) return serviceErr('not_found', { productId: movement.productId })
    const onHand = getOnHand(database, movement.productId)
    const now = dependencies.clock.now()
    const incoming = movement.qtyDelta > 0
    if (!incoming && !dependencies.allowNegativeStock && movement.qtyDelta < 0 && onHand.qty + movement.qtyDelta < 0) {
      return serviceErr('insufficient_stock', { productId: movement.productId })
    }
    let value = movement.valuePiasters ?? 0
    let costPiasters = 0
    if (incoming) {
      if (movement.valuePiasters === undefined) {
        const result = calculateIncomingValueAtAverage(
          onHand.qty,
          onHand.valuePiasters,
          movement.qtyDelta,
          product.costPricePiasters,
          product.priceUnitQtyBase,
        )
        if (!result.ok) return serviceErr(result.error.code, result.error)
        value = result.value
      }
      const settlement = calculateNegativeStockSettlement(onHand.qty, onHand.valuePiasters, movement.qtyDelta, value)
      if (!settlement.ok) return serviceErr(settlement.error.code, settlement.error)
      costPiasters = value
      const movementId = dependencies.ids.next()
      insertStockMovement(database, {
        id: movementId,
        productId: movement.productId,
        batchId: movement.batchId ?? null,
        qtyDelta: movement.qtyDelta,
        valueDeltaPiasters: value,
        movementType: movement.movementType,
        reversesMovementId: movement.reversesMovementId ?? null,
        referenceType: movement.referenceType ?? null,
        referenceId: movement.referenceId ?? null,
        occurredAt: now,
        reason: movement.reason ?? null,
        createdByUserId: movement.userId,
        createdAt: now,
        updatedAt: now,
        deviceId: movement.deviceId,
      })
      dependencies.faults?.after('stock.movement_inserted')
      const revaluationRows: string[] = []
      if (settlement.value.revaluationPiasters !== 0) {
        const id = dependencies.ids.next()
        insertStockMovement(database, {
          id, productId: movement.productId, qtyDelta: 0, valueDeltaPiasters: settlement.value.revaluationPiasters,
          movementType: 'revaluation', occurredAt: now, reason: 'negative_stock_settlement',
          createdByUserId: movement.userId, createdAt: now, updatedAt: now, deviceId: movement.deviceId,
        })
        revaluationRows.push(id)
      }
      return finalize(database, dependencies, movement, movementId, costPiasters, revaluationRows)
    }
    const outgoing = calculateOutgoingCost(onHand.qty, onHand.valuePiasters, -movement.qtyDelta, product.costPricePiasters, product.priceUnitQtyBase)
    if (!outgoing.ok) return serviceErr(outgoing.error.code, outgoing.error)
    costPiasters = outgoing.value
    const movementId = dependencies.ids.next()
    insertStockMovement(database, {
      id: movementId, productId: movement.productId, batchId: movement.batchId ?? null,
      qtyDelta: movement.qtyDelta, valueDeltaPiasters: -costPiasters, movementType: movement.movementType,
      reversesMovementId: movement.reversesMovementId ?? null, referenceType: movement.referenceType ?? null,
      referenceId: movement.referenceId ?? null, occurredAt: now, reason: movement.reason ?? null,
      createdByUserId: movement.userId, createdAt: now, updatedAt: now, deviceId: movement.deviceId,
    })
    dependencies.faults?.after('stock.movement_inserted')
    return finalize(database, dependencies, movement, movementId, costPiasters, [])
  } catch (error) {
    return serviceErr('database_error', error)
  }
}

function finalize(
  database: DatabaseHandle,
  dependencies: StockEngineDependencies,
  movement: MovementInput,
  movementId: string,
  costPiasters: number,
  revaluationRows: string[],
): ServiceResult<AppliedMovement> {
  const onHand = getOnHand(database, movement.productId)
  const normalized = calculateStockNormalization(onHand.qty, onHand.valuePiasters)
  if (!normalized.ok) return serviceErr(normalized.error.code, normalized.error)
  if (normalized.value.revaluationPiasters !== 0) {
    const now = dependencies.clock.now()
    const id = dependencies.ids.next()
    insertStockMovement(database, {
      id, productId: movement.productId, qtyDelta: 0, valueDeltaPiasters: normalized.value.revaluationPiasters,
      movementType: 'revaluation', occurredAt: now, reason: 'stock_normalization',
      createdByUserId: movement.userId, createdAt: now, updatedAt: now, deviceId: movement.deviceId,
    })
    revaluationRows.push(id)
  }
  const final = getOnHand(database, movement.productId)
  if (final.qty === 0 && final.valuePiasters !== 0) return serviceErr('ledger_invariant_violation')
  if (final.qty > 0 && final.valuePiasters < 0) return serviceErr('ledger_invariant_violation')
  return serviceOk({ movementId, costPiasters, revaluationRows })
}

export function allocateBatches(
  database: DatabaseHandle,
  productId: string,
  requestedQty: number,
  now: number,
  allowExpired: boolean,
  totalCostPiasters: number,
): ServiceResult<{ batchId: string; qty: number; costPiasters: number }[]> {
  const rows = listStockBatches(database, productId)
  const batches: FefoBatch[] = rows.map((row) => ({
    id: row.id,
    qtyAvailable: row.initialQtyBase,
    expiryAt: row.expiryAt,
    receivedAt: row.receivedAt,
  }))
  const allocation = allocateFefoBatches(requestedQty, batches, now, allowExpired)
  if (!allocation.ok) return serviceErr(allocation.error.code, allocation.error)
  if (allocation.value.shortfallQty > 0) return serviceErr('insufficient_stock', allocation.value)
  const costs = allocateCostAcrossBatches(totalCostPiasters, allocation.value.allocations)
  if (!costs.ok) return serviceErr(costs.error.code, costs.error)
  return serviceOk(allocation.value.allocations.map((item, index) => ({ ...item, costPiasters: costs.value[index] })))
}
