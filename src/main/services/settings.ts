import type { DatabaseHandle } from '../database/repositories/common'
import { getSetting, upsertSetting } from '../database/repositories/settings'
import { runInTransaction } from '../database/repositories/common'
import type { Clock } from './clock'
import { createUlidGenerator, type IdGenerator } from './ids'
import type { Actor } from './permissions'
import type { ServiceResult } from './result'
import { serviceErr, serviceOk } from './result'
import { writeAudit } from './audit'
import { noFaults, type FaultInjector } from './fault-injector'

export type Settings = {
  shifts: boolean
  expiry_batches: boolean
  weighted_items: boolean
  customer_credit: boolean
  tax: boolean
  allow_negative_stock: boolean
  payment_methods: readonly ('cash' | 'card' | 'wallet')[]
  cash_rounding_step_piasters: number
  device_id: string
}

const defaults: Omit<Settings, 'device_id'> = {
  shifts: true,
  expiry_batches: false,
  weighted_items: true,
  customer_credit: true,
  tax: false,
  allow_negative_stock: true,
  payment_methods: ['cash', 'card', 'wallet'],
  cash_rounding_step_piasters: 0,
}

type SettingsDependencies = { database: DatabaseHandle; clock: Clock; ids?: IdGenerator; deviceId?: string; faults?: FaultInjector }

export class SettingsService {
  private readonly ids: IdGenerator
  constructor(private readonly dependencies: SettingsDependencies) {
    this.ids = dependencies.ids ?? createUlidGenerator()
  }

  async get(): Promise<ServiceResult<Settings>> {
    try {
      const values = { ...defaults }
      for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
        const row = getSetting(this.dependencies.database, key)
        if (row !== undefined) values[key] = JSON.parse(row.value) as never
      }
      const deviceId = this.dependencies.deviceId ?? getSetting(this.dependencies.database, 'device_id')?.value ?? this.ids.next()
      if (getSetting(this.dependencies.database, 'device_id') === undefined) {
        upsertSetting(this.dependencies.database, {
          key: 'device_id',
          value: deviceId,
          valueType: 'string',
          description: 'Device identifier',
          createdAt: this.dependencies.clock.now(),
          updatedAt: this.dependencies.clock.now(),
          deviceId,
        })
      }
      return serviceOk({ ...values, device_id: deviceId })
    } catch (error) {
      return serviceErr('settings_error', error)
    }
  }

  async set(actor: Actor, key: keyof Omit<Settings, 'device_id'>, value: Settings[typeof key]): Promise<ServiceResult<Settings>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      const now = this.dependencies.clock.now()
      const current = await this.get()
      if (!current.ok) return current
      const deviceId = this.dependencies.deviceId ?? current.value.device_id
      runInTransaction(this.dependencies.database, (transaction) => {
        upsertSetting(transaction, { key, value: JSON.stringify(value), valueType: 'json', description: null, createdAt: now, updatedAt: now, deviceId })
        writeAudit(transaction, this.ids, {
          userId: actor.userId, action: 'settings_changed', entityType: 'setting', entityId: key,
          before: undefined, after: { key, value }, now, deviceId,
        })
        ;(this.dependencies.faults ?? noFaults).after(`settings.${key}.audited`)
      })
      return this.get()
    } catch (error) {
      return serviceErr('settings_error', error)
    }
  }

  async applyFrozenFoodPreset(actor: Actor): Promise<ServiceResult<Settings>> {
    return this.set(actor, 'expiry_batches', true)
  }
}
