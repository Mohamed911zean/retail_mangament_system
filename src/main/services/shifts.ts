import type { DatabaseHandle } from '../database/repositories/common'
import { runInTransaction } from '../database/repositories/common'
import { getShift, getOpenShift, insertShift, closeShift as closeShiftRow } from '../database/repositories/shifts'
import { insertExpense } from '../database/repositories/expenses'
import { insertMoneyLedgerEntry, listMoneyLedger } from '../database/repositories/money-ledger'
import type { ShiftRow } from '../database/rows'
import { calculateExpectedShiftCash, reconcileShiftCash } from '../../domain/shifts'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import { noFaults } from './fault-injector'
import type { IdGenerator } from './ids'
import { createUlidGenerator } from './ids'
import type { Actor } from './permissions'
import { serviceErr, serviceOk, type ServiceResult } from './result'
import { writeAudit } from './audit'

export type OpenShiftInput = {
  openingCashPiasters: number
}

export type CloseShiftInput = {
  shiftId: string
  countedCashPiasters: number
  closingNotes?: string | null
}

export type RecordExpenseInput = {
  shiftId: string
  category: string
  description: string
  amountPiasters: number
  paymentMethod: 'cash' | 'card' | 'wallet'
}

export type CashMoveInput = {
  shiftId: string
  amountPiasters: number
  referenceText?: string | null
}

export type CloseShiftResult = {
  shift: ShiftRow
  expectedCashPiasters: number
  differencePiasters: number
  reconciliation: 'balanced' | 'over' | 'short'
}

type ShiftDeps = {
  database: DatabaseHandle
  clock: Clock
  ids?: IdGenerator
  deviceId: string
  faults?: FaultInjector
}

function validAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

