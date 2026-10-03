import { safeInteger } from './integer'
import { mulDivRoundHalfUp } from './rounding'
import { err, type DomainError, type Result } from './result'

export function calculateLineSubtotal(
  unitPricePiasters: number,
  qtyBase: number,
  pricedUnitQtyBase: number,
): Result<number, DomainError> {
  const priceResult = safeInteger(unitPricePiasters, 'unitPricePiasters')
  if (!priceResult.ok || priceResult.value < 0) {
    return err({
      code: 'invalid_money',
      message: 'unitPricePiasters must be a non-negative safe integer',
      field: 'unitPricePiasters',
    })
  }

  const quantityResult = safeInteger(qtyBase, 'qtyBase')
  if (!quantityResult.ok || quantityResult.value <= 0) {
    return err({
      code: 'invalid_quantity',
      message: 'qtyBase must be a positive safe integer',
      field: 'qtyBase',
    })
  }

  const pricedUnitResult = safeInteger(pricedUnitQtyBase, 'pricedUnitQtyBase')
  if (!pricedUnitResult.ok || pricedUnitResult.value <= 0) {
    return err({
      code: 'invalid_quantity',
      message: 'pricedUnitQtyBase must be a positive safe integer',
      field: 'pricedUnitQtyBase',
    })
  }

  return mulDivRoundHalfUp(
    priceResult.value,
    quantityResult.value,
    pricedUnitResult.value,
  )
}
