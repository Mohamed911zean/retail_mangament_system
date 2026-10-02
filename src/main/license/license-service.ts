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
  private readonly clockStatePaths: [string, string]
  private readonly publicKey: Buffer
  private readonly fingerprintReaders?: FingerprintSourceReaders
  private readonly now: () => number

  public constructor(options: LicenseServiceOptions) {
    this.activationPath = join(options.userDataPath, 'license', 'activation.key')
    const licenseDirectory = join(options.userDataPath, 'license')
    this.clockStatePaths = [
      join(licenseDirectory, 'last-seen-a'),
      join(licenseDirectory, 'last-seen-b'),
    ]
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

    const clockState = this.checkClock(machineCode)
    if (clockState) {
      return clockState
    }

    if (!existsSync(this.activationPath)) {
      return { mode: 'read-only', state: 'unlicensed', ...baseStatus(machineCode) }
    }

    try {
      const token = readFileSync(this.activationPath, 'utf8').trim()
      const verification = verifyLicense(token, this.publicKey)
      return this.statusFromVerification(verification, machineCode)
    } catch {
      return { mode: 'read-only', state: 'storage-error', ...baseStatus(machineCode) }
    }
  }

  public async activate(key: string): Promise<LicenseStatus> {
    const machineCode = licenseMachineCode(await readMachineFingerprint(this.fingerprintReaders))
    const clockState = this.checkClock(machineCode)
    if (clockState) {
      return clockState
    }
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

  private checkClock(machineCode: string): LicenseStatus | undefined {
    const now = this.now()
    const seen = this.clockStatePaths
      .filter((path) => existsSync(path))
      .map((path) => Number.parseInt(readFileSync(path, 'utf8').trim(), 10))
      .filter((timestamp) => Number.isSafeInteger(timestamp))
    const latestSeen = seen.length > 0 ? Math.max(...seen) : undefined

    if (latestSeen !== undefined && now < latestSeen) {
      return { mode: 'read-only', state: 'clock-rollback', ...baseStatus(machineCode) }
    }

    const directory = join(this.clockStatePaths[0], '..')
    mkdirSync(directory, { recursive: true })
    for (const path of this.clockStatePaths) {
      writeFileSync(path, `${now}\n`, { encoding: 'utf8', mode: 0o600 })
    }
    return undefined
  }
}

export function isLicenseWriteAllowed(status: LicenseStatus): boolean {
  return status.mode === 'active'
}
