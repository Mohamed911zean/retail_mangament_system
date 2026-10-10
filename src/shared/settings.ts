/**
 * Canonical application settings shape, shared by the main process (persistence)
 * and the renderer (typed IPC). The main-process `SettingsService` is the only
 * writer; the renderer treats this as read-mostly state.
 */
export type Settings = {
  /** Printed at the top of every receipt; empty until the shop types it. */
  shop_name: string
  shifts: boolean
  expiry_batches: boolean
  weighted_items: boolean
  customer_credit: boolean
  tax: boolean
  allow_negative_stock: boolean
  payment_methods: readonly PaymentMethod[]
  cash_rounding_step_piasters: number
  device_id: string
}

export type PaymentMethod = 'cash' | 'card' | 'wallet'

export const paymentMethods: readonly PaymentMethod[] = ['cash', 'card', 'wallet']

/** Keys the UI is allowed to change through IPC (never `device_id`). */
export type SettingsKey = keyof Omit<Settings, 'device_id'>

/** Defaults for a fresh device; `device_id` is generated on first read. */
export const defaultSettings: Omit<Settings, 'device_id'> = {
  shop_name: '',
  shifts: true,
  expiry_batches: false,
  weighted_items: true,
  customer_credit: true,
  tax: false,
  allow_negative_stock: true,
  payment_methods: paymentMethods,
  cash_rounding_step_piasters: 0,
}
