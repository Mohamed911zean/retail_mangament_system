export type LicenseMode = 'active' | 'read-only'

export type LicenseStatus = {
  mode: LicenseMode
  state:
    | 'active'
    | 'unlicensed'
    | 'expired'
    | 'invalid'
    | 'machine-mismatch'
    | 'fingerprint-unavailable'
    | 'clock-rollback'
    | 'storage-error'
  machineCode: string
  machineChecksum: string
  kid?: string
  client?: string
  expiresAt?: number
}

export type LicenseApi = {
  getLicenseStatus: () => Promise<LicenseStatus>
  activateLicense: (key: string) => Promise<LicenseStatus>
}
