import type { DatabaseHandle } from '../database/repositories/common'
import { CatalogService } from '../services/catalog'
import { CustomerService } from '../services/customers'
import { InventoryService } from '../services/inventory'
import { PaymentService } from '../services/payments'
import { SaleService } from '../services/sales'
import { SettingsService, resolveSettingsSync } from '../services/settings'
import { ShiftService } from '../services/shifts'
import { UserService } from '../services/users'
import { createUlidGenerator, type IdGenerator } from '../services/ids'
import { systemClock, type Clock } from '../services/clock'
import { noFaults, type FaultInjector } from '../services/fault-injector'

export type Services = {
  database: DatabaseHandle
  deviceId: string
  settings: SettingsService
  users: UserService
  catalog: CatalogService
  customers: CustomerService
  sales: SaleService
  shifts: ShiftService
  payments: PaymentService
  inventory: InventoryService
}

export type ServiceFactoryDeps = {
  clock?: Clock
  ids?: IdGenerator
  faults?: FaultInjector
  /** Overrides the stored device id (tests only). */
  deviceId?: string
}

/**
 * Builds the service graph for one operation.
 *
 * Services are intentionally stateless and cheap, so they are built per call
 * instead of being cached: the feature flags that shape them
 * (`allow_negative_stock`, `shifts`) are then always current, and a database
 * restore can swap the connection without any stale handle surviving inside a
 * long-lived service. This also matches the "no global in-memory state" rule
 * that keeps a future LAN mode possible.
 */
export function createServices(database: DatabaseHandle, deps: ServiceFactoryDeps = {}): Services {
  const clock = deps.clock ?? systemClock
  const ids = deps.ids ?? createUlidGenerator()
  const faults = deps.faults ?? noFaults
  const settings = resolveSettingsSync(database, ids, clock.now(), deps.deviceId)
  const common = { database, clock, ids, deviceId: settings.device_id, faults }

  return {
    database,
    deviceId: settings.device_id,
    settings: new SettingsService(common),
    users: new UserService(common),
    catalog: new CatalogService(common),
    customers: new CustomerService(common),
    sales: new SaleService({ ...common, allowNegativeStock: settings.allow_negative_stock }),
    shifts: new ShiftService(common),
    payments: new PaymentService({ ...common, shiftsEnabled: settings.shifts }),
    inventory: new InventoryService({ ...common, allowNegativeStock: settings.allow_negative_stock }),
  }
}
