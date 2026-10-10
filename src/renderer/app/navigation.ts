import type { ComponentType } from 'react'
import type { Role } from '../../shared/permissions'
import { messages } from '../i18n'
import { BoxIcon, CartIcon, ChartIcon, HomeIcon, ReceiptIcon, SettingsIcon, StoreIcon, TruckIcon, UsersIcon, type IconProps } from '../components/icons'

/**
 * Sidebar navigation (design system §4.6).
 *
 * The list is data, not markup, so a client overlay can hide a page it does not
 * want (the extension registry will read this shape later). Two extra flags
 * carry information the sidebar itself must not invent:
 *
 * - `built` — the page exists. The rest are Phase-2 shells that say so, rather
 *   than an empty screen that looks broken.
 * - `roles` — who may see the item. The renderer only *hides*; the main process
 *   re-checks every operation, so a hidden item is a convenience, not a defence.
 */
export type NavKey =
  | 'home'
  | 'pos'
  | 'inventory'
  | 'purchases'
  | 'sales'
  | 'customers'
  | 'suppliers'
  | 'reports'
  | 'settings'
  | 'design-system'

export type NavItem = {
  key: NavKey
  label: string
  icon: ComponentType<IconProps>
  /** Pages built in this phase render for real; the others show a placeholder. */
  built: boolean
  /** Only shown in a dev build; the page is a separate chunk (§10). */
  devOnly?: boolean
  roles?: readonly Role[]
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'home', label: messages.nav.home, icon: HomeIcon, built: true },
  { key: 'pos', label: messages.nav.pos, icon: CartIcon, built: true },
  { key: 'inventory', label: messages.nav.inventory, icon: BoxIcon, built: false },
  { key: 'purchases', label: messages.nav.purchases, icon: TruckIcon, built: false },
  { key: 'sales', label: messages.nav.sales, icon: ReceiptIcon, built: false },
  { key: 'customers', label: messages.nav.customers, icon: UsersIcon, built: false },
  { key: 'suppliers', label: messages.nav.suppliers, icon: StoreIcon, built: false },
  { key: 'reports', label: messages.nav.reports, icon: ChartIcon, built: false },
  { key: 'settings', label: messages.nav.settings, icon: SettingsIcon, built: true, roles: ['owner', 'manager'] },
  { key: 'design-system', label: messages.nav.designSystem, icon: BoxIcon, built: true, devOnly: true },
]

/** The items this role may see. The dev gallery only appears in a dev build. */
export function navItemsForRole(role: Role, options?: { includeDev?: boolean }): readonly NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      (item.devOnly !== true || options?.includeDev === true) && (item.roles === undefined || item.roles.includes(role)),
  )
}

/** Where the app lands after login: the first item the role can actually use. */
export function defaultNavKey(role: Role): NavKey {
  return navItemsForRole(role)[0]?.key ?? 'home'
}
