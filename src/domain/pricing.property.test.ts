import { describe, expect, it } from 'vitest'
import { allocateProportionally } from './allocation'
import { calculateDiscountAmount, type Discount } from './discount'
import {
  calculateLineAmounts,
  type LineInput,
} from './lineAmounts'
import { calculateLineSubtotal } from './pricing'
import { calculateSaleTotals } from './saleTotals'

function sum(values: number[]): number {
  let total = 0
  for (const value of values) {
    total += value
  }
  return total
}

describe('pricing seeded cart properties', () => {
  it('preserves allocation, tax, and total invariants across 3000 carts', () => {
    let state = 0x2468ace1n

    function next(maximum: number): number {
      state = (state * 1664525n + 1013904223n) % 4294967296n
      return Number(state % BigInt(maximum))
    }

    for (let cartIndex = 0; cartIndex < 3000; cartIndex += 1) {
      const lineCount = next(8) + 1
      const lines: LineInput[] = []
      for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
        const discountChoice = next(3)
        const lineDiscount: Discount | undefined =
          discountChoice === 0
            ? undefined
            : discountChoice === 1
              ? { kind: 'fixed', amountPiasters: next(20000) }
              : { kind: 'percentage', rateBps: next(10001) }

        lines.push({
          unitPricePiasters: next(50001),
          qtyBase: next(5000) + 1,
          pricedUnitQtyBase: [1, 12, 1000][next(3)],
          lineDiscount,
          taxRateBps: next(10001),
        })
      }

      const invoiceDiscount: Discount =
        next(2) === 0
          ? { kind: 'fixed', amountPiasters: next(50000) }
          : { kind: 'percentage', rateBps: next(10001) }
      const taxEnabled = next(2) === 1
      const lineResult = calculateLineAmounts(lines, invoiceDiscount, taxEnabled)
      expect(lineResult.ok).toBe(true)
      if (!lineResult.ok) continue

      const weights: number[] = []
      for (const line of lines) {
        const subtotalResult = calculateLineSubtotal(
          line.unitPricePiasters,
          line.qtyBase,
          line.pricedUnitQtyBase,
        )
        expect(subtotalResult.ok).toBe(true)
        if (!subtotalResult.ok) continue

        const lineDiscountResult = line.lineDiscount
          ? calculateDiscountAmount(subtotalResult.value, line.lineDiscount)
          : { ok: true as const, value: 0 }
        expect(lineDiscountResult.ok).toBe(true)
        if (!lineDiscountResult.ok) continue
        weights.push(subtotalResult.value - lineDiscountResult.value)
      }

      const appliedInvoiceDiscount = calculateDiscountAmount(
        sum(weights),
        invoiceDiscount,
      )
      expect(appliedInvoiceDiscount.ok).toBe(true)
      if (!appliedInvoiceDiscount.ok) continue

      const allocations = lineResult.value.map(
        (line) => line.invoiceDiscountAllocated,
      )
      expect(sum(allocations)).toBe(appliedInvoiceDiscount.value)

      for (let index = 0; index < lineResult.value.length; index += 1) {
        const line = lineResult.value[index]
        expect(line.finalLineTotal).toBeGreaterThanOrEqual(0)
        expect(line.invoiceDiscountAllocated).toBeLessThanOrEqual(weights[index])
        expect(line.net + line.tax).toBe(line.finalLineTotal)
      }

      const totalsResult = calculateSaleTotals(lineResult.value, next(101))
      expect(totalsResult.ok).toBe(true)
      if (!totalsResult.ok) continue
      expect(totalsResult.value.subtotal).toBe(
        sum(lineResult.value.map((line) => line.lineSubtotal)),
      )
      expect(totalsResult.value.lineDiscount).toBe(
        sum(lineResult.value.map((line) => line.lineDiscount)),
      )
      expect(totalsResult.value.invoiceDiscount).toBe(
        sum(lineResult.value.map((line) => line.invoiceDiscountAllocated)),
      )
      expect(totalsResult.value.tax).toBe(
        sum(lineResult.value.map((line) => line.tax)),
      )
      expect(totalsResult.value.preRoundTotal).toBe(
        sum(lineResult.value.map((line) => line.finalLineTotal)),
      )
      expect(totalsResult.value.total).toBe(
        totalsResult.value.preRoundTotal +
          totalsResult.value.roundingAdjustment,
      )

      const allocationResult = allocateProportionally(
        appliedInvoiceDiscount.value,
        weights,
      )
      expect(allocationResult.ok).toBe(true)
      if (allocationResult.ok) {
        expect(sum(allocationResult.value)).toBe(appliedInvoiceDiscount.value)
      }
    }
  }, 30000)
})
