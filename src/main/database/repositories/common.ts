import type Database from 'better-sqlite3'

export type DatabaseHandle = Database.Database

export type DatabaseErrorCode = 'constraint_unique' | 'constraint_check' | 'constraint_foreign_key' | 'database_error'

export class RepositoryError extends Error {
  readonly code: DatabaseErrorCode

  constructor(code: DatabaseErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RepositoryError'
    this.code = code
  }
}

export function mapDatabaseError(error: unknown): RepositoryError {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('UNIQUE constraint failed')) {
    return new RepositoryError('constraint_unique', 'A record with the same unique value already exists.', { cause: error })
  }
  if (message.includes('CHECK constraint failed')) {
    return new RepositoryError('constraint_check', 'The record violates a database rule.', { cause: error })
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return new RepositoryError('constraint_foreign_key', 'The referenced record does not exist.', { cause: error })
  }
  return new RepositoryError('database_error', 'The database operation failed.', { cause: error })
}

export function execute<T>(operation: () => T): T {
  try {
    return operation()
  } catch (error) {
    throw mapDatabaseError(error)
  }
}

export function runInTransaction<T>(database: DatabaseHandle, work: (transaction: DatabaseHandle) => T): T {
  const transaction = database.transaction(() => {
    const result = work(database)
    if (result !== null && (typeof result === 'object' || typeof result === 'function') && 'then' in result) {
      throw new TypeError('runInTransaction does not accept asynchronous callbacks')
    }
    return result
  })
  return transaction()
}

const booleanColumns = new Set(['is_active', 'is_primary', 'track_expiry', 'is_weighted'])

function camelCase(key: string): string {
  return key.replace(/_([a-z])/gu, (_, letter: string) => letter.toUpperCase())
}

export function mapRow<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      camelCase(key),
      booleanColumns.has(key) && value !== null ? value === 1 : value,
    ]),
  ) as T
}

export function mapRows<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => mapRow<T>(row))
}

export function insertAndMap<T>(
  database: DatabaseHandle,
  sql: string,
  parameters: unknown[],
): T {
  return mapRow<T>(execute(() => database.prepare(sql).get(...parameters) as Record<string, unknown>))
}
