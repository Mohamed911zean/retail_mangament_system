import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database/database'
import { writeAudit } from './audit'
import { type Clock } from './clock'
import { createUlidGenerator, type IdGenerator } from './ids'
import { assertPermission } from './permissions'
import { SettingsService } from './settings'

const clock: Clock = { now: () => 1700000000000 }
const ids: IdGenerator = { next: (() => { let count = 0; return () => `01TEST${String(++count).padStart(20, '0')}` })() }

describe('service foundation', () => {
  it('uses stable permissions and deterministic ids in tests', () => {
    expect(assertPermission({ userId: 'u1', role: 'owner' }, 'document.void')).toEqual({ ok: true, value: true })
    expect(assertPermission({ userId: 'u2', role: 'cashier' }, 'document.void')).toMatchObject({
      ok: false,
      error: { code: 'permission_denied', messageKey: 'errors.permission_denied' },
    })
    expect(ids.next()).toBe('01TEST00000000000000000001')
    const generated = createUlidGenerator().next()
    expect(generated).toHaveLength(26)
  })

  it('persists settings, device id, preset, and redacted audit snapshots', async () => {
    const root = join(tmpdir(), `small-shop-pos-services-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    const now = clock.now()
    context.database.prepare(`
      INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run('u1', 'owner', 'Owner', 'hash', 'owner', 1, now, now, '01TEST')
    const service = new SettingsService({ database: context.database, clock, ids })
    const initial = await service.get()
    expect(initial).toMatchObject({ ok: true, value: { device_id: '01TEST00000000000000000002' } })
    const changed = await service.set({ userId: 'u1', role: 'owner' }, 'tax', true)
    expect(changed).toMatchObject({ ok: true, value: { tax: true } })
    const preset = await service.applyFrozenFoodPreset({ userId: 'u1', role: 'owner' })
    expect(preset).toMatchObject({ ok: true, value: { expiry_batches: true } })
    const denied = await service.set({ userId: 'u2', role: 'cashier' }, 'tax', false)
    expect(denied).toMatchObject({ ok: false, error: { code: 'permission_denied' } })
    writeAudit(context.database, ids, {
      userId: 'u1', action: 'void_sale', entityType: 'sale', entityId: 's1',
      before: { passwordHash: 'secret', total: 100 }, after: { passwordHash: 'new', total: 0 },
      now: clock.now(), deviceId: '01TEST',
    })
    const audit = context.database.prepare('SELECT before_json, after_json FROM audit_log WHERE action = ?').get('void_sale') as { before_json: string; after_json: string }
    expect(audit.before_json).not.toContain('password')
    expect(audit.after_json).toContain('"total":0')
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
