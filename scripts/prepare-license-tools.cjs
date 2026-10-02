const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const outputDirectory = join(process.cwd(), 'dist-tools')

mkdirSync(outputDirectory, { recursive: true })
writeFileSync(
  join(outputDirectory, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
  'utf8',
)
