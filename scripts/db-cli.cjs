const Database = require('better-sqlite3')
const { createHash } = require('node:crypto')
const { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } = require('node:fs')
const { join, resolve } = require('node:path')

const command = process.argv[2]
const devRoot = resolve(process.env.SMALL_ERP_DEV_ROOT || '.dev-data')
const databasePath = resolve(process.env.SMALL_ERP_DEV_DB || join(devRoot, 'dev.db'))
const migrationsDirectory = resolve(process.env.SMALL_ERP_MIGRATIONS || 'migrations')

function migrationFiles() {
  return readdirSync(migrationsDirectory)
    .filter((fileName) => /^\d+[-_].+\.sql$/u.test(fileName))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
    .map((fileName) => {
      const sql = readFileSync(join(migrationsDirectory, fileName), 'utf8')
      return {
        id: fileName.replace(/\.sql$/u, ''),
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      }
    })
}

function ensureMigrationsTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT
  `)
}

function open() {
  mkdirSync(resolve(databasePath, '..'), { recursive: true })
  const database = new Database(databasePath)
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = FULL')
  database.pragma('foreign_keys = ON')
  ensureMigrationsTable(database)
  return database
}

async function migrate() {
  const database = open()
  try {
    const migrations = migrationFiles()
    const applied = database.prepare('SELECT id, checksum FROM schema_migrations').all()
    const appliedById = new Map(applied.map((row) => [row.id, row.checksum]))
    for (const migration of migrations) {
      if (appliedById.has(migration.id) && appliedById.get(migration.id) !== migration.checksum) {
        throw new Error(`migration_checksum_mismatch:${migration.id}`)
      }
    }
    const pending = migrations.filter((migration) => !appliedById.has(migration.id))
    if (pending.length > 0 && existsSync(databasePath)) {
      mkdirSync(join(devRoot, 'backups'), { recursive: true })
      await database.backup(join(devRoot, 'backups', `pre-migration-${Date.now()}.sqlite`))
    }
    const insert = database.prepare('INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)')
    for (const migration of pending) {
      database.transaction(() => {
        database.exec(migration.sql)
        insert.run(migration.id, migration.checksum, Date.now())
      })()
    }
    console.log(`migrated:${pending.length}`)
  } finally {
    database.close()
  }
}

function status() {
  const database = open()
  try {
    const applied = database.prepare('SELECT id, checksum, applied_at FROM schema_migrations ORDER BY id').all()
    const appliedIds = new Set(applied.map((row) => row.id))
    const pending = migrationFiles().filter((migration) => !appliedIds.has(migration.id))
    console.log(JSON.stringify({ applied, pending: pending.map((migration) => migration.id) }, null, 2))
  } finally {
    database.close()
  }
}

function reset() {
  const allowed = resolve(devRoot, 'dev.db')
  if (databasePath !== allowed || !databasePath.startsWith(`${devRoot}\\`)) {
    throw new Error('db_reset_refused: only .dev-data/dev.db may be reset')
  }
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${databasePath}${suffix}`, { force: true })
  }
  console.log('reset:ok')
}

if (command === 'migrate') migrate().catch((error) => { console.error(error); process.exitCode = 1 })
else if (command === 'status') status()
else if (command === 'reset') reset()
else throw new Error('usage: db-cli.cjs <migrate|status|reset>')
