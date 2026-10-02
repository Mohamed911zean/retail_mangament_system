import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  isFingerprintMatch,
  licenseMachineCode,
  matchingFingerprintSources,
  signLicense,
  verifyLicense,
  type FingerprintSourceValues,
  type LicensePayload,
} from './license'
import { readMachineFingerprint, type FingerprintSourceReaders } from '../../main/license/fingerprint'

const sourceValues: FingerprintSourceValues = {
  machineGuid: 'machine-guid',
  volumeSerial: 'volume-serial',
  cpuId: 'cpu-id',
}

const payload: LicensePayload = {
  licenseId: 'license-001',
  kid: 'demo-2026',
  client: 'frozen-food',
  machine: licenseMachineCode(sourceValues),
  issuedAt: 1700000000000,
  expiresAt: 1900000000000,
  features: ['printing'],
}

describe('license signing and fingerprint matching', () => {
  it('signs and verifies an Ed25519 license token', () => {
    const keys = generateKeyPairSync('ed25519')
    const token = signLicense(payload, keys.privateKey)

    expect(verifyLicense(token, keys.publicKey, payload.kid)).toEqual({ valid: true, payload })
  })

  it('matches two of three fingerprint sources', () => {
    const changedOne = { ...sourceValues, cpuId: 'changed-cpu' }
    const changedTwo = { ...sourceValues, cpuId: 'changed-cpu', volumeSerial: 'changed-volume' }

    expect(matchingFingerprintSources(sourceValues, changedOne)).toBe(2)
    expect(isFingerprintMatch(sourceValues, changedOne)).toBe(true)
    expect(isFingerprintMatch(sourceValues, changedTwo)).toBe(false)
  })

  it('uses injectable source readers', async () => {
    const readers: FingerprintSourceReaders = {
      readMachineGuid: async () => 'mock-machine',
      readVolumeSerial: async () => 'mock-volume',
      readCpuId: async () => 'mock-cpu',
    }

    await expect(readMachineFingerprint(readers)).resolves.toEqual({
      machineGuid: 'mock-machine',
      volumeSerial: 'mock-volume',
      cpuId: 'mock-cpu',
    })
  })

  it('rejects an empty fingerprint source', async () => {
    const readers: FingerprintSourceReaders = {
      readMachineGuid: async () => '',
      readVolumeSerial: async () => 'mock-volume',
      readCpuId: async () => 'mock-cpu',
    }

    await expect(readMachineFingerprint(readers)).rejects.toThrow(
      'Fingerprint source "machineGuid" returned an empty value',
    )
  })

  it('rejects a tampered payload and an unexpected key id', () => {
    const keys = generateKeyPairSync('ed25519')
    const token = signLicense(payload, keys.privateKey)
    const [encodedPayload, signature] = token.split('.')
    const tamperedToken = `${Buffer.from(JSON.stringify({ ...payload, client: 'other' }), 'utf8').toString('base64url')}.${signature}`

    expect(verifyLicense(tamperedToken, keys.publicKey)).toEqual({
      valid: false,
      reason: 'invalid-signature',
    })
    expect(verifyLicense(token, keys.publicKey, 'other-kid')).toEqual({
      valid: false,
      reason: 'wrong-key-id',
    })
    expect(encodedPayload).toBeTruthy()
  })
})
