import { calculateReturnRefund } from '../../../domain/returns'
import type { ReturnDetails } from '../../../shared/ipc'

/**
 * PURE return builder for the returns screen. The page owns loading and IPC;
 * everything here previews what the service will record, with the same domain
 * function, so the cashier sees the refund before it is written.
 */

/** Already-returned quantity and refund for one sale line, skipping voided returns. */
export function alreadyReturned(returns: readonly ReturnDetails[], saleItemId: string): { qtyBase: number; refundPiasters: number } {
  let qtyBase = 0
  let refundPiasters = 0
  for (const entry of returns) {
    if (entry.saleReturn.status === 'voided') continue
    for (const item of entry.items) {
      if (item.saleItemId !== saleItemId) continue
      qtyBase += item.qtyBase
      refundPiasters += item.refundPiasters
    }
  }
  return { qtyBase, refundPiasters }
}

export function remainingQty(originalQtyBase: number, alreadyQtyBase: number): number {
  return Math.max(0, originalQtyBase - alreadyQtyBase)
}

/**
 * The refund this line will produce, or null when the quantity is not
 * returnable (the service refuses the same input with `return_exceeds_original`).
 */
export function previewRefund(
  finalLineTotalPiasters: number,
  returnQtyBase: number,
  originalQtyBase: number,
  alreadyQtyBase: number,
  alreadyRefundedPiasters: number,
): number | null {
  const result = calculateReturnRefund(finalLineTotalPiasters, returnQtyBase, originalQtyBase, alreadyQtyBase, alreadyRefundedPiasters)
  return result.ok ? result.value : null
}
