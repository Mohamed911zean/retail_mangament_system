const { copyFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const outputDirectory = join(process.cwd(), 'dist-electron')

mkdirSync(outputDirectory, { recursive: true })
writeFileSync(
  join(outputDirectory, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
  'utf8',
)

const publicKeyPath =
  process.env.LICENSE_PUBLIC_KEY_FILE || 'A:\\web\\LICENSE-KEYS\\demo-2026.public.pem'
if (!existsSync(publicKeyPath)) {
  throw new Error(`Missing LICENSE_PUBLIC_KEY_FILE: ${publicKeyPath}`)
}
const licenseDirectory = join(outputDirectory, 'main', 'license')
mkdirSync(licenseDirectory, { recursive: true })
copyFileSync(publicKeyPath, join(licenseDirectory, 'public-key.pem'))
