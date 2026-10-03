import { describe, expect, it } from 'vitest'
import { calculateCustomerBalance, calculateSupplierBalance } from './balances'

describe('calculateCustomerBalance', () => {
  it.each([
    [{ sales: [], receipts: [], returns: [] }, 0, 'settled'],
    [{ sales: [{ status: 'completed', duePiasters: 6000 }], receipts: [], returns: [] }, 6000, 'due'],
    [{ sales: [{ status: 'completed', duePiasters: 6000 }], receipts: [{ direction: 'in', amountPiasters: 2000 }], returns: [] }, 4000, 'due'],
    [{ sales: [{ status: 'completed', duePiasters: 6000 }], receipts: [{ direction: 'in', amountPiasters: 2000 }, { direction: 'out', amountPiasters: 2000 }], returns: [] }, 6000, 'due'],
    [{ sales: [{ status: 'voided', duePiasters: 6000 }], receipts: [], returns: [] }, 0, 'settled'],
    [{ sales: [{ status: 'completed', duePiasters: 6000 }], receipts: [], returns: [{ status: 'completed', creditedToAccountPiasters: 1000 }] }, 5000, 'due'],
    [{ sales: [{ status: 'completed', duePiasters: 1000 }], receipts: [{ direction: 'in', amountPiasters: 1500 }], returns: [] }, -500, 'credit'],
    [{ sales: [{ status: 'voided', duePiasters: 0 }], receipts: [{ direction: 'in', amountPiasters: 3000 }], returns: [] }, -3000, 'credit'],
    [{ sales: [{ status: 'completed', duePiasters: 6000 }], receipts: [], returns: [{ status: 'voided', creditedToAccountPiasters: 1000 }] }, 6000, 'due'],
  ] as const)('calculates customer balance', (input, balance, status) => {
    expect(calculateCustomerBalance(input)).toEqual({ ok: true, value: { balancePiasters: balance, status } })
  })
})

describe('calculateSupplierBalance', () => {
  it.each([
    [{ purchases: [{ status: 'completed', duePiasters: 5000 }], payments: [{ direction: 'out', amountPiasters: 2000 }] }, 3000, 'payable'],
    [{ purchases: [{ status: 'completed', duePiasters: 5000 }], payments: [{ direction: 'out', amountPiasters: 2000 }, { direction: 'in', amountPiasters: 2000 }] }, 5000, 'payable'],
    [{ purchases: [{ status: 'voided', duePiasters: 5000 }], payments: [] }, 0, 'settled'],
    [{ purchases: [], payments: [{ direction: 'out', amountPiasters: 2000 }] }, -2000, 'credit'],
    [{ purchases: [], payments: [] }, 0, 'settled'],
  ] as const)('calculates supplier balance', (input, balance, status) => {
    expect(calculateSupplierBalance(input)).toEqual({ ok: true, value: { balancePiasters: balance, status } })
  })
})
