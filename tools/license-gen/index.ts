import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { signLicense, type LicensePayload } from '../../src/shared/license/license'

type CliOptions = Record<string, string | undefined>

const defaultLedgerPath = resolve('issued-licenses.csv')

function printUsage(): void {
  process.stderr.write(
    [
      'Usage:',
      '  license-gen keygen --output-dir <external-dir> [--kid <key-id>]',
      '  license-gen issue --key-file <private-key.pem> --client <name> --machine <code>',
      '      --expires <ISO-date-or-epoch-ms> [--features <a,b,c>] [--kid <key-id>]',
      '',
      'The private key path must be outside the repository and is never printed.',
      '',
    ].join('\n'),
  )
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {}
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`)
    }
    const name = argument.slice(2)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`)
    }
    options[name] = value
    index += 1
  }
  return options
}

function requiredOption(options: CliOptions, name: string): string {
  const value = options[name]?.trim()
  if (!value) {
    throw new Error(`Missing required option --${name}`)
  }
  return value
}

function parseExpiry(value: string): number {
  const timestamp = /^\d+$/u.test(value) ? Number(value) : Date.parse(value)
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error(`Invalid --expires value: ${value}`)
  }
  return timestamp
}

function csvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function appendIssuedLicense(ledgerPath: string, payload: LicensePayload): void {
  const absoluteLedgerPath = resolve(ledgerPath)
  mkdirSync(dirname(absoluteLedgerPath), { recursive: true })
  if (!existsSync(absoluteLedgerPath)) {
    writeFileSync(
      absoluteLedgerPath,
      'licenseId,client,machineCode,issuedAt,expiresAt\n',
      'utf8',
    )
  }
  appendFileSync(
    absoluteLedgerPath,
    [
      payload.licenseId,
      payload.client,
      payload.machine,
      new Date(payload.issuedAt).toISOString(),
      new Date(payload.expiresAt).toISOString(),
    ]
      .map(csvField)
      .join(',') + '\n',
    'utf8',
  )
}

function generateDemoKeyPair(options: CliOptions): void {
  const outputDirectory = resolve(requiredOption(options, 'output-dir'))
  const kid = options.kid?.trim() || `demo-${new Date().getUTCFullYear()}`
  if (!/^[A-Za-z0-9._-]+$/u.test(kid)) {
    throw new Error('The --kid value may contain only letters, numbers, dot, underscore, and hyphen')
  }

  mkdirSync(outputDirectory, { recursive: true })
  const keys = generateKeyPairSync('ed25519')
  const privateKeyPath = join(outputDirectory, `${kid}.private.pem`)
  const publicKeyPath = join(outputDirectory, `${kid}.public.pem`)
  writeFileSync(
    privateKeyPath,
    keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { encoding: 'utf8', mode: 0o600 },
  )
  writeFileSync(
    publicKeyPath,
    keys.publicKey.export({ type: 'spki', format: 'pem' }),
    { encoding: 'utf8', mode: 0o644 },
  )

  process.stdout.write(
    `Created DEMO key pair.\nKey ID: ${kid}\nPrivate key: ${privateKeyPath}\nPublic key: ${publicKeyPath}\n`,
  )
}

function issueLicense(options: CliOptions): void {
  const keyFile = requiredOption(options, 'key-file')
  const client = requiredOption(options, 'client')
  const machine = requiredOption(options, 'machine')
  const expiresAt = parseExpiry(requiredOption(options, 'expires'))
  const features = (options.features ?? '')
    .split(',')
    .map((feature) => feature.trim())
    .filter((feature) => feature.length > 0)
  const kid = options.kid?.trim() || 'demo'
  const issuedAt = Date.now()
  if (expiresAt <= issuedAt) {
    throw new Error('--expires must be in the future')
  }

  const payload: LicensePayload = {
    licenseId: randomUUID(),
    kid,
    client,
    machine,
    issuedAt,
    expiresAt,
    features,
  }
  const token = signLicense(payload, readFileSync(keyFile))
  const ledgerPath = options.ledger?.trim() || defaultLedgerPath
  appendIssuedLicense(ledgerPath, payload)
  process.stdout.write(`${token}\n`)
}

export function runLicenseGenerator(argv: string[]): void {
  const [command, ...optionArgs] = argv
  if (command !== 'keygen' && command !== 'issue') {
    printUsage()
    throw new Error('Command must be "keygen" or "issue"')
  }

  const options = parseOptions(optionArgs)
  if (command === 'keygen') {
    generateDemoKeyPair(options)
    return
  }
  issueLicense(options)
}

try {
  runLicenseGenerator(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
