import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from './database'

function makeRoot(name: string): string {
  const root = join(tmpdir(), `small-shop-pos-${name}-${Date.now()}`)
  mkdirSync(root, { recursive: true })
  return root
}

describe('migration runner', () => {
  it('reruns without changes and restores a failed pending migration state', async () => {
    const root = makeRoot('runner')
    const migrations = join(root, 'migrations')
    const userData = join(root, 'user-data')
    mkdirSync(migrations, { recursive: true })
    writeFileSync(join(migrations, '0001_base.sql'), 'CREATE TABLE base (id INTEGER PRIMARY KEY) STRICT;', 'utf8')

    const first = await openDatabase(userData, migrations)
    first.database.prepare('INSERT INTO base (id) VALUES (1)').run()
    closeDatabase(first)

    const second = await openDatabase(userData, migrations)
    expect(second.database.prepare('SELECT COUNT(*) AS count FROM base').get()).toEqual({ count: 1 })
    closeDatabase(second)

    writeFileSync(join(migrations, '0002_fail.sql'), 'CREATE TABLE pending (id INTEGER); SELECT no_such_function();', 'utf8')
    let failed = false
    try {
      await openDatabase(userData, migrations)
    } catch {
      failed = true
    }
    expect(failed).toBe(true)

    const databasePath = join(userData, 'database', 'small-shop-pos.sqlite')
    const afterFailure = new Database(databasePath)
    expect(afterFailure.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pending'").get()).toBeUndefined()
    expect(afterFailure.prepare('SELECT COUNT(*) AS count FROM base').get()).toEqual({ count: 1 })
    afterFailure.close()
    const backupDirectory = join(userData, 'backups')
    expect(existsSync(backupDirectory)).toBe(true)
    expect(readdirSync(backupDirectory).some((fileName) => fileName.startsWith('pre-migration-'))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('detects an edited applied migration by checksum', async () => {
    const root = makeRoot('checksum')
    const migrations = join(root, 'migrations')
    mkdirSync(migrations, { recursive: true })
    const migrationPath = join(migrations, '0001_checksum.sql')
    writeFileSync(migrationPath, 'CREATE TABLE checksum_table (id INTEGER) STRICT;', 'utf8')
    const context = await openDatabase(join(root, 'user-data'), migrations)
    closeDatabase(context)
    writeFileSync(migrationPath, 'CREATE TABLE checksum_table (id INTEGER, value TEXT) STRICT;', 'utf8')
    await expect(openDatabase(join(root, 'user-data'), migrations)).rejects.toThrow('migration_checksum_mismatch')
    rmSync(root, { recursive: true, force: true })
  })

  it('keeps migration checksums and applied timestamps', async () => {
    const root = makeRoot('metadata')
    const migrations = join(root, 'migrations')
    mkdirSync(migrations, { recursive: true })
    const migrationPath = join(migrations, '0001_metadata.sql')
    const sql = 'CREATE TABLE metadata_table (id INTEGER) STRICT;'
    writeFileSync(migrationPath, sql, 'utf8')
    const context = await openDatabase(join(root, 'user-data'), migrations)
    const row = context.database.prepare('SELECT id, checksum, applied_at FROM schema_migrations').get() as {
      id: string
      checksum: string
      applied_at: number
    }
    expect(row.id).toBe('0001_metadata')
    expect(row.checksum).toHaveLength(64)
    expect(row.applied_at).toBeGreaterThan(0)
    expect(readFileSync(migrationPath, 'utf8')).toBe(sql)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
