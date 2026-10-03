import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

describe('database developer scripts', () => {
  it('refuses reset outside the explicit dev database path', () => {
    expect(() => execFileSync(
      process.execPath,
      ['scripts/db-cli.cjs', 'reset'],
      {
        cwd: process.cwd(),
        env: { ...process.env, SMALL_ERP_DEV_DB: join(process.cwd(), 'not-dev.db') },
        stdio: 'pipe',
      },
    )).toThrow(/db_reset_refused/u)
  })

  it('migrates, reports status, and resets the explicit dev database', () => {
    const devRoot = join(process.cwd(), '.dev-data')
    rmSync(devRoot, { recursive: true, force: true })
    const migrateOutput = execFileSync(process.execPath, ['scripts/db-cli.cjs', 'migrate'], { encoding: 'utf8' })
    expect(migrateOutput).toContain('migrated:')
    const status = execFileSync(process.execPath, ['scripts/db-cli.cjs', 'status'], { encoding: 'utf8' })
    expect(status).toContain('"pending": []')
    expect(execFileSync(process.execPath, ['scripts/db-cli.cjs', 'reset'], { encoding: 'utf8' })).toContain('reset:ok')
    expect(existsSync(join(devRoot, 'dev.db'))).toBe(false)
    rmSync(devRoot, { recursive: true, force: true })
  })
})
