import { execute } from './common'
import type { DatabaseHandle } from './common'
import {
  calculateCustomerBalance,
  calculateSupplierBalance,
  type CustomerBalance,
  type SupplierBalance,
} from '../../../domain/balances'
import type { DomainError, Result } from '../../../domain/result'

// Customer and supplier balances are always derived from the frozen ledger inputs;
// the schema stores no balance columns. These helpers are the single SQL source for
// every service that needs a balance, so a credit-limit check and an operator-facing
// balance can never disagree.

type CustomerSaleRow = { status: 'completed' | 'voided'; duePiasters: number }
type CustomerReceiptRow = { direction: 'in' | 'out'; amountPiasters: number }
type CustomerReturnRow = { status: 'completed' | 'voided'; creditedToAccountPiasters: number }
type SupplierPurchaseRow = { status: 'completed' | 'voided'; duePiasters: number }
type SupplierPaymentRow = { direction: 'out' | 'in'; amountPiasters: number }

export function getCustomerBalance(database: DatabaseHandle, customerId: string): Result<CustomerBalance, DomainError> {
  const sales = execute(() => database.prepare(
    'SELECT status, due_piasters AS duePiasters FROM sales WHERE customer_id = ?',
  ).all(customerId)) as CustomerSaleRow[]
  const receipts = execute(() => database.prepare(
    "SELECT direction, amount_piasters AS amountPiasters FROM money_ledger WHERE customer_id = ? AND entry_type = 'customer_receipt'",
  ).all(customerId)) as CustomerReceiptRow[]
  const returns = execute(() => database.prepare(
    'SELECT status, credited_to_account_piasters AS creditedToAccountPiasters FROM sale_returns WHERE customer_id = ?',
  ).all(customerId)) as CustomerReturnRow[]
  return calculateCustomerBalance({ sales, receipts, returns })
}

export function getSupplierBalance(database: DatabaseHandle, supplierId: string): Result<SupplierBalance, DomainError> {
  const purchases = execute(() => database.prepare(
    'SELECT status, due_piasters AS duePiasters FROM purchases WHERE supplier_id = ?',
  ).all(supplierId)) as SupplierPurchaseRow[]
  const payments = execute(() => database.prepare(
    "SELECT direction, amount_piasters AS amountPiasters FROM money_ledger WHERE supplier_id = ? AND entry_type = 'supplier_payment'",
  ).all(supplierId)) as SupplierPaymentRow[]
  return calculateSupplierBalance({ purchases, payments })
}
