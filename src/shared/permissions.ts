/**
 * Permission model shared by the main process (enforcement) and the renderer
 * (navigation/controls are hidden for permissions the role does not hold).
 * The renderer-side check is a convenience only — the main process always
 * re-checks before running an operation.
 */
export type Role = 'owner' | 'manager' | 'cashier'

export type PermissionCode =
  | 'sale.zero_price'
  | 'sale.expired_override'
  | 'sale.credit_override'
  | 'stock.negative_override'
  | 'cash.manual_move'
  | 'document.void'
  | 'product.price_change'
  | 'product.cost_change'

/** The actor is derived from the main-process session, never sent by the renderer. */
export type Actor = { userId: string; role: Role }

export const allPermissions: readonly PermissionCode[] = [
  'sale.zero_price',
  'sale.expired_override',
  'sale.credit_override',
  'stock.negative_override',
  'cash.manual_move',
  'document.void',
  'product.price_change',
  'product.cost_change',
]

export const rolePermissions: Record<Role, readonly PermissionCode[]> = {
  owner: allPermissions,
  manager: allPermissions,
  cashier: [],
}

export function permissionsForRole(role: Role): readonly PermissionCode[] {
  return rolePermissions[role]
}

export function roleHasPermission(role: Role, permission: PermissionCode): boolean {
  return rolePermissions[role].includes(permission)
}
