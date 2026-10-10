/**
 * The arithmetic of the payment dialog — pure, so it can be unit tested and so
 * the dialog never invents a number the sale service disagrees with.
 *
 * The service is still the authority: it re-allocates the tenders, writes the
 * ledger and computes `paid`/`due` itself (AGENTS.md §4). Everything here exists
 * to show the cashier the change **before** the sale is written, and to decide
 * whether the sale may be completed at all.
 *
 * Integers only: money in piasters, exactly as it crosses IPC.
 */
import type { CustomerSummary, PaymentMethod, SaleTender } from '../../../shared/ipc'

/** One tender as the dialog holds it, before it becomes a `SaleTender`. */
export type TenderDraft = { method: PaymentMethod; amountPiasters: number }

/**
 * Egyptian notes, in piasters, for the quick cash buttons (§4.5).
 * Smallest first, so the row reads right-to-left in the same order as the notes
 * come out of the drawer.
 */
export const EGYPTIAN_NOTES_PIASTERS = [500, 1000, 2000, 5000, 10000, 20000] as const

function sum(tenders: readonly TenderDraft[], method: PaymentMethod): number {
  return tenders.reduce((total, tender) => (tender.method === method ? total + tender.amountPiasters : total), 0)
}

export function tenderedTotal(tenders: readonly TenderDraft[]): number {
  return tenders.reduce((total, tender) => total + tender.amountPiasters, 0)
}

export function cashTendered(tenders: readonly TenderDraft[]): number {
  return sum(tenders, 'cash')
}

/** Card and wallet are treated alike: money that arrived, but no change. */
export function nonCashTendered(tenders: readonly TenderDraft[]): number {
  return tenderedTotal(tenders) - cashTendered(tenders)
}

/**
 * What is still unpaid after the tenders.
 *
 * Never negative: over-tendering cash is change, not a negative debt — an
 * invoice of 30 with a 50 note leaves 0 due and 20 in change.
 */
export function remainingDue(totalPiasters: number, tenders: readonly TenderDraft[]): number {
  return Math.max(0, totalPiasters - tenderedTotal(tenders))
}

/**
 * The change handed back, in cash only.
 *
 * 30 due, 50 cash → 20 change. 30 due, 10 card + 25 cash → 5 change, because the
 * card covered the first 10. Change is always paid in cash, which is the rule a
 * shop actually follows.
 */
export function changeDue(totalPiasters: number, tenders: readonly TenderDraft[]): number {
  if (totalPiasters <= 0) return 0
  const owedAfterCards = Math.max(0, totalPiasters - nonCashTendered(tenders))
  return Math.max(0, cashTendered(tenders) - owedAfterCards)
}

export type PaymentCheck =
  | { ok: true }
  /** Nothing to collect: the cart priced to zero. */
  | { ok: false; reason: 'nothing_to_pay' }
  /** Part of the invoice would stay unpaid but no customer is attached to it. */
  | { ok: false; reason: 'needs_customer' }
  /** Credit selling is switched off, so the invoice must be paid in full. */
  | { ok: false; reason: 'needs_full_payment' }

export function checkPayment(input: {
  totalPiasters: number
  tenders: readonly TenderDraft[]
  customerId: string | null
  /** `settings.customer_credit`. */
  creditEnabled: boolean
}): PaymentCheck {
  if (input.totalPiasters <= 0) return { ok: false, reason: 'nothing_to_pay' }
  if (remainingDue(input.totalPiasters, input.tenders) === 0) return { ok: true }
  if (!input.creditEnabled) return { ok: false, reason: 'needs_full_payment' }
  if (input.customerId === null) return { ok: false, reason: 'needs_customer' }
  return { ok: true }
}

/**
 * True when this sale would push the customer past their credit limit.
 *
 * Advisory only — the service enforces the limit and answers
 * `credit_limit_exceeded`. The dialog warns first so a cashier at the counter is
 * not surprised by a refusal after the customer has already walked off.
 */
export function exceedsCreditLimit(customer: CustomerSummary | null, extraDuePiasters: number): boolean {
  if (customer === null || customer.creditLimitPiasters === null) return false
  return customer.balancePiasters + extraDuePiasters > customer.creditLimitPiasters
}

/** Adds a note to the cash tender — how a cashier hands over money. */
export function addCash(tenders: readonly TenderDraft[], amountPiasters: number): TenderDraft[] {
  const cash = cashTendered(tenders)
  return [...tenders.filter((tender) => tender.method !== 'cash'), { method: 'cash', amountPiasters: cash + amountPiasters }]
}

/** Replaces the cash tender outright, e.g. the tendered field or "بالضبط". */
export function setCash(tenders: readonly TenderDraft[], amountPiasters: number): TenderDraft[] {
  const others = tenders.filter((tender) => tender.method !== 'cash')
  return amountPiasters > 0 ? [...others, { method: 'cash', amountPiasters }] : others
}

/** Sets the tender for one non-cash method, replacing whatever it had. */
export function setMethodTender(tenders: readonly TenderDraft[], method: PaymentMethod, amountPiasters: number): TenderDraft[] {
  const others = tenders.filter((tender) => tender.method !== method)
  return amountPiasters > 0 ? [...others, { method, amountPiasters }] : others
}

/** The payload shape `sales:complete` validates. Empty tenders are dropped. */
export function toTenders(tenders: readonly TenderDraft[]): SaleTender[] {
  return tenders.filter((tender) => tender.amountPiasters > 0).map((tender) => ({ method: tender.method, amountPiasters: tender.amountPiasters }))
}
