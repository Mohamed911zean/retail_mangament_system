import { safeInteger } from './integer'
import { err, ok, type DomainError, type Result } from './result'

type CustomerSale = { status: 'completed' | 'voided'; duePiasters: number }
type CustomerReceipt = { direction: 'in' | 'out'; amountPiasters: number }
type CustomerReturn = { status: 'completed' | 'voided'; creditedToAccountPiasters: number }
type SupplierPurchase = { status: 'completed' | 'voided'; duePiasters: number }
type SupplierPayment = { direction: 'out' | 'in'; amountPiasters: number }

function validateAmount(value: number, field: string): Result<number, DomainError> {
  const result = safeInteger(value, field)
  if (!result.ok || result.value < 0) {
    return err({ code: 'invalid_money', message: `${field} must be non-negative`, field })
  }
  return ok(result.value)
}

function checked(value: bigint): Result<number, DomainError> {
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  if (value < -max || value > max) return err({ code: 'overflow', message: 'balance exceeds safe integer range' })
  return ok(Number(value))
}

export type CustomerBalanceInput = {
  sales: readonly CustomerSale[]
  receipts: readonly CustomerReceipt[]
  returns: readonly CustomerReturn[]
}

export type CustomerBalance = { balancePiasters: number; status: 'due' | 'credit' | 'settled' }

export function calculateCustomerBalance(
  input: CustomerBalanceInput,
): Result<CustomerBalance, DomainError> {
  let balance = 0n
  for (const sale of input.sales) {
    const amount = validateAmount(sale.duePiasters, 'duePiasters')
    if (!amount.ok) return amount
    if (sale.status === 'completed' && amount.value > 0) balance += BigInt(amount.value)
  }
  for (const receipt of input.receipts) {
    const amount = validateAmount(receipt.amountPiasters, 'amountPiasters')
    if (!amount.ok) return amount
    balance += receipt.direction === 'in' ? -BigInt(amount.value) : BigInt(amount.value)
  }
  for (const returned of input.returns) {
    const amount = validateAmount(returned.creditedToAccountPiasters, 'creditedToAccountPiasters')
    if (!amount.ok) return amount
    if (returned.status === 'completed') balance -= BigInt(amount.value)
  }
  const result = checked(balance)
  if (!result.ok) return result
  return ok({
    balancePiasters: result.value,
    status: result.value > 0 ? 'due' : result.value < 0 ? 'credit' : 'settled',
  })
}

export type SupplierBalanceInput = {
  purchases: readonly SupplierPurchase[]
  payments: readonly SupplierPayment[]
}

export type SupplierBalance = { balancePiasters: number; status: 'payable' | 'credit' | 'settled' }

export function calculateSupplierBalance(
  input: SupplierBalanceInput,
): Result<SupplierBalance, DomainError> {
  let balance = 0n
  for (const purchase of input.purchases) {
    const amount = validateAmount(purchase.duePiasters, 'duePiasters')
    if (!amount.ok) return amount
    if (purchase.status === 'completed') balance += BigInt(amount.value)
  }
  for (const payment of input.payments) {
    const amount = validateAmount(payment.amountPiasters, 'amountPiasters')
    if (!amount.ok) return amount
    balance += payment.direction === 'out' ? -BigInt(amount.value) : BigInt(amount.value)
  }
  const result = checked(balance)
  if (!result.ok) return result
  return ok({
    balancePiasters: result.value,
    status: result.value > 0 ? 'payable' : result.value < 0 ? 'credit' : 'settled',
  })
}
