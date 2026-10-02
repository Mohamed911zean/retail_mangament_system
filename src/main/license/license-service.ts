import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  licenseMachineCode,
  verifyLicense,
  type LicensePayload,
  type LicenseVerification,
} from '../../shared/license/license'
import type { LicenseStatus } from '../../shared/license/api'
import { readMachineFingerprint, type FingerprintSourceReaders } from './fingerprint'

type LicenseServiceOptions = {
  userDataPath: string
  publicKeyPath: string
  fingerprintReaders?: FingerprintSourceReaders
  now?: () => number
}

function checksum(machineCode: string): string {
  return createHash('sha256').update(machineCode, 'utf8').digest('hex').slice(0, 8).toUpperCase()
}

function baseStatus(machineCode: string): Pick<LicenseStatus, 'machineCode' | 'machineChecksum'> {
  return { machineCode, machineChecksum: machineCode ? checksum(machineCode) : '' }
}

function isExpired(payload: LicensePayload, now: number): boolean {
  return now >= payload.expiresAt
}

export class LicenseService {
  private readonly activationPath: string
  private readonly publicKey: Buffer
  private readonly fingerprintReaders?: FingerprintSourceReaders
  private readonly now: () => number

  public constructor(options: LicenseServiceOptions) {
    this.activationPath = join(options.userDataPath, 'license', 'activation.key')
    this.publicKey = readFileSync(options.publicKeyPath)
    this.fingerprintReaders = options.fingerprintReaders
    this.now = options.now ?? Date.now
  }

  public async getStatus(): Promise<LicenseStatus> {
    let machineCode = ''
    try {
      machineCode = licenseMachineCode(await readMachineFingerprint(this.fingerprintReaders))
    } catch {
      return {
        mode: 'read-only',
        state: 'fingerprint-unavailable',
        ...baseStatus(machineCode),
      }
    }

    if (!existsSync(this.activationPath)) {
      return { mode: 'read-only', state: 'unlicensed', ...baseStatus(machineCode) }
    }

    const token = readFileSync(this.activationPath, 'utf8').trim()
    const verification = verifyLicense(token, this.publicKey)
    return this.statusFromVerification(verification, machineCode)
  }

  public async activate(key: string): Promise<LicenseStatus> {
    const machineCode = licenseMachineCode(await readMachineFingerprint(this.fingerprintReaders))
    const verification = verifyLicense(key.trim(), this.publicKey)
    if (!verification.valid) {
      return {
        mode: 'read-only',
        state: 'invalid',
        ...baseStatus(machineCode),
      }
    }
    if (verification.payload.machine !== machineCode) {
      return {
        mode: 'read-only',
        state: 'machine-mismatch',
        ...baseStatus(machineCode),
      }
    }
    if (isExpired(verification.payload, this.now())) {
      return this.statusFromVerification(verification, machineCode)
    }

    const directory = join(this.activationPath, '..')
    const temporaryPath = `${this.activationPath}.tmp`
    mkdirSync(directory, { recursive: true })
    writeFileSync(temporaryPath, key.trim() + '\n', { encoding: 'utf8', mode: 0o600 })
    renameSync(temporaryPath, this.activationPath)
    return this.statusFromVerification(verification, machineCode)
  }

  private statusFromVerification(
    verification: LicenseVerification,
    machineCode: string,
  ): LicenseStatus {
    if (!verification.valid) {
      return { mode: 'read-only', state: 'invalid', ...baseStatus(machineCode) }
    }

    const { payload } = verification
    if (payload.machine !== machineCode) {
      return {
        mode: 'read-only',
        state: 'machine-mismatch',
        ...baseStatus(machineCode),
        kid: payload.kid,
        client: payload.client,
        expiresAt: payload.expiresAt,
      }
    }

    return {
      mode: isExpired(payload, this.now()) ? 'read-only' : 'active',
      state: isExpired(payload, this.now()) ? 'expired' : 'active',
      ...baseStatus(machineCode),
      kid: payload.kid,
      client: payload.client,
      expiresAt: payload.expiresAt,
    }
  }
}

export function isLicenseWriteAllowed(status: LicenseStatus): boolean {
  return status.mode === 'active'
}
