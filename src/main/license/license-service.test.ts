import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
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
})
