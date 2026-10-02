import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { FingerprintSourceValues } from '../../shared/license/license'

const execFileAsync = promisify(execFile)

export type FingerprintSourceReaders = {
  readMachineGuid: () => Promise<string>
  readVolumeSerial: () => Promise<string>
  readCpuId: () => Promise<string>
}

export async function readMachineFingerprint(
  readers: FingerprintSourceReaders = createWindowsFingerprintReaders(),
): Promise<FingerprintSourceValues> {
  const values = {
    machineGuid: await readers.readMachineGuid(),
    volumeSerial: await readers.readVolumeSerial(),
    cpuId: await readers.readCpuId(),
  }

  for (const [source, value] of Object.entries(values)) {
    if (!value.trim()) {
      throw new Error(`Fingerprint source "${source}" returned an empty value`)
    }
  }

  return values
}

export function createWindowsFingerprintReaders(): FingerprintSourceReaders {
  return {
    readMachineGuid: async () => {
      const { stdout } = await execFileAsync('reg', [
        'query',
        'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
        '/v',
        'MachineGuid',
      ])
      return stdout.match(/MachineGuid\s+REG_\w+\s+([^\s]+)/iu)?.[1] ?? ''
    },
    readVolumeSerial: async () => {
      const { stdout } = await execFileAsync('cmd', ['/c', 'vol', 'C:'])
      return stdout.match(/serial number is\s+([A-F0-9-]+)/iu)?.[1] ?? ''
    },
    readCpuId: async () => {
      const { stdout } = await execFileAsync('wmic', ['cpu', 'get', 'ProcessorId', '/value'])
      return stdout.match(/ProcessorId=([^\r\n]+)/iu)?.[1]?.trim() ?? ''
    },
  }
}
