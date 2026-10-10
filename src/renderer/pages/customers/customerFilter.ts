import { normalizeDigits } from '../../../shared/digits'
import type { Role } from '../../../shared/permissions'
import type { CustomerSummary } from '../../../shared/ipc'

/**
 * PURE helpers for the customers screen: searching and role gating. The page
 * owns loading and IPC; everything here is decided from values on screen.
 */

/** Matches an Arabic name fragment or a phone number, digits folded first. */
export function filterCustomers(customers: readonly CustomerSummary[], query: string): CustomerSummary[] {
  const needle = normalizeDigits(query).trim().toLowerCase()
  if (needle.length === 0) return [...customers]
  return customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(needle) ||
      (customer.phone !== null && normalizeDigits(customer.phone).toLowerCase().includes(needle)),
  )
}

/** The customer service refuses every mutation from a cashier. */
export function canManageCustomers(role: Role): boolean {
  return role !== 'cashier'
}
