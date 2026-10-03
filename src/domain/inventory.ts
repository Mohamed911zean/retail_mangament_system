import { safeInteger } from './integer'
import { mulDivRoundHalfUp } from './rounding'
import { err, ok, type DomainError, type Result } from './result'

type OnHand = { qty: number; value: number }

function nonNegative(value: number, field: string): Result<number, DomainError> {
  const result = safeInteger(value, field)
  if (!result.ok || result.value < 0) {
    return err({ code: 'invalid_quantity', message: `${field} must be non-negative`, field })
  }
  return ok(result.value)
}

function integer(value: number, field: string): Result<number, DomainError> {
  const result = safeInteger(value, field)
  if (!result.ok) return err({ code: 'invalid_input', message: `${field} must be a safe integer`, field })
  return result
}

function checked(value: bigint): Result<number, DomainError> {
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  if (value < -max || value > max) return err({ code: 'overflow', message: 'inventory value exceeds safe integer range' })
  return ok(Number(value))
}

export function calculateOnHand(
  movements: { qtyDelta: number; valueDeltaPiasters: number }[],
): Result<OnHand, DomainError> {
  let qty = 0n
  let value = 0n
  for (const movement of movements) {
    const q = integer(movement.qtyDelta, 'qtyDelta')
    if (!q.ok) return q
    const v = integer(movement.valueDeltaPiasters, 'valueDeltaPiasters')
    if (!v.ok) return v
    qty += BigInt(q.value)
    value += BigInt(v.value)
  }
  const qtyResult = checked(qty)
  if (!qtyResult.ok) return qtyResult
  const valueResult = checked(value)
  if (!valueResult.ok) return valueResult
  return ok({ qty: qtyResult.value, value: valueResult.value })
}

export function calculateOutgoingCost(
  onHandQty: number,
  onHandValue: number,
  qtyOut: number,
  defaultCostPiasters: number,
  priceUnitQtyBase: number,
): Result<number, DomainError> {
  const qtyResult = integer(onHandQty, 'onHandQty')
  if (!qtyResult.ok) return qtyResult
  const valueResult = integer(onHandValue, 'onHandValue')
  if (!valueResult.ok) return valueResult
  const outResult = nonNegative(qtyOut, 'qtyOut')
  if (!outResult.ok || outResult.value === 0) {
    return err({ code: 'invalid_quantity', message: 'qtyOut must be positive', field: 'qtyOut' })
  }
  const costResult = nonNegative(defaultCostPiasters, 'defaultCostPiasters')
  if (!costResult.ok) return costResult
  const unitResult = nonNegative(priceUnitQtyBase, 'priceUnitQtyBase')
  if (!unitResult.ok || unitResult.value === 0) {
    return err({ code: 'invalid_quantity', message: 'priceUnitQtyBase must be positive', field: 'priceUnitQtyBase' })
  }

  if (qtyResult.value > 0 && valueResult.value < 0) {
    return err({
      code: 'ledger_invariant_violation',
      message: 'positive on-hand quantity cannot have negative value',
      field: 'onHandValue',
    })
  }

  if (qtyResult.value > 0) {
    if (outResult.value === qtyResult.value) return ok(valueResult.value)
    if (outResult.value < qtyResult.value) {
      return mulDivRoundHalfUp(valueResult.value, outResult.value, qtyResult.value)
    }
    const remainder = mulDivRoundHalfUp(
      costResult.value,
      outResult.value - qtyResult.value,
      unitResult.value,
    )
    if (!remainder.ok) return remainder
    return checked(BigInt(valueResult.value) + BigInt(remainder.value))
  }
  return mulDivRoundHalfUp(costResult.value, outResult.value, unitResult.value)
}

