import { safeInteger } from './integer'
import { err, ok, type DomainError, type Result } from './result'

export type Tender = { method: string; amountPiasters: number }
export type PaymentLedgerEntry = { method: string; amountPiasters: number }
export type PaymentStatus = 'paid' | 'partial' | 'credit'
export type PaymentAllocation = {
  paidPiasters: number
  duePiasters: number
  status: PaymentStatus
  ledgerEntries: PaymentLedgerEntry[]
  cashTenderedPiasters: number
  changePiasters: number
}

function invalid(message: string, field?: string): Result<never, DomainError> {
  return err({ code: 'invalid_payment', message, field })
}

export function calculatePaymentAllocation(
  totalPiasters: number,
  tenders: readonly Tender[],
  hasCustomer: boolean,
): Result<PaymentAllocation, DomainError> {
  const totalResult = safeInteger(totalPiasters, 'totalPiasters')
  if (!totalResult.ok || totalResult.value < 0) {
    return invalid('totalPiasters must be a non-negative safe integer', 'totalPiasters')
  }

  const merged = new Map<string, number>()
  let tenderedTotal = 0n
  let cashTendered = 0n
  for (const tender of tenders) {
    if (typeof tender.method !== 'string' || tender.method.length === 0) {
      return invalid('tender method must be a non-empty string', 'method')
    }
    const amountResult = safeInteger(tender.amountPiasters, 'amountPiasters')
    if (!amountResult.ok || amountResult.value <= 0) {
      return invalid('tender amount must be a positive safe integer', 'amountPiasters')
    }
    const amount = BigInt(amountResult.value)
    tenderedTotal += amount
    if (tender.method === 'cash') cashTendered += amount
    const current = merged.get(tender.method) ?? 0
    const next = BigInt(current) + amount
    if (next > BigInt(Number.MAX_SAFE_INTEGER)) {
      return err({ code: 'overflow', message: 'tender total exceeds safe integer range' })
    }
    merged.set(tender.method, Number(next))
  }

  const total = BigInt(totalResult.value)
  if (tenderedTotal < total) {
    if (!hasCustomer) return invalid('customer is required for unpaid amount')
    const paid = Number(tenderedTotal)
    const due = totalResult.value - paid
    return ok({
      paidPiasters: paid,
      duePiasters: due,
      status: paid === 0 ? 'credit' : 'partial',
      ledgerEntries: Array.from(merged, ([method, amountPiasters]) => ({ method, amountPiasters })),
      cashTenderedPiasters: Number(cashTendered),
      changePiasters: 0,
    })
  }

  const change = tenderedTotal - total
  const nonCash = tenderedTotal - cashTendered
  if (nonCash > total) return invalid('non-cash tender cannot exceed total')
  if (change > 0n && cashTendered === 0n) return invalid('change requires cash tender')
  const cashNet = cashTendered - change
  if (cashTendered > 0n && cashNet <= 0n) return invalid('cash net must remain positive')
  if (total === 0n && tenderedTotal > 0n) return invalid('zero total cannot accept tenders')

  const entries: PaymentLedgerEntry[] = []
  for (const [method, amountPiasters] of merged) {
    const net = method === 'cash' ? BigInt(amountPiasters) - change : BigInt(amountPiasters)
    if (net < 0n) return invalid('cash tender is insufficient after change')
    if (net > 0n) entries.push({ method, amountPiasters: Number(net) })
  }
  return ok({
    paidPiasters: totalResult.value,
    duePiasters: 0,
    status: 'paid',
    ledgerEntries: entries,
    cashTenderedPiasters: Number(cashTendered),
    changePiasters: Number(change),
  })
}
