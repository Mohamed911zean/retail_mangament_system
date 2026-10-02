import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type Migration = {
  id: string
  path: string
  sql: string
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

function migrationFiles(migrationsDirectory: string): Migration[] {
  return readdirSync(migrationsDirectory)
    .filter((fileName) => /^\d+[-_].+\.sql$/u.test(fileName))
    .map((fileName) => ({
      id: fileName.replace(/\.sql$/u, ''),
      path: join(migrationsDirectory, fileName),
      sql: readFileSync(join(migrationsDirectory, fileName), 'utf8'),
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

function ensureMigrationTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      appliedAt INTEGER NOT NULL
    )
  `)
}

async function runMigrations(
  database: Database.Database,
  migrationsDirectory: string,
  backupDirectory: string,
  databaseExisted: boolean,
): Promise<void> {
  ensureMigrationTable(database)

  const appliedMigrationIds = new Set(
    database
      .prepare('SELECT id FROM schema_migrations ORDER BY id')
      .all()
      .map((row) => String((row as { id: string }).id)),
  )
  const pendingMigrations = migrationFiles(migrationsDirectory).filter(
    (migration) => !appliedMigrationIds.has(migration.id),
  )

  if (pendingMigrations.length === 0) {
    return
  }

  if (databaseExisted) {
    await createPreMigrationBackup(database, backupDirectory)
  }

  const insertMigration = database.prepare(
    'INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)',
  )

  for (const migration of pendingMigrations) {
    const applyMigration = database.transaction(() => {
      database.exec(migration.sql)
      insertMigration.run(migration.id, Date.now())
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
