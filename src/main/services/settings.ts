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

import type { Settings } from '../../shared/settings'
import { defaultSettings } from '../../shared/settings'

export type { Settings }

const defaults = defaultSettings

type SettingsDependencies = { database: DatabaseHandle; clock: Clock; ids?: IdGenerator; deviceId?: string; faults?: FaultInjector }

/** Reads the stored `device_id`, creating and persisting one on first use. */
export function resolveDeviceId(database: DatabaseHandle, ids: IdGenerator, now: number): string {
  const existing = getSetting(database, 'device_id')
  if (existing !== undefined) return existing.value
  const deviceId = ids.next()
  upsertSetting(database, {
    key: 'device_id',
    value: deviceId,
    valueType: 'string',
    description: 'Device identifier',
    createdAt: now,
    updatedAt: now,
    deviceId,
  })
  return deviceId
}

/**
 * Synchronous settings snapshot used to configure services at construction
 * time (negative-stock policy, shift feature flag). It reads the same rows and
 * the same defaults as `SettingsService.get()`, so the two cannot disagree.
 */
export function resolveSettingsSync(database: DatabaseHandle, ids: IdGenerator, now: number, deviceId?: string): Settings {
  const values = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    const row = getSetting(database, key)
    if (row !== undefined) values[key] = JSON.parse(row.value) as never
  }
  return { ...values, device_id: deviceId ?? resolveDeviceId(database, ids, now) }
}

export class SettingsService {
  private readonly ids: IdGenerator
  constructor(private readonly dependencies: SettingsDependencies) {
    this.ids = dependencies.ids ?? createUlidGenerator()
  }

  async get(): Promise<ServiceResult<Settings>> {
    try {
      const settings = resolveSettingsSync(
        this.dependencies.database,
        this.ids,
        this.dependencies.clock.now(),
        this.dependencies.deviceId,
      )
      return serviceOk(settings)
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

  async applyGroceryPreset(actor: Actor): Promise<ServiceResult<Settings>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    const r1 = await this.set(actor, 'expiry_batches', false)
    if (!r1.ok) return r1
    const r2 = await this.set(actor, 'weighted_items', true)
    if (!r2.ok) return r2
    const r3 = await this.set(actor, 'customer_credit', true)
    if (!r3.ok) return r3
    return this.set(actor, 'allow_negative_stock', false)
  }

  async applySweetsPreset(actor: Actor): Promise<ServiceResult<Settings>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    const r1 = await this.set(actor, 'weighted_items', true)
    if (!r1.ok) return r1
    const r2 = await this.set(actor, 'expiry_batches', false)
    if (!r2.ok) return r2
    return this.set(actor, 'cash_rounding_step_piasters', 25)
  }
}
