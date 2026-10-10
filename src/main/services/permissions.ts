import type { Actor, PermissionCode } from '../../shared/permissions'
import { rolePermissions } from '../../shared/permissions'
import type { ServiceResult } from './result'
import { serviceErr, serviceOk } from './result'

// The permission table and the actor contract live in `src/shared/permissions.ts`
// so the renderer can hide what a role cannot use. Enforcement always happens
// here, in the main process.
export type { Actor, PermissionCode }
export { rolePermissions }

export function assertPermission(actor: Actor, permission: PermissionCode): ServiceResult<true> {
  return rolePermissions[actor.role].includes(permission)
    ? serviceOk(true)
    : serviceErr('permission_denied', { permission, userId: actor.userId })
}
