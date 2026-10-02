import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { signLicense, licenseMachineCode, type FingerprintSourceValues } from '../../shared/license/license'
import { LicenseService } from './license-service'

const fingerprint: FingerprintSourceValues = {
  machineGuid: 'machine',
  volumeSerial: 'volume',
  cpuId: 'cpu',
}

const readers = {
  readMachineGuid: async () => fingerprint.machineGuid,
  readVolumeSerial: async () => fingerprint.volumeSerial,
  readCpuId: async () => fingerprint.cpuId,
}

function createService(now = 1_700_000_000_000): {
  service: LicenseService
  userDataPath: string
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']
} {
  const userDataPath = mkdtempSync(join(tmpdir(), 'small-shop-license-'))
  const publicKeyPath = join(userDataPath, 'public-key.pem')
  const keys = generateKeyPairSync('ed25519')
  writeFileSync(publicKeyPath, keys.publicKey.export({ type: 'spki', format: 'pem' }))
  return {
    service: new LicenseService({
      userDataPath,
      publicKeyPath,
      fingerprintReaders: readers,
      now: () => now,
    }),
    userDataPath,
    privateKey: keys.privateKey,
  }
}

describe('LicenseService', () => {
  it('reports unlicensed, activates a matching key, and persists it', async () => {
    const context = createService()
    const machine = licenseMachineCode(fingerprint)
    const initial = await context.service.getStatus()
    const token = signLicense(
      {
        licenseId: 'license-1',
        kid: 'demo-2026',
        client: 'frozen-food',
        machine,
        issuedAt: 1_600_000_000_000,
        expiresAt: 1_900_000_000_000,
        features: ['printing'],
      },
      context.privateKey,
    )

    expect(initial.state).toBe('unlicensed')
    await expect(context.service.activate(token)).resolves.toMatchObject({
      state: 'active',
      mode: 'active',
      kid: 'demo-2026',
      client: 'frozen-food',
    })
    expect(await context.service.getStatus()).toMatchObject({ state: 'active', mode: 'active' })
  })

  it('switches to read-only mode after expiry', async () => {
    const context = createService(1_900_000_000_000)
    const machine = licenseMachineCode(fingerprint)
    const token = signLicense(
      {
        licenseId: 'license-2',
        kid: 'demo-2026',
        client: 'frozen-food',
        machine,
        issuedAt: 1_600_000_000_000,
        expiresAt: 1_800_000_000_000,
        features: [],
      },
      context.privateKey,
    )

    await expect(context.service.activate(token)).resolves.toMatchObject({
      state: 'expired',
      mode: 'read-only',
    })
  })

  it('rejects a wrong-machine license', async () => {
      const context = createService()
      const token = signLicense(
        {
          licenseId: 'license-wrong-machine',
          kid: 'demo-2026',
          client: 'frozen-food',
          machine: 'different-machine-code',
          issuedAt: 1_600_000_000_000,
          expiresAt: 1_900_000_000_000,
          features: [],
        },
        context.privateKey,
      )

      await expect(context.service.activate(token)).resolves.toMatchObject({
        state: 'machine-mismatch',
        mode: 'read-only',
      })
  })

  it('rejects a tampered activation token and keeps the app unlicensed', async () => {
      const context = createService()
      const machine = licenseMachineCode(fingerprint)
      const token = signLicense(
        {
          licenseId: 'license-tampered',
          kid: 'demo-2026',
          client: 'frozen-food',
          machine,
          issuedAt: 1_600_000_000_000,
          expiresAt: 1_900_000_000_000,
          features: [],
        },
        context.privateKey,
      )
      const [payload, signature] = token.split('.')
      const tampered = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}.${signature}`

      await expect(context.service.activate(tampered)).resolves.toMatchObject({ state: 'invalid' })
      expect(readFileSync(join(context.userDataPath, 'license', 'last-seen-a'), 'utf8')).toContain('1700000000000')
  })

  it('reports missing activation as read-only without hiding data', async () => {
      const context = createService()
      await expect(context.service.getStatus()).resolves.toMatchObject({
        state: 'unlicensed',
        mode: 'read-only',
      })
  })

  it('detects clock rollback using both last-seen locations', async () => {
      let now = 1_700_000_000_000
      const context = createService(now)
      await context.service.getStatus()
      const clockA = join(context.userDataPath, 'license', 'last-seen-a')
      const clockB = join(context.userDataPath, 'license', 'last-seen-b')
      expect(readFileSync(clockA, 'utf8')).toBe(readFileSync(clockB, 'utf8'))

      now = 1_699_999_999_000
      const rollbackService = new LicenseService({
        userDataPath: context.userDataPath,
        publicKeyPath: join(context.userDataPath, 'public-key.pem'),
        fingerprintReaders: readers,
        now: () => now,
      })
      await expect(rollbackService.getStatus()).resolves.toMatchObject({
        state: 'clock-rollback',
        mode: 'read-only',
    })
  })
})
