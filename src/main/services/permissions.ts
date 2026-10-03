import type { ServiceResult } from './result'
import { serviceErr, serviceOk } from './result'

export type PermissionCode =
  | 'sale.zero_price'
  | 'sale.expired_override'
  | 'stock.negative_override'
  | 'cash.manual_move'
  | 'document.void'
  | 'product.price_change'
  | 'product.cost_change'

export type Actor = { userId: string; role: 'owner' | 'manager' | 'cashier' }

const allPermissions: readonly PermissionCode[] = [
  'sale.zero_price',
  'sale.expired_override',
  'stock.negative_override',
  'cash.manual_move',
  'document.void',
  'product.price_change',
  'product.cost_change',
]

export const rolePermissions: Record<Actor['role'], readonly PermissionCode[]> = {
  owner: allPermissions,
  manager: allPermissions,
  cashier: [],
}

export function assertPermission(actor: Actor, permission: PermissionCode): ServiceResult<true> {
  return rolePermissions[actor.role].includes(permission)
    ? serviceOk(true)
    : serviceErr('permission_denied', { permission, userId: actor.userId })
}
