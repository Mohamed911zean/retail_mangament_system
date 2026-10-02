import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto'

export type LicenseFeature = string

export type LicensePayload = {
  licenseId: string
  kid: string
  client: string
  machine: string
  issuedAt: number
  expiresAt: number
  features: LicenseFeature[]
}

export type LicenseTokenParts = {
  payload: LicensePayload
  encodedPayload: string
  encodedSignature: string
}

export type LicenseVerification =
  | { valid: true; payload: LicensePayload }
  | { valid: false; reason: LicenseVerificationFailure }

export type LicenseVerificationFailure =
  | 'malformed'
  | 'invalid-payload'
  | 'invalid-signature'
  | 'wrong-key-id'

function encodeBase64Url(value: Buffer): string {
  return value.toString('base64url')
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function encodePayload(payload: LicensePayload): string {
  return encodeBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'))
}

function parsePayload(encodedPayload: string): LicensePayload | undefined {
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8'))
    if (!isLicensePayload(parsed)) {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

function isLicensePayload(value: unknown): value is LicensePayload {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const payload = value as Partial<LicensePayload>
  return (
    typeof payload.licenseId === 'string' &&
    typeof payload.kid === 'string' &&
    typeof payload.client === 'string' &&
    typeof payload.machine === 'string' &&
    Number.isSafeInteger(payload.issuedAt) &&
    Number.isSafeInteger(payload.expiresAt) &&
    Array.isArray(payload.features) &&
    payload.features.every((feature) => typeof feature === 'string')
  )
}

function keyObject(key: string | Buffer | KeyObject, isPrivate: boolean): KeyObject {
  if (typeof key === 'object' && !Buffer.isBuffer(key)) {
    return key
  }
  return isPrivate ? createPrivateKey(key) : createPublicKey(key)
}

export function signLicense(payload: LicensePayload, privateKey: string | Buffer | KeyObject): string {
  const encodedPayload = encodePayload(payload)
  const signature = sign(null, Buffer.from(encodedPayload, 'ascii'), keyObject(privateKey, true))
  return `${encodedPayload}.${encodeBase64Url(signature)}`
}

export function verifyLicense(
  token: string,
  publicKey: string | Buffer | KeyObject,
  expectedKid?: string,
): LicenseVerification {
  const [encodedPayload, encodedSignature, extraPart] = token.split('.')
  if (!encodedPayload || !encodedSignature || extraPart !== undefined) {
    return { valid: false, reason: 'malformed' }
  }

  const payload = parsePayload(encodedPayload)
  if (!payload) {
    return { valid: false, reason: 'invalid-payload' }
  }
  if (expectedKid !== undefined && payload.kid !== expectedKid) {
    return { valid: false, reason: 'wrong-key-id' }
  }

  let signature: Buffer
  try {
    signature = decodeBase64Url(encodedSignature)
  } catch {
    return { valid: false, reason: 'invalid-signature' }
  }

  const valid = verify(
    null,
    Buffer.from(encodedPayload, 'ascii'),
    keyObject(publicKey, false),
    signature,
  )
  return valid ? { valid: true, payload } : { valid: false, reason: 'invalid-signature' }
}

export function licenseMachineCode(sourceValues: FingerprintSourceValues): string {
  const normalized = [
    sourceValues.machineGuid,
    sourceValues.volumeSerial,
    sourceValues.cpuId,
  ].map(normalizeFingerprintValue)
  return createHash('sha256').update(normalized.join('|'), 'utf8').digest('hex')
}

function normalizeFingerprintValue(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/gu, ' ')
}

export function matchingFingerprintSources(
  expected: FingerprintSourceValues,
  actual: FingerprintSourceValues,
): number {
  return (['machineGuid', 'volumeSerial', 'cpuId'] as const).filter(
    (source) => normalizeFingerprintValue(expected[source]) === normalizeFingerprintValue(actual[source]),
  ).length
}

export function isFingerprintMatch(
  expected: FingerprintSourceValues,
  actual: FingerprintSourceValues,
): boolean {
  return matchingFingerprintSources(expected, actual) >= 2
}

export type FingerprintSourceValues = {
  machineGuid: string
  volumeSerial: string
  cpuId: string
}
