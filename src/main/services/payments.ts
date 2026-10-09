import type { DatabaseHandle } from '../database/repositories/common'
import { runInTransaction } from '../database/repositories/common'
import { getCustomer } from '../database/repositories/customers'
import { getSupplier } from '../database/repositories/suppliers'
import { findReversalOfEntry, getMoneyLedgerEntry, insertMoneyLedgerEntry } from '../database/repositories/money-ledger'
import { getCustomerBalance as loadCustomerBalance, getSupplierBalance as loadSupplierBalance } from '../database/repositories/balances'
import { getOpenShift } from '../database/repositories/shifts'
import type { CustomerBalance, SupplierBalance } from '../../domain/balances'
import { assertPermission, type Actor } from './permissions'
import { serviceErr, serviceOk, type ServiceResult } from './result'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import { noFaults } from './fault-injector'
import type { IdGenerator } from './ids'
import { createUlidGenerator } from './ids'
import { writeAudit } from './audit'

export type PaymentMethod = 'cash' | 'card' | 'wallet'

export type RecordCustomerReceiptInput = {
  customerId: string
  amountPiasters: number
  method: PaymentMethod
  referenceText?: string | null
}

export type RecordSupplierPaymentInput = {
  supplierId: string
  amountPiasters: number
  method: PaymentMethod
  referenceText?: string | null
}

export type ReversePaymentInput = {
  entryId: string
  reason?: string | null
}

type PaymentDeps = {
  database: DatabaseHandle
  clock: Clock
  ids?: IdGenerator
  deviceId: string
  shiftsEnabled?: boolean
  faults?: FaultInjector
}

function validAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

