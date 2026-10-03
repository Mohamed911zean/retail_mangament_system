import { safeInteger } from './integer'
import { err, ok, type DomainError, type Result } from './result'

type DocumentInput = {
  documentType: 'sale' | 'purchase' | 'expense'
  documentStatus: 'completed' | 'posted' | 'voided'
  hasCompletedReturns: boolean
  stockMovements: {
    id: string
    productId: string
    batchId: string | null
    movementType: string
    qtyDelta: number
    valueDeltaPiasters: number
  }[]
  moneyEntries: {
    id: string
    entryType: string
    method: string
    direction: 'in' | 'out'
    amountPiasters: number
  }[]
  currentOpenShiftId: string | null
  shiftsEnabled: boolean
  allowNegativeStock: boolean
  onHandQtyByProduct: Record<string, number>
}

export type VoidResult = {
  stockCompensations: {
    reversesMovementId: string
    productId: string
    batchId: string | null
    qtyDelta: number
    valueDeltaPiasters: number
  }[]
  moneyCompensations: {
    reversesEntryId: string
    method: string
    direction: 'in' | 'out'
    amountPiasters: number
    shiftId: string | null
  }[]
  createsNegativeStock: boolean
}

function checked(value: bigint): Result<number, DomainError> {
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  if (value < -max || value > max) return err({ code: 'overflow', message: 'void compensation exceeds safe integer range' })
  return ok(Number(value))
}

export function calculateVoidCompensation(input: DocumentInput): Result<VoidResult, DomainError> {
  if (input.documentStatus === 'voided') {
    return err({ code: 'document_already_voided', message: 'document is already voided' })
  }
  if (input.documentType === 'sale' && input.hasCompletedReturns) {
    return err({ code: 'void_blocked_by_returns', message: 'completed returns must be voided first' })
  }
  if (input.shiftsEnabled && input.currentOpenShiftId === null) {
    return err({ code: 'invalid_shift_state', message: 'an open shift is required for void compensation' })
  }

  const stockCompensations: VoidResult['stockCompensations'] = []
  const productDeltas = new Map<string, bigint>()
  for (const movement of input.stockMovements) {
    if (typeof movement.id !== 'string' || typeof movement.productId !== 'string') {
      return err({ code: 'invalid_input', message: 'stock movement identifiers must be strings' })
    }
    const qty = safeInteger(movement.qtyDelta, 'qtyDelta')
    const value = safeInteger(movement.valueDeltaPiasters, 'valueDeltaPiasters')
    if (!qty.ok) return qty
    if (!value.ok) return value
    stockCompensations.push({
      reversesMovementId: movement.id,
      productId: movement.productId,
      batchId: movement.batchId,
      qtyDelta: qty.value === 0 ? 0 : -qty.value,
      valueDeltaPiasters: -value.value,
    })
    productDeltas.set(
      movement.productId,
      (productDeltas.get(movement.productId) ?? 0n) - BigInt(qty.value),
    )
  }

  let createsNegativeStock = false
  if (input.documentType === 'purchase') {
    for (const [productId, compensation] of productDeltas) {
      const onHand = safeInteger(input.onHandQtyByProduct[productId], `onHandQtyByProduct.${productId}`)
      if (!onHand.ok) return onHand
      const newOnHand = checked(BigInt(onHand.value) + compensation)
      if (!newOnHand.ok) return newOnHand
      if (newOnHand.value < 0) {
        if (!input.allowNegativeStock) {
          return err({ code: 'insufficient_stock', message: 'voiding purchase would create negative stock', field: productId })
        }
        createsNegativeStock = true
      }
    }
  }

  const moneyCompensations: VoidResult['moneyCompensations'] = []
  for (const entry of input.moneyEntries) {
    if (typeof entry.id !== 'string' || typeof entry.method !== 'string') {
      return err({ code: 'invalid_input', message: 'money entry identifiers must be strings' })
    }
    const amount = safeInteger(entry.amountPiasters, 'amountPiasters')
    if (!amount.ok || amount.value < 0) {
      return err({ code: 'invalid_money', message: 'money amount must be non-negative', field: 'amountPiasters' })
    }
    moneyCompensations.push({
      reversesEntryId: entry.id,
      method: entry.method,
      direction: entry.direction === 'in' ? 'out' : 'in',
      amountPiasters: amount.value,
      shiftId: input.shiftsEnabled ? input.currentOpenShiftId : null,
    })
  }

  return ok({ stockCompensations, moneyCompensations, createsNegativeStock })
}