export class ShiftService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector
  constructor(private readonly deps: ShiftDeps) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
  }

  async openShift(actor: Actor, input: OpenShiftInput): Promise<ServiceResult<{ id: string }>> {
    try {
      if (!Number.isSafeInteger(input.openingCashPiasters) || input.openingCashPiasters < 0) {
        return serviceErr('invalid_money', { field: 'openingCashPiasters' })
      }
      if (getOpenShift(this.deps.database, this.deps.deviceId) !== undefined) {
        return serviceErr('invalid_shift_state', { message: 'a shift is already open on this device' })
      }
      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertShift(tx, {
          id,
          userId: actor.userId,
          openedAt: now,
          openingCashPiasters: input.openingCashPiasters,
          status: 'open',
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        this.faults.after('shift.row_inserted')
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'shift_opened', entityType: 'shift', entityId: id,
          after: { openingCashPiasters: input.openingCashPiasters },
          now, deviceId: this.deps.deviceId,
        })
      })
      this.faults.after('shift.opened')
      return serviceOk({ id })
    } catch (e: unknown) {
      return serviceErr('database_error', e)
    }
  }

  async closeShift(actor: Actor, input: CloseShiftInput): Promise<ServiceResult<CloseShiftResult>> {
    try {
      const shift = getShift(this.deps.database, input.shiftId)
      if (shift === undefined) return serviceErr('not_found', { field: 'shiftId' })
      if (shift.status !== 'open') return serviceErr('invalid_shift_state', { message: 'shift is not open' })
      if (!Number.isSafeInteger(input.countedCashPiasters) || input.countedCashPiasters < 0) {
        return serviceErr('invalid_money', { field: 'countedCashPiasters' })
      }

      const ledgerRows = listMoneyLedger(this.deps.database, input.shiftId)
      const expectedResult = calculateExpectedShiftCash(
        shift.openingCashPiasters,
        input.shiftId,
        ledgerRows.map((row) => ({
          shiftId: row.shiftId,
          method: row.paymentMethod ?? 'cash',
          direction: row.direction,
          amountPiasters: row.amountPiasters,
        })),
      )
      if (!expectedResult.ok) return serviceErr(expectedResult.error.code, expectedResult.error)

      const reconcileResult = reconcileShiftCash(expectedResult.value.expectedCashPiasters, input.countedCashPiasters)
      if (!reconcileResult.ok) return serviceErr(reconcileResult.error.code, reconcileResult.error)

      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        closeShiftRow(tx, input.shiftId, {
          closedAt: now,
          expectedCashPiasters: expectedResult.value.expectedCashPiasters,
          countedCashPiasters: input.countedCashPiasters,
          differencePiasters: reconcileResult.value.differencePiasters,
          closingNotes: input.closingNotes ?? null,
          updatedAt: now,
        })
        this.faults.after('shift.row_closed')
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'shift_closed', entityType: 'shift', entityId: input.shiftId,
          after: {
            expectedCashPiasters: expectedResult.value.expectedCashPiasters,
            countedCashPiasters: input.countedCashPiasters,
            differencePiasters: reconcileResult.value.differencePiasters,
            reconciliation: reconcileResult.value.status,
          },
          now, deviceId: this.deps.deviceId,
        })
      })
      this.faults.after('shift.closed')

      const closed = getShift(this.deps.database, input.shiftId)
      if (closed === undefined) return serviceErr('database_error')
      return serviceOk({
        shift: closed,
        expectedCashPiasters: expectedResult.value.expectedCashPiasters,
        differencePiasters: reconcileResult.value.differencePiasters,
        reconciliation: reconcileResult.value.status,
      })
    } catch (e: unknown) {
      return serviceErr('database_error', e)
    }
  }

  async recordExpense(actor: Actor, input: RecordExpenseInput): Promise<ServiceResult<{ id: string }>> {
    try {
      const shift = getShift(this.deps.database, input.shiftId)
      if (shift === undefined) return serviceErr('not_found', { field: 'shiftId' })
      if (shift.status !== 'open') return serviceErr('invalid_shift_state', { message: 'shift is not open' })
      if (!validAmount(input.amountPiasters)) return serviceErr('invalid_money', { field: 'amountPiasters' })

      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertExpense(tx, {
          id,
          category: input.category,
          description: input.description,
          amountPiasters: input.amountPiasters,
          paymentMethod: input.paymentMethod,
          expenseAt: now,
          userId: actor.userId,
          shiftId: input.shiftId,
          status: 'posted',
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        this.faults.after('shift.expense_inserted')
        insertMoneyLedgerEntry(tx, {
          id: this.ids.next(),
          entryType: 'expense',
          direction: 'out',
          amountPiasters: input.amountPiasters,
          paymentMethod: input.paymentMethod,
          referenceType: 'expense',
          referenceId: id,
          shiftId: input.shiftId,
          occurredAt: now,
          userId: actor.userId,
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        this.faults.after('shift.expense_ledger_inserted')
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: 'expense_recorded', entityType: 'expense', entityId: id,
          after: { category: input.category, amountPiasters: input.amountPiasters, paymentMethod: input.paymentMethod },
          now, deviceId: this.deps.deviceId,
        })
      })
      this.faults.after('shift.expense_recorded')
      return serviceOk({ id })
    } catch (e: unknown) {
      return serviceErr('database_error', e)
    }
  }

  async recordCashIn(actor: Actor, input: CashMoveInput): Promise<ServiceResult<{ id: string }>> {
    return this.recordCashMove(actor, input, 'cash_in', 'in')
  }

  async recordCashOut(actor: Actor, input: CashMoveInput): Promise<ServiceResult<{ id: string }>> {
    return this.recordCashMove(actor, input, 'cash_out', 'out')
  }

  private async recordCashMove(actor: Actor, input: CashMoveInput, entryType: 'cash_in' | 'cash_out', direction: 'in' | 'out'): Promise<ServiceResult<{ id: string }>> {
    try {
      const shift = getShift(this.deps.database, input.shiftId)
      if (shift === undefined) return serviceErr('not_found', { field: 'shiftId' })
      if (shift.status !== 'open') return serviceErr('invalid_shift_state', { message: 'shift is not open' })
      if (!validAmount(input.amountPiasters)) return serviceErr('invalid_money', { field: 'amountPiasters' })

      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertMoneyLedgerEntry(tx, {
          id,
          entryType,
          direction,
          amountPiasters: input.amountPiasters,
          paymentMethod: 'cash',
          referenceType: entryType,
          referenceId: id,
          shiftId: input.shiftId,
          referenceText: input.referenceText ?? null,
          occurredAt: now,
          userId: actor.userId,
          createdAt: now,
          updatedAt: now,
          deviceId: this.deps.deviceId,
        })
        this.faults.after(`shift.${entryType}_inserted`)
        writeAudit(tx, this.ids, {
          userId: actor.userId, action: entryType === 'cash_in' ? 'cash_in_recorded' : 'cash_out_recorded',
          entityType: 'money_ledger', entityId: id,
          after: { amountPiasters: input.amountPiasters, referenceText: input.referenceText ?? null },
          now, deviceId: this.deps.deviceId,
        })
      })
      this.faults.after(`shift.${entryType}_recorded`)
      return serviceOk({ id })
    } catch (e: unknown) {
      return serviceErr('database_error', e)
    }
  }

  async getOpenShift(): Promise<ServiceResult<ShiftRow | null>> {
    try {
      return serviceOk(getOpenShift(this.deps.database, this.deps.deviceId) ?? null)
    } catch (e: unknown) {
      return serviceErr('database_error', e)
    }
  }
}
