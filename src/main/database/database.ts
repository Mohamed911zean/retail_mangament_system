import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'

type Migration = {
  id: string
  path: string
  sql: string
  checksum: string
}

export type DatabasePaths = {
  databasePath: string
  backupDirectory: string
  migrationsDirectory: string
}

export type DatabaseContext = {
  database: Database.Database
  paths: DatabasePaths
}

export type DatabaseBackup = {
  fileName: string
  path: string
  createdAt: number
  sizeBytes: number
}

function migrationFiles(migrationsDirectory: string): Migration[] {
  return readdirSync(migrationsDirectory)
    .filter((fileName) => /^\d+[-_].+\.sql$/u.test(fileName))
    .map((fileName) => ({
      id: fileName.replace(/\.sql$/u, ''),
      path: join(migrationsDirectory, fileName),
      sql: readFileSync(join(migrationsDirectory, fileName), 'utf8'),
      checksum: createHash('sha256')
        .update(readFileSync(join(migrationsDirectory, fileName), 'utf8'))
        .digest('hex'),
    }))
    .sort((left, right) => left.id.localeCompare(right.id, 'en', { numeric: true }))
}

function configureDatabase(database: Database.Database): void {
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = FULL')
  database.pragma('foreign_keys = ON')

  const quickCheck = database.pragma('quick_check', { simple: true })
  if (quickCheck !== 'ok') {
    throw new Error(`SQLite quick_check failed: ${String(quickCheck)}`)
  }
}

