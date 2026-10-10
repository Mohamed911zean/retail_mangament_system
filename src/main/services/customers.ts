import type { DatabaseHandle } from '../database/repositories/common'
import { runInTransaction } from '../database/repositories/common'
import { getCustomer, listCustomers, insertCustomer, updateCustomer, softDeleteCustomer } from '../database/repositories/customers'
import { getCustomerBalance } from '../database/repositories/balances'
import type { CustomerRow } from '../database/rows'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import { noFaults } from './fault-injector'
import type { IdGenerator } from './ids'
import { createUlidGenerator } from './ids'
import type { Actor } from './permissions'
import { serviceErr, serviceOk, type ServiceResult } from './result'
import { writeAudit } from './audit'

export type CustomerInput = {
  name: string
  phone?: string | null
  address?: string | null
  /** `null` means unlimited credit, `0` means no credit at all. */
  creditLimitPiasters?: number | null
}

export type CustomerSummary = CustomerRow & { balancePiasters: number }

type CustomerDeps = { database: DatabaseHandle; clock: Clock; ids?: IdGenerator; deviceId: string; faults?: FaultInjector }

const MAX_MONEY = Number.MAX_SAFE_INTEGER

function validCreditLimit(value: number | null | undefined): value is number | null | undefined {
  return value === null || value === undefined || (Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY)
}

export class CustomerService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector
  constructor(private readonly deps: CustomerDeps) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
  }

  async list(): Promise<ServiceResult<CustomerSummary[]>> {
    try {
      const rows = listCustomers(this.deps.database)
      const summaries: CustomerSummary[] = []
      for (const row of rows) {
        const balance = getCustomerBalance(this.deps.database, row.id)
        if (!balance.ok) return serviceErr(balance.error.code, balance.error)
        summaries.push({ ...row, balancePiasters: balance.value.balancePiasters })
      }
      return serviceOk(summaries)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async get(id: string): Promise<ServiceResult<CustomerSummary>> {
    try {
      const row = getCustomer(this.deps.database, id)
      if (row === undefined) return serviceErr('not_found', { customerId: id })
      const balance = getCustomerBalance(this.deps.database, id)
      if (!balance.ok) return serviceErr(balance.error.code, balance.error)
      return serviceOk({ ...row, balancePiasters: balance.value.balancePiasters })
    } catch (e) { return serviceErr('database_error', e) }
  }

  async create(actor: Actor, input: CustomerInput): Promise<ServiceResult<CustomerSummary>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    if (input.name.trim().length === 0) return serviceErr('invalid_input', { field: 'name' })
    if (!validCreditLimit(input.creditLimitPiasters)) return serviceErr('invalid_money', { field: 'creditLimitPiasters' })
    try {
      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertCustomer(tx, {
          id,
          name: input.name.trim(),
          phone: input.phone ?? null,
          address: input.address ?? null,
          creditLimitPiasters: input.creditLimitPiasters ?? null,
          metadata: null,
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'customer_created', entityType: 'customer', entityId: id,
          after: { name: input.name.trim(), creditLimitPiasters: input.creditLimitPiasters ?? null }, now, deviceId: this.deps.deviceId,
        })
        this.faults.after('customer.created_audited')
      })
      return this.get(id)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async update(actor: Actor, id: string, input: Partial<CustomerInput>): Promise<ServiceResult<CustomerSummary>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    if (input.creditLimitPiasters !== undefined && !validCreditLimit(input.creditLimitPiasters)) {
      return serviceErr('invalid_money', { field: 'creditLimitPiasters' })
    }
    try {
      const current = getCustomer(this.deps.database, id)
      if (current === undefined) return serviceErr('not_found', { customerId: id })
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        updateCustomer(tx, id, {
          name: input.name !== undefined ? input.name.trim() : undefined,
          phone: input.phone,
          address: input.address,
          creditLimitPiasters: input.creditLimitPiasters,
          updatedAt: now,
        })
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'customer_updated', entityType: 'customer', entityId: id,
          before: { name: current.name, phone: current.phone, creditLimitPiasters: current.creditLimitPiasters },
          after: { name: input.name ?? current.name, phone: input.phone ?? current.phone, creditLimitPiasters: input.creditLimitPiasters ?? current.creditLimitPiasters },
          now, deviceId: this.deps.deviceId,
        })
        this.faults.after('customer.updated_audited')
      })
      return this.get(id)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async remove(actor: Actor, id: string): Promise<ServiceResult<true>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      const current = getCustomer(this.deps.database, id)
      if (current === undefined) return serviceErr('not_found', { customerId: id })
      const balance = getCustomerBalance(this.deps.database, id)
      if (!balance.ok) return serviceErr(balance.error.code, balance.error)
      if (balance.value.balancePiasters !== 0) return serviceErr('customer_has_balance', { balancePiasters: balance.value.balancePiasters })
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        softDeleteCustomer(tx, id, now)
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'customer_deleted', entityType: 'customer', entityId: id,
          before: { name: current.name }, now, deviceId: this.deps.deviceId,
        })
        this.faults.after('customer.deleted_audited')
      })
      return serviceOk(true)
    } catch (e) { return serviceErr('database_error', e) }
  }
}
