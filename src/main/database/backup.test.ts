import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  closeDatabase,
  createDatabaseBackup,
  listDatabaseBackups,
  openDatabase,
  restoreDatabaseBackup,
} from './database'

describe('database backup and restore', () => {
  it('creates an online backup and restores it with a safety backup', async () => {
    const root = join(tmpdir(), `small-shop-pos-backup-${Date.now()}`)
    const migrationsDirectory = join(root, 'migrations')
    mkdirSync(migrationsDirectory, { recursive: true })
    writeFileSync(
      join(migrationsDirectory, '0001_test.sql'),
      "CREATE TABLE values_table (value TEXT NOT NULL); INSERT INTO values_table (value) VALUES ('before');",
      'utf8',
    )

    const context = await openDatabase(join(root, 'user-data'), migrationsDirectory)
    const backup = await createDatabaseBackup(context)
    context.database.prepare('UPDATE values_table SET value = ?').run('after')

    const restored = await restoreDatabaseBackup(context, backup.fileName)
    expect(restored.database.prepare('SELECT value FROM values_table').get()).toEqual({ value: 'before' })

    const backups = listDatabaseBackups(restored)
    expect(backups.some((item) => item.fileName === backup.fileName)).toBe(true)
    expect(backups.some((item) => item.fileName.startsWith('pre-restore-'))).toBe(true)
    expect(existsSync(restored.paths.databasePath)).toBe(true)

    closeDatabase(restored)
    expect(readFileSync(backup.path).length).toBeGreaterThan(0)
    rmSync(root, { recursive: true, force: true })
  })
})