async function createPreMigrationBackup(
  database: Database.Database,
  backupDirectory: string,
): Promise<string> {
  mkdirSync(backupDirectory, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const backupPath = join(backupDirectory, `pre-migration-${timestamp}.sqlite`)
  await database.backup(backupPath)
  return backupPath
}

function backupFileName(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-')
  return `${prefix}-${timestamp}.sqlite`
}

function isBackupPath(context: DatabaseContext, backupPath: string): boolean {
  if (!isAbsolute(backupPath)) {
    return false
  }
  const relativePath = relative(context.paths.backupDirectory, backupPath)
  return relativePath !== '' && !relativePath.startsWith('..') && !relativePath.includes(':')
}

function ensureMigrationTable(database: Database.Database, migrationsDirectory: string): void {
  const table = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get()
  if (table === undefined) {
    database.exec(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      ) STRICT
    `)
    return
  }

  const columns = database.prepare('PRAGMA table_info(schema_migrations)').all() as {
    name: string
  }[]
  if (columns.some((column) => column.name === 'checksum')) {
    return
  }

  database.exec(`
    ALTER TABLE schema_migrations RENAME TO schema_migrations_legacy;
    CREATE TABLE schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `)
  const legacyRows = database
    .prepare('SELECT id, appliedAt FROM schema_migrations_legacy')
    .all() as { id: string; appliedAt: number }[]
  const filesById = new Map(migrationFiles(migrationsDirectory).map((migration) => [migration.id, migration.checksum]))
  const insert = database.prepare(
    'INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
  )
  for (const row of legacyRows) {
    const checksum = filesById.get(row.id)
    if (checksum === undefined) {
      throw new Error(`migration_checksum_missing:${row.id}`)
    }
    insert.run(row.id, checksum, row.appliedAt)
  }
  database.exec('DROP TABLE schema_migrations_legacy')
}

async function runMigrations(
  database: Database.Database,
  migrationsDirectory: string,
  backupDirectory: string,
  databaseExisted: boolean,
): Promise<void> {
  ensureMigrationTable(database, migrationsDirectory)

  const appliedMigrationIds = new Set(
    database
      .prepare('SELECT id FROM schema_migrations ORDER BY id')
      .all()
      .map((row) => String((row as { id: string }).id)),
  )
  const migrations = migrationFiles(migrationsDirectory)
  const appliedRows = database
    .prepare('SELECT id, checksum FROM schema_migrations ORDER BY id')
    .all() as { id: string; checksum: string }[]
  const checksums = new Map(appliedRows.map((row) => [row.id, row.checksum]))
  for (const migration of migrations) {
    if (appliedMigrationIds.has(migration.id) && checksums.get(migration.id) !== migration.checksum) {
      throw new Error(`migration_checksum_mismatch:${migration.id}`)
    }
  }
  const pendingMigrations = migrations.filter((migration) => !appliedMigrationIds.has(migration.id))

  if (pendingMigrations.length === 0) {
    return
  }

  if (databaseExisted) {
    await createPreMigrationBackup(database, backupDirectory)
  }

  const insertMigration = database.prepare(
    'INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
  )

  for (const migration of pendingMigrations) {
    const applyMigration = database.transaction(() => {
      database.exec(migration.sql)
      insertMigration.run(migration.id, migration.checksum, Date.now())
    })
    applyMigration()
  }
}

export async function openDatabase(userDataDirectory: string, migrationsDirectory: string): Promise<DatabaseContext> {
  const databaseDirectory = join(userDataDirectory, 'database')
  const databasePath = join(databaseDirectory, 'small-shop-pos.sqlite')
  const backupDirectory = join(userDataDirectory, 'backups')
  const databaseExisted = existsSync(databasePath)

  mkdirSync(databaseDirectory, { recursive: true })
  const database = new Database(databasePath)

  try {
    configureDatabase(database)
    await runMigrations(database, migrationsDirectory, backupDirectory, databaseExisted)
    configureDatabase(database)
    return {
      database,
      paths: {
        databasePath,
        backupDirectory,
        migrationsDirectory,
      },
    }
  } catch (error) {
    database.close()
    throw error
  }
}

export function closeDatabase(context: DatabaseContext): void {
  if (context.database.open) {
    context.database.close()
  }
}

export async function createDatabaseBackup(
  context: DatabaseContext,
  prefix = 'manual',
): Promise<DatabaseBackup> {
  mkdirSync(context.paths.backupDirectory, { recursive: true })
  const fileName = backupFileName(prefix)
  const path = join(context.paths.backupDirectory, fileName)
  await context.database.backup(path)
  const stats = statSync(path)
  return { fileName, path, createdAt: stats.birthtimeMs, sizeBytes: stats.size }
}

export function listDatabaseBackups(context: DatabaseContext): DatabaseBackup[] {
  if (!existsSync(context.paths.backupDirectory)) {
    return []
  }

  return readdirSync(context.paths.backupDirectory)
    .filter((fileName) => fileName.endsWith('.sqlite'))
    .map((fileName) => {
      const path = join(context.paths.backupDirectory, fileName)
      const stats = statSync(path)
      return { fileName, path, createdAt: stats.birthtimeMs, sizeBytes: stats.size }
    })
    .sort((left, right) => right.createdAt - left.createdAt)
}

export async function restoreDatabaseBackup(
  context: DatabaseContext,
  fileName: string,
): Promise<DatabaseContext> {
  const backupPath = join(context.paths.backupDirectory, fileName)
  if (!isBackupPath(context, backupPath) || !fileName.endsWith('.sqlite')) {
    throw new Error('The selected backup is invalid.')
  }
  if (!existsSync(backupPath)) {
    throw new Error('The selected backup does not exist.')
  }

  const safetyBackup = await createDatabaseBackup(context, 'pre-restore')
  mkdirSync(context.paths.backupDirectory, { recursive: true })
  const restorePath = join(context.paths.backupDirectory, `restore-${Date.now()}.sqlite`)
  const source = new Database(backupPath, { readonly: true })

  try {
    const quickCheck = source.pragma('quick_check', { simple: true })
    if (quickCheck !== 'ok') {
      throw new Error('The selected backup failed SQLite quick_check.')
    }
    await source.backup(restorePath)
  } finally {
    source.close()
  }

  closeDatabase(context)
  try {
    rmSync(`${context.paths.databasePath}-wal`, { force: true })
    rmSync(`${context.paths.databasePath}-shm`, { force: true })
    renameSync(restorePath, context.paths.databasePath)
  } catch (error) {
    rmSync(restorePath, { force: true })
    throw new Error(
      `Restore failed; safety backup retained at ${safetyBackup.path}: ${String(error)}`,
      { cause: error },
    )
  }

  const restoredDatabase = new Database(context.paths.databasePath)
  try {
    configureDatabase(restoredDatabase)
    return { database: restoredDatabase, paths: context.paths }
  } catch (error) {
    restoredDatabase.close()
    throw new Error(
      `Restored database validation failed; safety backup retained at ${safetyBackup.path}: ${String(error)}`,
      { cause: error },
    )
  }
}