// Customer receipts and supplier payments are account-level `money_ledger` rows:
//   customer receipt  -> entry_type 'customer_receipt', direction 'in'
//   supplier payment  -> entry_type 'supplier_payment', direction 'out'
// A reversal is a compensating row with the *same* entry type and the opposite
// direction, linked to its original through `reverses_entry_id`. The frozen schema's
// balance derivation ("the net receipt total is recomputed from the ledger") sums
// those entry types, so the reversal is included automatically and no balance column
// is ever written. A partial unique index on `reverses_entry_id` keeps reversals once-only.
export class PaymentService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector
  constructor(private readonly deps: PaymentDeps) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
  }

  private resolveCashShift(method: PaymentMethod): ServiceResult<string | null> {
    if (!(this.deps.shiftsEnabled ?? false) || method !== 'cash') return serviceOk(null)
    const openShift = getOpenShift(this.deps.database, this.deps.deviceId)
    if (openShift === undefined) {
      return serviceErr('invalid_shift_state', { message: 'an open shift is required for cash movements' })
    }
    return serviceOk(openShift.id)
  }

  async recordCustomerReceipt(actor: Actor, input: RecordCustomerReceiptInput): Promise<ServiceResult<{ id: string }>> {
    try {
      if (!validAmount(input.amountPiasters)) return serviceErr('invalid_money', { field: 'amountPiasters' })
      if (getCustomer(this.deps.database, input.customerId) === undefined) return serviceErr('not_found', { field: 'customerId' })
      const shift = this.resolveCashShift(input.method)
      if (!shift.ok) return shift

      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertMoneyLedgerEntry(tx, {
          id,
          entryType: 'customer_receipt',
          direction: 'in',
          amountPiasters: input.amountPiasters,
          paymentMethod: input.method,
          customerId: input.customerId,
          referenceType: 'customer',
          referenceId: input.customerId,
          shiftId: shift.value,
          referenceText: input.referenceText ?? null,
          occurredAt: now,
          userId: actor.userId,
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        this.faults.after('payment.customer_receipt_inserted')
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'customer_receipt_recorded', entityType: 'money_ledger', entityId: id,
          after: { customerId: input.customerId, amountPiasters: input.amountPiasters, method: input.method },
          now, deviceId: this.deps.deviceId,
        })
        this.faults.after('payment.customer_receipt_audited')
      })
      this.faults.after('payment.customer_receipt_committed')
      return serviceOk({ id })
    } catch (e: unknown) {
      return serviceErr('database_error', e)
    }
  }

  async reverseCustomerReceipt(actor: Actor, input: ReversePaymentInput): Promise<ServiceResult<{ id: string }>> {
    const permission = assertPermission(actor, 'document.void')
    if (!permission.ok) return permission
    try {
      const original = getMoneyLedgerEntry(this.deps.database, input.entryId)
      if (original === undefined) return serviceErr('not_found', { field: 'entryId' })
      if (original.entryType !== 'customer_receipt' || original.customerId === null) {
        return serviceErr('invalid_reversal_target', { entryId: input.entryId })
      }
      if (findReversalOfEntry(this.deps.database, input.entryId) !== undefined) {
        return serviceErr('reversal_already_exists', { entryId: input.entryId })
      }
      const shift = this.resolveCashShift((original.paymentMethod ?? 'cash') as PaymentMethod)
      if (!shift.ok) return shift

      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertMoneyLedgerEntry(tx, {
          id,
          entryType: 'customer_receipt',
          direction: original.direction === 'in' ? 'out' : 'in',
          amountPiasters: original.amountPiasters,
          paymentMethod: original.paymentMethod,
          customerId: original.customerId,
          referenceType: 'customer',
          referenceId: original.customerId,
          reversesEntryId: original.id,
          shiftId: shift.value,
          referenceText: input.reason ?? null,
          occurredAt: now,
          userId: actor.userId,
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        this.faults.after('payment.customer_receipt_reversal_inserted')
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'customer_receipt_reversed', entityType: 'money_ledger', entityId: id,
          after: { reversesEntryId: original.id, amountPiasters: original.amountPiasters, reason: input.reason ?? null },
          now, deviceId: this.deps.deviceId,
        })
        this.faults.after('payment.customer_receipt_reversal_audited')
      })
      this.faults.after('payment.customer_receipt_reversal_committed')
      return serviceOk({ id })
    } catch (e: unknown) {
      return serviceErr('database_error', e)
    }
  }

  async recordSupplierPayment(actor: Actor, input: RecordSupplierPaymentInput): Promise<ServiceResult<{ id: string }>> {
    try {
      if (!validAmount(input.amountPiasters)) return serviceErr('invalid_money', { field: 'amountPiasters' })
      if (getSupplier(this.deps.database, input.supplierId) === undefined) return serviceErr('not_found', { field: 'supplierId' })
      const shift = this.resolveCashShift(input.method)
      if (!shift.ok) return shift

      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertMoneyLedgerEntry(tx, {
          id,
          entryType: 'supplier_payment',
          direction: 'out',
          amountPiasters: input.amountPiasters,
          paymentMethod: input.method,
          supplierId: input.supplierId,
          referenceType: 'supplier',
          referenceId: input.supplierId,
          shiftId: shift.value,
          referenceText: input.referenceText ?? null,
          occurredAt: now,
          userId: actor.userId,
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        this.faults.after('payment.supplier_payment_inserted')
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'supplier_payment_recorded', entityType: 'money_ledger', entityId: id,
          after: { supplierId: input.supplierId, amountPiasters: input.amountPiasters, method: input.method },
          now, deviceId: this.deps.deviceId,
        })
        this.faults.after('payment.supplier_payment_audited')
      })
      this.faults.after('payment.supplier_payment_committed')
      return serviceOk({ id })
    } catch (e: unknown) {
      return serviceErr('database_error', e)
    }
  }

  async reverseSupplierPayment(actor: Actor, input: ReversePaymentInput): Promise<ServiceResult<{ id: string }>> {
    const permission = assertPermission(actor, 'document.void')
    if (!permission.ok) return permission
    try {
      const original = getMoneyLedgerEntry(this.deps.database, input.entryId)
      if (original === undefined) return serviceErr('not_found', { field: 'entryId' })
      if (original.entryType !== 'supplier_payment' || original.supplierId === null) {
        return serviceErr('invalid_reversal_target', { entryId: input.entryId })
      }
      if (findReversalOfEntry(this.deps.database, input.entryId) !== undefined) {
        return serviceErr('reversal_already_exists', { entryId: input.entryId })
      }
      const shift = this.resolveCashShift((original.paymentMethod ?? 'cash') as PaymentMethod)
      if (!shift.ok) return shift

      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertMoneyLedgerEntry(tx, {
          id,
          entryType: 'supplier_payment',
          direction: original.direction === 'out' ? 'in' : 'out',
          amountPiasters: original.amountPiasters,
          paymentMethod: original.paymentMethod,
          supplierId: original.supplierId,
          referenceType: 'supplier',
          referenceId: original.supplierId,
          reversesEntryId: original.id,
          shiftId: shift.value,
          referenceText: input.reason ?? null,
          occurredAt: now,
          userId: actor.userId,
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        this.faults.after('payment.supplier_payment_reversal_inserted')
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'supplier_payment_reversed', entityType: 'money_ledger', entityId: id,
          after: { reversesEntryId: original.id, amountPiasters: original.amountPiasters, reason: input.reason ?? null },
          now, deviceId: this.deps.deviceId,
        })
        this.faults.after('payment.supplier_payment_reversal_audited')
      })
      this.faults.after('payment.supplier_payment_reversal_committed')
      return serviceOk({ id })
    } catch (e: unknown) {
      return serviceErr('database_error', e)
    }
  }

  async getCustomerBalance(customerId: string): Promise<ServiceResult<CustomerBalance>> {
    try {
      if (getCustomer(this.deps.database, customerId) === undefined) return serviceErr('not_found', { field: 'customerId' })
      const result = loadCustomerBalance(this.deps.database, customerId)
      if (!result.ok) return serviceErr(result.error.code, result.error)
      return serviceOk(result.value)
    } catch (e: unknown) {
      return serviceErr('database_error', e)
    }
  }

  async getSupplierBalance(supplierId: string): Promise<ServiceResult<SupplierBalance>> {
    try {
      if (getSupplier(this.deps.database, supplierId) === undefined) return serviceErr('not_found', { field: 'supplierId' })
      const result = loadSupplierBalance(this.deps.database, supplierId)
      if (!result.ok) return serviceErr(result.error.code, result.error)
      return serviceOk(result.value)
    } catch (e: unknown) {
      return serviceErr('database_error', e)
    }
  }
}
