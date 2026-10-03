import type { DatabaseHandle } from '../database/repositories/common'
import { insertAuditLog } from '../database/repositories/audit-log'
import type { IdGenerator } from './ids'

type AuditInput = {
  userId: string | null
  action: string
  entityType: string
  entityId: string | null
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  reason?: string | null
  now: number
  deviceId: string
}

function withoutSecrets(snapshot: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (snapshot === undefined) return undefined
  const copy = { ...snapshot }
  delete copy.passwordHash
  delete copy.password_hash
  delete copy.privateKey
  delete copy.private_key
  delete copy.licenseKey
  delete copy.license_key
  return copy
}

function changedFields(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (before === undefined || after === undefined) return undefined
  const changed: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) changed[key] = { before: before[key], after: after[key] }
  }
  return changed
}

export function writeAudit(database: DatabaseHandle, ids: IdGenerator, input: AuditInput): void {
  const before = withoutSecrets(input.before)
  const after = withoutSecrets(input.after)
  const isVoid = input.action.toLowerCase().includes('void')
  insertAuditLog(database, {
    id: ids.next(),
    occurredAt: input.now,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    changedFieldsJson: JSON.stringify(isVoid ? undefined : changedFields(before, after)),
    beforeJson: JSON.stringify(isVoid ? before : undefined),
    afterJson: JSON.stringify(isVoid ? after : undefined),
    reason: input.reason ?? null,
    deviceId: input.deviceId,
    createdAt: input.now,
    updatedAt: input.now,
  })
}
