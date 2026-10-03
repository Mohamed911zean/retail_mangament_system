import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

function sqliteVersionNumber(version: string): number {
  const parts = version.split('.').map((part) => Number(part))
  return parts[0] * 1000000 + parts[1] * 1000 + parts[2]
}

describe('bundled SQLite runtime', () => {
  it('reports a STRICT-capable SQLite version', () => {
    const database = new Database(':memory:')
    try {
      const row = database.prepare('SELECT sqlite_version() AS version').get() as {
        version: string
      }
      console.log(`bundled sqlite_version(): ${row.version}`)
      expect(sqliteVersionNumber(row.version)).toBeGreaterThanOrEqual(3037000)
    } finally {
      database.close()
    }
  })
})
