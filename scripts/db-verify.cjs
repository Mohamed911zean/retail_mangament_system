const Database = require('better-sqlite3')
const { resolve } = require('node:path')

const databasePath = resolve(process.env.SMALL_ERP_DB || process.argv[2] || '.dev-data/dev.db')
const database = new Database(databasePath, { readonly: true })
try {
  const verifier = require('../dist-electron/main/database/db-verify.js')
  const report = verifier.verifyDatabase(database)
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
} finally {
  database.close()
}
