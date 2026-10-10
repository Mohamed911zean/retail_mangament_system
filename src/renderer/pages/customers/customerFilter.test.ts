import { describe, expect, it } from 'vitest'
import type { CustomerSummary } from '../../../shared/ipc'
import { canManageCustomers, filterCustomers } from './customerFilter'

function customer(overrides: Partial<CustomerSummary> & { id: string; name: string }): CustomerSummary {
  return {
    phone: null,
    address: null,
    creditLimitPiasters: null,
    metadata: null,
    deletedAt: null,
    balancePiasters: 0,
    createdAt: 0,
    updatedAt: 0,
    deviceId: 'device',
    ...overrides,
  }
}

describe('filterCustomers', () => {
  const list = [
    customer({ id: 'a', name: 'محمد أحمد', phone: '01001234567' }),
    customer({ id: 'b', name: 'مصطفى', phone: null }),
  ]

  it('returns everything on an empty query', () => {
    expect(filterCustomers(list, '').map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('matches an Arabic name fragment', () => {
    expect(filterCustomers(list, 'محمد').map((entry) => entry.id)).toEqual(['a'])
  })

  it('matches a phone typed with Arabic-Indic digits', () => {
    expect(filterCustomers(list, '٠١٠٠١٢٣').map((entry) => entry.id)).toEqual(['a'])
  })

  it('lets owners and managers manage customers, but not cashiers', () => {
    expect(canManageCustomers('owner')).toBe(true)
    expect(canManageCustomers('manager')).toBe(true)
    expect(canManageCustomers('cashier')).toBe(false)
  })
})
