import { execute, mapRows, type DatabaseHandle } from './common'
import type { AuditLogRow } from '../rows'
export function listAuditLog(database: DatabaseHandle, entityType?: string, entityId?: string): AuditLogRow[] {
  const rows = entityType === undefined
    ? execute(() => database.prepare('SELECT * FROM audit_log ORDER BY occurred_at,id').all())
    : execute(() => database.prepare('SELECT * FROM audit_log WHERE entity_type = ? AND (? IS NULL OR entity_id = ?) ORDER BY occurred_at,id').all(entityType, entityId ?? null, entityId ?? null))
  return mapRows<AuditLogRow>(rows as Record<string, unknown>[])
}
export function insertAuditLog(database: DatabaseHandle, row: Partial<AuditLogRow>): void {
  execute(() => database.prepare('INSERT INTO audit_log (id,occurred_at,user_id,action,entity_type,entity_id,changed_fields_json,before_json,after_json,reason,device_id,created_at) VALUES (@id,@occurred_at,@user_id,@action,@entity_type,@entity_id,@changed_fields_json,@before_json,@after_json,@reason,@device_id,@created_at)').run(row))
}