export function calculateIncomingValueAtAverage(
  onHandQty: number,
  onHandValue: number,
  qtyIn: number,
  defaultCostPiasters: number,
  priceUnitQtyBase: number,
): Result<number, DomainError> {
  const qtyResult = integer(onHandQty, 'onHandQty')
  if (!qtyResult.ok) return qtyResult
  const valueResult = integer(onHandValue, 'onHandValue')
  if (!valueResult.ok) return valueResult
  const inResult = nonNegative(qtyIn, 'qtyIn')
  if (!inResult.ok || inResult.value === 0) return err({ code: 'invalid_quantity', message: 'qtyIn must be positive', field: 'qtyIn' })
  const costResult = nonNegative(defaultCostPiasters, 'defaultCostPiasters')
  if (!costResult.ok) return costResult
  const unitResult = nonNegative(priceUnitQtyBase, 'priceUnitQtyBase')
  if (!unitResult.ok || unitResult.value === 0) return err({ code: 'invalid_quantity', message: 'priceUnitQtyBase must be positive', field: 'priceUnitQtyBase' })
  if (qtyResult.value > 0 && valueResult.value < 0) {
    return err({
      code: 'ledger_invariant_violation',
      message: 'positive on-hand quantity cannot have negative value',
      field: 'onHandValue',
    })
  }

  if (qtyResult.value > 0) {
    return mulDivRoundHalfUp(valueResult.value, inResult.value, qtyResult.value)
  }
  return mulDivRoundHalfUp(costResult.value, inResult.value, unitResult.value)
}

export function calculateStockNormalization(
  qty: number,
  value: number,
): Result<{ revaluationPiasters: number }, DomainError> {
  const qtyResult = integer(qty, 'qty')
  if (!qtyResult.ok) return qtyResult
  const valueResult = integer(value, 'value')
  if (!valueResult.ok) return valueResult

  if (
    (qtyResult.value === 0 && valueResult.value !== 0) ||
    (qtyResult.value > 0 && valueResult.value < 0)
  ) {
    return ok({ revaluationPiasters: -valueResult.value })
  }
  return ok({ revaluationPiasters: 0 })
}

export type NegativeStockSettlement = {
  revaluationPiasters: number
  costVariancePiasters: number
  resultingQty: number
  resultingValue: number
}

export function calculateNegativeStockSettlement(
  onHandQty: number,
  onHandValue: number,
  incomingQty: number,
  incomingValue: number,
): Result<NegativeStockSettlement, DomainError> {
  const qtyResult = integer(onHandQty, 'onHandQty')
  if (!qtyResult.ok) return qtyResult
  const valueResult = integer(onHandValue, 'onHandValue')
  if (!valueResult.ok) return valueResult
  const inQtyResult = nonNegative(incomingQty, 'incomingQty')
  if (!inQtyResult.ok || inQtyResult.value === 0) return err({ code: 'invalid_quantity', message: 'incomingQty must be positive', field: 'incomingQty' })
  const inValueResult = nonNegative(incomingValue, 'incomingValue')
  if (!inValueResult.ok) return inValueResult

  const resultingQtyBig = BigInt(qtyResult.value) + BigInt(inQtyResult.value)
  const valueAfterBig = BigInt(valueResult.value) + BigInt(inValueResult.value)
  const qtyChecked = checked(resultingQtyBig)
  if (!qtyChecked.ok) return qtyChecked
  const valueAfter = checked(valueAfterBig)
  if (!valueAfter.ok) return valueAfter

  let revaluation = 0
  if (qtyResult.value < 0 && qtyChecked.value >= 0) {
    const desired = qtyChecked.value === 0
      ? 0
      : (() => {
          const result = mulDivRoundHalfUp(inValueResult.value, qtyChecked.value, inQtyResult.value)
          return result
        })()
    if (typeof desired !== 'number') {
      if (!desired.ok) return desired
      revaluation = desired.value - valueAfter.value
    } else {
      revaluation = desired - valueAfter.value
    }
  }
  const finalValue = checked(BigInt(valueAfter.value) + BigInt(revaluation))
  if (!finalValue.ok) return finalValue
  return ok({
    revaluationPiasters: revaluation,
    costVariancePiasters: revaluation === 0 ? 0 : -revaluation,
    resultingQty: qtyChecked.value,
    resultingValue: finalValue.value,
  })
}
