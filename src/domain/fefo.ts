import { allocateProportionally } from './allocation'
import { safeInteger } from './integer'
import { err, ok, type DomainError, type Result } from './result'

export type FefoBatch = {
  id: string
  qtyAvailable: number
  expiryAt: number | null
  receivedAt: number
}
export type FefoAllocation = { batchId: string; qty: number }

function nonNegative(value: number, field: string): Result<number, DomainError> {
  const result = safeInteger(value, field)
  if (!result.ok || result.value < 0) return err({ code: 'invalid_quantity', message: `${field} must be non-negative`, field })
  return ok(result.value)
}

export function allocateFefoBatches(
  requestedQty: number,
  batches: FefoBatch[],
  nowMs: number,
  allowExpired: boolean,
): Result<{ allocations: FefoAllocation[]; shortfallQty: number }, DomainError> {
  const requested = nonNegative(requestedQty, 'requestedQty')
  if (!requested.ok) return requested
  const now = safeInteger(nowMs, 'nowMs')
  if (!now.ok) return now
  if (requested.value === 0) return ok({ allocations: [], shortfallQty: 0 })

  const eligible: FefoBatch[] = []
  for (const batch of batches) {
    if (typeof batch.id !== 'string') return err({ code: 'invalid_input', message: 'batch id must be a string', field: 'id' })
    const qty = nonNegative(batch.qtyAvailable, 'qtyAvailable')
    if (!qty.ok) return qty
    const received = safeInteger(batch.receivedAt, 'receivedAt')
    if (!received.ok) return received
    if (batch.expiryAt !== null) {
      const expiry = safeInteger(batch.expiryAt, 'expiryAt')
      if (!expiry.ok) return expiry
      if (!allowExpired && expiry.value < now.value) continue
    }
    if (qty.value > 0) eligible.push({ ...batch, qtyAvailable: qty.value, receivedAt: received.value })
  }
  eligible.sort((left, right) => {
    if (left.expiryAt === null && right.expiryAt !== null) return 1
    if (left.expiryAt !== null && right.expiryAt === null) return -1
    if (left.expiryAt !== right.expiryAt) return (left.expiryAt ?? 0) - (right.expiryAt ?? 0)
    if (left.receivedAt !== right.receivedAt) return left.receivedAt - right.receivedAt
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })

  let remaining = requested.value
  const allocations: FefoAllocation[] = []
  for (const batch of eligible) {
    if (remaining === 0) break
    const qty = Math.min(remaining, batch.qtyAvailable)
    allocations.push({ batchId: batch.id, qty })
    remaining -= qty
  }
  return ok({ allocations, shortfallQty: remaining })
}

export function allocateCostAcrossBatches(
  totalCostPiasters: number,
  allocations: FefoAllocation[],
): Result<number[], DomainError> {
  const total = nonNegative(totalCostPiasters, 'totalCostPiasters')
  if (!total.ok) return total
  const weights: number[] = []
  for (const allocation of allocations) {
    if (typeof allocation.batchId !== 'string') return err({ code: 'invalid_input', message: 'batch id must be a string', field: 'batchId' })
    const qty = nonNegative(allocation.qty, 'qty')
    if (!qty.ok) return qty
    weights.push(qty.value)
  }
  return allocateProportionally(total.value, weights)
}
