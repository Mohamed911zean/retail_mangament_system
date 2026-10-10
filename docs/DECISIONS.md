# Decision Log

## Project scope

- Product: 100% offline desktop POS and shop operations app for small shops in Egypt.
- Platform: Windows 10 only; Windows 7 is not supported.
- Initial client overlay: `frozen-food`.
- Phase 0 is the current phase. No production feature work starts until the walking skeleton passes.
- Requested Phase 0 sequence:
  1. Electron + Vite + React + TypeScript scaffold.
  2. SQLite with plain SQL migrations and automatic pre-migration backup.
  3. Transactional fake sale and rollback test.
  4. Arabic RTL silent printing and printer picker.
  5. Online-backup API backup and restore.
  6. Ed25519 license demo and external key-generation tool.
  7. NSIS installer and portable executable.

## Step 1 — Electron + Vite + React + TypeScript scaffold

### Decisions

- Electron: `44.5.1`, pinned exactly without a caret.
- Renderer: React + TypeScript + Vite.
- Vite build target: `chrome134`, matching Electron 44's Chromium 134 line.
- Database/query, printing, backup, licensing, and packaging are intentionally not implemented in this step.
- Renderer security defaults: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Renderer navigation is local-only and requests to remote origins are blocked by the main process.
- A strict renderer CSP blocks remote scripts, styles, fonts, connections, objects, forms, and frames.

### Implemented

- Electron main process and preload entry points in `src/main/`.
- Secure BrowserWindow configuration.
- Local renderer loading for packaged builds.
- Arabic RTL starter shell with UI text in `src/renderer/i18n/ar.json`.
- Phase documentation structure under `docs/`.
- `private/` is ignored for future license key material.

### Verification

- `npm view electron version` returned `44.5.1` on 2026-10-02.
- `npm install --save-dev electron@44.5.1` completed successfully with no reported vulnerabilities.
- `npm run build` passed: Vite produced `dist/` and TypeScript produced `dist-electron/`.
- `npm run lint` passed.
- `npx electron --version` returned `v44.5.1`, confirming the native Electron binary is available.
- Full GUI launch and packaged-app execution: not tested in this environment.
- Real Windows 10 installer validation: not performed in Step 1.
- `better-sqlite3` compatibility: not tested in Step 1; required in Step 2.
- Printer, database, backup, license, NSIS, and portable output: not tested in Step 1.

## Packaging configuration — completed before Step 2

### Decisions

- Packaging tool: `electron-builder 26.15.3`, pinned exactly without a caret.
- Windows architecture produced: `x64`.
- Output directory: `release/`.
- NSIS installer is configured as a non-one-click installer with an optional installation directory.
- Electron Builder uses the locally installed Electron distribution through `electronDist: node_modules/electron/dist`.
- Electron Builder uses the verified N-API native prebuild with `npmRebuild: false`; source rebuilding remains a separate developer-machine prerequisite.

### Commands

```powershell
npm run package:win:dir
npm run package:win:nsis
```

### Verification

- `npm run package:win:dir` passed.
- `npm run package:win:nsis` passed.
- Unpacked executable: `A:\web\SMALL_ERP\small_erp\release\win-unpacked\small-shop-pos.exe`.
- NSIS installer: `A:\web\SMALL_ERP\small_erp\release\Small Shop POS-Setup-0.1.0-x64.exe`.
- NSIS block map: `A:\web\SMALL_ERP\small_erp\release\Small Shop POS-Setup-0.1.0-x64.exe.blockmap`.
- The generated executable and installer are unsigned/default-icon development artifacts; production signing and custom branding were not part of this packaging check.
- Real Windows 10 installation and launch validation remains pending.

## Electron runtime module fix — completed before Step 2

### Decisions

- Electron main-process and preload TypeScript compile with `module: commonjs` and `moduleResolution: node`.
- `dist-electron/package.json` is generated with `{ "type": "commonjs" }`, overriding the root package's ESM mode.
- The Electron entry remains `dist-electron/main.js`; its CommonJS `__dirname` resolves the preload at `dist-electron/preload.js` and the renderer at `dist/index.html`.
- The sandboxed preload remains CommonJS and exposes the API as `window.api`.
- BrowserWindow security settings remain unchanged: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Main-process startup, window creation, renderer load failure, and renderer-process exit errors are appended to `userData/logs/main.log` and shown with `dialog.showErrorBox`.

### Verification

- `npm run build` passed after the CommonJS change.
- `npm run package:win:dir` passed after the CommonJS and relative-asset fixes.
- Development launch: `npx electron . --remote-debugging-port=9222` opened the Arabic RTL screen.
- Development DevTools/CDP evaluation: `typeof window.api` returned `"object"`.
- Packaged launch: `release\win-unpacked\small-shop-pos.exe --remote-debugging-port=9223` opened the Arabic RTL screen.
- Packaged DevTools/CDP evaluation: `typeof window.api` returned `"object"`.
- Screenshots were captured for both successful launches in the session workspace.
- A plain `npx electron .` launch was also started successfully and remained running.
- The plain packaged executable launch was not independently run by this tool call; the user confirmed that the packaged app worked.
- No `userData/logs/main.log` was created during successful launches, indicating no startup or renderer failure was logged.

## Phase 0 Step 2 — SQLite and plain SQL migration runner

### Decisions

- SQLite driver: `better-sqlite3 13.0.3`, pinned exactly.
- Query and migrations: plain SQL; no ORM.
- Electron native compatibility: the installed `better-sqlite3` prebuild loaded successfully inside Electron 44.5.1 and executed an in-memory query. A source rebuild through `@electron/rebuild 4.2.0` was attempted but could not run because Visual Studio was not installed in this environment.
- Database location: `<userData>/database/small-shop-pos.sqlite`.
- Backup location: `<userData>/backups/`.
- Migrations are bundled under `migrations/` and tracked in `schema_migrations`.
- Before pending migrations on an existing database, the runner creates a timestamped online backup with `better-sqlite3.backup()`. First-run database creation has no pre-existing file to back up.
- SQLite pragmas: WAL, `synchronous = FULL`, and foreign keys enabled; `quick_check` runs before and after migrations.

### Implemented

- `src/main/database/database.ts` opens/configures SQLite, runs ordered SQL migrations in transactions, and closes the database safely.
- `migrations/0001_phase0_metadata.sql` is a technical smoke migration only; no real business feature is implemented.
- Electron startup opens the database before creating the window.
- `migrations/` is included in electron-builder application files.

### Verification

- `npm install better-sqlite3@13.0.3 --save` completed with no reported vulnerabilities.
- `npm install --save-dev @electron/rebuild@4.2.0` completed with no reported vulnerabilities.
- `npx electron-rebuild -f -w better-sqlite3 -v 44.5.1` was attempted and was blocked because Visual Studio is not installed.
- `npx electron` loaded the installed `better-sqlite3` N-API prebuild and successfully executed an in-memory SQLite query.
- `npm run build` passed, including the compiled database runner.
- An isolated temporary-database verification passed: first-run migration applied without creating a backup; a second pending migration created exactly one pre-migration `.sqlite` backup through the online backup API.
- `npm run lint` passed.
- `npx electron . --remote-debugging-port=9224` started successfully and created `C:\Users\elkon\AppData\Roaming\small_erp\database\small-shop-pos.sqlite`.
- The live database also produced SQLite WAL sidecar files, confirming the configured WAL mode.
- Packaged startup database creation: not verified in this step.
- Fake sale, rollback test, printing, restore UI, licensing, and installer work remain out of scope for this step.

## Phase 0 Step 3 — Transactional fake sale and rollback test

### Decisions

- Test framework: `vitest 5.0.3`, pinned exactly.
- The fake sale uses only technical Phase 0 tables: `sales`, `sale_items`, and `stock_movements`.
- The three-table write is one `better-sqlite3` transaction.
- Failure injection is explicit and test-only; it can fail after the sale, after an item, or after a stock movement.
- No POS, pricing, inventory, payment, or other real business feature is implemented.

### Implemented

- `src/main/sales/fake-sale.ts` provides the atomic fake-sale write.
- `migrations/0002_phase0_fake_sale.sql` creates the three smoke-test tables.
- `src/main/sales/fake-sale.test.ts` verifies both successful persistence and complete rollback.
- Error artifacts are organized under `errors/phase-0/step-<number>/`.
- `docs/design_system/` is preserved as the authoritative future UI reference; no UI implementation was added.

### Verification

- `npm install --save-dev vitest@5.0.3` completed with no reported vulnerabilities.
- `npm test` passed: 1 test file and 4 tests passed, including success and three injected rollback points.
- `npm run build` passed.
- `npm run lint` passed.
- `npx electron . --remote-debugging-port=9225` started successfully and applied migration `0002_phase0_fake_sale`.
- The live database contains `sales`, `sale_items`, and `stock_movements`; `schema_migrations` contains both Phase 0 migrations.
- No UI, printing, backup/restore UI, licensing, or real POS feature was added.

## Phase 0 Step 4 — Arabic RTL receipt printing and printer picker

### Decisions

- Printing uses Electron’s Windows-driver API: `webContents.print({ silent: true, deviceName })`.
- Receipt output is generated as local HTML in a hidden `BrowserWindow`; no raw ESC/POS is used.
- The receipt is RTL Arabic, monochrome-safe, uses local system font fallback, and isolates invoice numbers and money with `<bdi>`.
- Renderer access is typed through `src/shared/printing.ts` and the sandboxed preload API.
- Printer names are selected explicitly; no arbitrary URLs or remote resources are used.

### Implemented

- `src/main/printing/receipt-template.ts` generates the test receipt HTML.
- `src/main/printing/printing.ts` enumerates installed printers and performs silent test printing.
- IPC handlers: `printing:list-printers` and `printing:print-test-receipt`.
- The Phase 0 shell now has a minimal Arabic printer picker and test-print control.
- `src/main/printing/printing.test.ts` verifies RTL markup, HTML escaping, money formatting, and no remote URLs.
- `vitest.config.ts` limits tests to source files and prevents compiled Electron tests from being rediscovered.

### Verification

- `npm test` passed: 2 files and 5 tests.
- `npm run build` passed.
- `npm run lint` passed.
- Live Electron renderer-to-main enumeration returned five Windows printers:
  `OneNote for Windows 10`, `OneNote (Desktop)`, `Microsoft XPS Document Writer`,
  `Microsoft Print to PDF`, and `Fax`.
- The Arabic RTL picker screen was captured at
  `errors/phase-0/step-4/` session evidence.
- Generated receipt path:
  `%APPDATA%\small_erp\print-cache\test-receipt.html`.
- Silent driver completion was not fully verifiable in this environment: the
  “Microsoft Print to PDF” driver returned `success: false`; the receipt
  template was generated. The IPC handler now logs the failure to
  `%APPDATA%\small_erp\logs\main.log`.
- `npm run package:win:dir` initially failed when electron-builder tried to
  rebuild `better-sqlite3` without Visual Studio; `npmRebuild: false` was added
  after verifying the N-API prebuild inside Electron.
- After `npmRebuild: false`, `npm run package:win:dir` passed for Electron
  44.5.1 x64.
- The packaged executable opened successfully and its renderer-to-main printer
  enumeration returned five printers.
- Physical thermal-printer and A4 output on the target Windows 10 machine remain pending.

## Phase 0 Step 5 — Online backup and restore

### Decisions

- Backup and restore use `better-sqlite3`'s online `.backup()` API; live database
  files are not copied directly while open.
- Manual backups are stored under `<userData>/backups/` with timestamped
  `manual-*.sqlite` names.
- Restore validates that the selected file is an existing SQLite backup inside
  the configured backup directory.
- Before restore, the current live database receives a
  `pre-restore-*.sqlite` online safety backup.
- The selected snapshot is backed up online into a temporary file, the live
  connection is closed, WAL sidecars are removed, and the temporary database
  replaces the live database. The restored database is reopened and checked.
- A failed replacement or validation retains the safety backup and returns an
  explicit error.

### Implemented

- `createDatabaseBackup`, `listDatabaseBackups`, and `restoreDatabaseBackup`
  in `src/main/database/database.ts`.
- Typed backup IPC in `src/shared/backup.ts` and the sandboxed preload.
- Arabic Phase 0 backup/restore demo controls in the renderer.
- `src/main/database/backup.test.ts` verifies online backup, restore, and
  pre-restore safety backup behavior.

### Verification

- `npm test` passed: 3 files and 6 tests.
- `npm run build` passed.
- `npm run lint` passed.
- Clean Electron launch loaded the Arabic backup panel and exposed
  `typeof window.api === "object"`.
- Live `window.api.createBackup()` returned:
  `manual-2026-10-02T05-17-38-832Z.sqlite`, size `45056` bytes.
- Live `window.api.listBackups()` returned the new backup and existing
  pre-migration backup.
- Live restore of the new manual backup passed and created:
  `pre-restore-2026-10-02T05-17-54-783Z.sqlite`, size `45056` bytes.
- Restore UI and online backup behavior were not tested on a real weak Windows
  10 machine yet.

## Phase 0 Step 6(a) — Shared license foundation

### Decisions

- License tokens use an offline Ed25519 signature over a base64url-encoded JSON
  payload and signature.
- The payload includes `licenseId`, `kid`, `client`, machine code,
  `issuedAt`, `expiresAt`, and feature identifiers. The `kid` is checked
  separately so public keys can be rotated later.
- The machine fingerprint has three injectable source readers:
  Windows `MachineGuid`, system-volume serial, and CPU ID. A license matches
  when at least two normalized sources agree.
- The shared implementation lives in `src/shared/license/` rather than a
  separately published package because the app is a single offline desktop
  bundle. The Windows readers remain in `src/main/license/` and are not
  renderer dependencies.
- Empty fingerprint values are rejected explicitly; there is no silent fallback
  to a weaker machine identity.
- No private or public key files are created in this sub-step. Private keys
  will remain outside the repository under `A:\web\LICENSE-KEYS` when the
  generator is implemented.

### Implemented

- `src/shared/license/license.ts`: payload validation, Ed25519 sign/verify,
  key-id validation, machine-code hashing, and 2-of-3 matching.
- `src/main/license/fingerprint.ts`: injectable readers for the three Windows
  fingerprint sources with explicit empty-value errors.
- `src/shared/license/license.test.ts`: signing, tampering, key-id,
  injectable-reader, source-change, and empty-source tests.

### Verification

- `npm test` passed: 4 files and 11 tests.
- `npm run build` passed.
- `npm run lint` passed.
- Actual Windows registry, volume, and WMIC outputs were not available for a
  live fingerprint check in this environment; injectable-reader coverage was
  verified instead.
- License CLI, app activation UI, persistence, expiry/read-only mode, clock
  rollback checks, and Electron Fuses are intentionally not implemented yet.

## Phase 0 Step 6(b) — External license generator

### Decisions

- The developer-only generator is TypeScript under `tools/license-gen/` and
  compiles separately to `dist-tools/`; it is not included in the Electron
  builder file list.
- `keygen` writes a DEMO Ed25519 PKCS#8 private key and SPKI public key to an
  explicitly supplied external directory. The intended location is
  `A:\web\LICENSE-KEYS`.
- `issue` requires `--key-file`, `--client`, `--machine`, and `--expires`.
  Features are supplied as a comma-separated `--features` value. `--kid` is
  optional and defaults to `demo`.
- The activation token is printed to stdout. The private key contents are
  never printed, copied into the repository, or included in application
  packaging.
- Issuance metadata is appended to the repository-local
  `issued-licenses.csv`, which is git-ignored. The path can be overridden for
  controlled tests with `--ledger`.

### Implemented

- `tools/license-gen/index.ts` with `keygen` and `issue` commands.
- `tsconfig.tools.json` and a CommonJS preparation script.
- `npm run license:gen -- ...` command.
- Git-ignored `issued-licenses.csv`.

## Phase 0 Step 6(c) — App license service and activation screen

### Decisions

- The app-side license service is isolated in
  `src/main/license/license-service.ts`. It exposes status and activation
  through typed IPC only; the renderer never reads the activation file or
  public-key file directly.
- The public key is copied into `dist-electron/main/license/public-key.pem`
  during the Electron build from `LICENSE_PUBLIC_KEY_FILE`, defaulting in this
  developer environment to `A:\web\LICENSE-KEYS\demo-2026.public.pem`.
- The activation token is stored under `<userData>/license/activation.key`
  with restrictive file permissions and an atomic temporary-file replacement.
- License status is checked at startup, every 60 seconds, and again before
  backup creation/restoration. Expired, missing, invalid, mismatched, or
  unreadable licenses put the app in read-only mode.
- Read-only mode does not delete or hide database data. The demo UI disables
  backup writes/restoration while retaining data visibility and the activation
  screen.
- The UI displays the machine code, an 8-character checksum, copy control,
  activation input, client, expiry, and `kid`, with all text in Arabic i18n.

### Implemented

- `src/shared/license/api.ts` and typed preload IPC methods.
- `src/main/license/license-service.ts`.
- Build-time public-key embedding in `scripts/prepare-electron.cjs`.
- Arabic activation/status UI and read-only controls in `src/App.tsx`.
- Service tests for unlicensed state, persisted activation, and expiry.

### Verification

- `npm test` passed: 5 files and 13 tests.
- `npm run build` passed.
- `npm run lint` passed.
- External public key was embedded at
  `dist-electron/main/license/public-key.pem`.
- No private key was copied into `dist-tools`, Electron output, or package
  contents.
- A live Electron process launched without a new startup error; a visible
  window title was not independently captured in that diagnostic launch.
- Full wrong-machine, tampered-key, missing-file, and clock-rollback coverage
  remains Step 6(d).

## Phase 0 Step 6(d) — License edge-case tests and clock rollback

### Implemented

- Wrong-machine activation returns read-only mode.
- Tampered activation tokens are rejected and are not persisted.
- Missing activation files produce an explicit unlicensed/read-only status.
- Expired licenses produce read-only mode without deleting data.
- Last-seen timestamps are stored in two separate files under the license
  directory. A current time earlier than either recorded timestamp produces a
  clock-rollback status.
- Existing shared tests cover one changed fingerprint source (2-of-3 matching),
  two changed sources, malformed/tampered payloads, and unexpected `kid`.

### Verification

- `npm test` passed: 5 files and 17 tests.
- The clock rollback test verified both timestamp files contain the same last
  seen value before moving the test clock backwards.
- No network or online license validation was added.

## Phase 0 Step 6(e) — Electron Fuses

### Decisions

- `@electron/fuses 1.8.0` is used with Electron `44.5.1`.
- The electron-builder `afterPack` hook flips these Windows executable fuses:
  `RunAsNode=false`, cookie encryption enabled,
  `EnableNodeOptionsEnvironmentVariable=false`,
  `EnableNodeCliInspectArguments=false`, and `OnlyLoadAppFromAsar=true`.

### Verification

- `npx @electron/fuses read --app <unpacked-exe>` confirmed:
  `RunAsNode` disabled, cookie encryption enabled, `NODE_OPTIONS` disabled,
  CLI inspect arguments disabled, and ASAR-only loading enabled.
- The packaged executable opened with the Arabic title `نقطة البيع`.

## Phase 0 Step 7 — NSIS, unpacked, and portable x64 packaging

### Decisions

- Electron Builder remains pinned to `26.15.3`; Electron remains pinned to
  `44.5.1`.
- Added `package:win:portable` using Electron Builder's `portable` target.
- Packaging uses the local Electron distribution and keeps native rebuild
  disabled because the verified N-API prebuild works in this environment.

### Commands

```powershell
npm run package:win:dir
npm run package:win:nsis
npm run package:win:portable
```

### Verification

- Fresh combined packaging completed successfully in
  `A:\web\SMALL_ERP\small_erp\release-phase0`.
- Unpacked executable:
  `A:\web\SMALL_ERP\small_erp\release-phase0\win-unpacked\small-shop-pos.exe`
- NSIS installer:
  `A:\web\SMALL_ERP\small_erp\release-phase0\Small Shop POS-Setup-0.1.0-x64.exe`
- Portable executable:
  `A:\web\SMALL_ERP\small_erp\release-phase0\Small Shop POS 0.1.0.exe`
- The unpacked executable was launched and displayed `نقطة البيع`.
- Portable packaging completed; a separate portable GUI title capture was not
  reliable because multiple diagnostic Electron processes were already active.
- Real weak Windows 10 hardware, physical receipt printing, and 32-bit
  Windows 10 remain unverified.

## Decision #1 — Final cumulative returns and weighted valuation corrections

**Date:** 2026-10-02  
**Status:** Accepted schema correction; schema v1.0 remains frozen.

The cumulative return allocation example is fixed to 1001 piasters over three
units returned one at a time: refunds are `334`, `333`, and `334`, with
cumulative targets `334`, `667`, and `1001`.

Outgoing stock valuation uses the weighted-average rule for sales, damage,
negative count differences, and negative adjustments. Removing all on-hand
quantity removes exactly the on-hand value. Positive count differences and
positive adjustments use the current weighted-average unit cost when available,
otherwise the product default cost.

Negative-stock settlement uses `costVariancePiasters =
-revaluationPiasters`. Revaluation rows are product-level, have no batch, and
must have zero quantity. The schema now explicitly guards these rules.

Returns do not refund a sale's cash rounding adjustment; they refund only the
persisted final line total. Voiding a purchase also reverses any revaluation it
caused through `reverses_movement_id`.

## Decision #2 — Cash rounding midpoint and positive minimum

**Date:** 2026-10-03
**Status:** Accepted for the domain implementation.

Cash rounding uses half-up rounding to the configured piaster step. A positive
total that rounds to zero is rounded to one full step instead; only a zero
total may remain zero.

## Decision #3 — Batch A domain contract corrections

**Date:** 2026-10-03
**Status:** Accepted for the pure domain implementation.

Where the earlier schema contract used broader placeholder signatures, Batch A
uses the concrete prompt contracts: payment allocation receives tenders and a
customer-presence flag; negative-stock settlement receives incoming quantity
and incoming movement value; FEFO receives `allowExpired`; return, shift, void,
and report functions expose the exact Result payloads covered by their
colocated tests. Proportional allocation uses stable input-index ties without
a caller tie-break parameter. These contracts take precedence over earlier
documentation wording and remain pure, integer-only domain operations.

## Decision #4 — Stock ledger normalization and zero-value costing

**Date:** 2026-10-03
**Status:** Accepted for the inventory domain and upcoming services.

The stock ledger maintains these invariants after every operation:

- `qty == 0` implies `value == 0`.
- `qty > 0` implies `value >= 0`.

When `onHandQty > 0`, zero on-hand value is a valid zero weighted-average
cost. Outgoing and incoming average valuation therefore use the current
on-hand value even when it is zero; only a negative value with positive
quantity is a `ledger_invariant_violation`.

`calculateNegativeStockSettlement` is applied to every incoming movement that
moves quantity from negative to zero or positive, including purchases,
positive count/adjustment movements, and resalable return restocks. It receives
that movement's own value as `incomingValue`. After every stock movement,
including void compensations, the service applies
`calculateStockNormalization` as the final safety net. Normalization emits a
product-level revaluation with zero quantity: `(qty == 0 && value != 0)` or
`(qty > 0 && value < 0)` is corrected by `-value`; all other states emit zero.
Revaluation rows always have `qty_delta = 0`.

Batch C services must run settlement and normalization inside the same
transaction after every stock movement.

## Decision #6 - Batch C0 hardening

**Date:** 2026-10-03  
**Status:** Accepted for the database boundary.

- Migration `0008_phase1c_hardening.sql` adds only triggers and indexes; no
  applied migration is edited and no table is rebuilt.
- Void state is final. A void transition requires timestamp, actor, and
  reason metadata. Expenses and stock counts use guarded updates; posted or
  voided count items are immutable.
- Payment-status consistency is enforced at insert time for sales and
  purchases.
- Repositories remain synchronous because `better-sqlite3` is synchronous;
  services will expose async methods and perform one synchronous transaction
  internally. `runInTransaction` rejects thenables immediately.
- Sequence allocation receives an injected `now` value; repositories do not
  read the system clock.
- New indexes: `sales.user_id`, `sales.created_at`, `money_ledger.sale_id`,
  `money_ledger.occurred_at`, `shifts.user_id`, `held_sales.shift_id`,
  `held_sales.customer_id`, `stock_movements(reference_type,reference_id)`,
  and `stock_movements.occurred_at`. These support actor, document,
  reconciliation, shift, held-cart, and chronological ledger lookups.
- Verifier messages expose stable `messageKey` values under `errors.<code>`.
  Customer and supplier balances remain derived because the frozen schema has
  no stored balance columns; `getBalances()` returns domain-calculated,
  safe-integer snapshots.

## Decision #5 - Batch B database implementation

**Date:** 2026-10-04  
**Status:** Accepted for the database layer.

- Bundled SQLite is 3.53.4, above the STRICT-table minimum of 3.37.
- The incompatible Phase 0 smoke tables are dropped by migration `0003` and
  replaced by the frozen Phase 1 schema. This is a deliberate migration
  compatibility boundary, not a silent table redesign.
- The frozen schema has no stored customer or supplier balance columns.
  `db:verify` therefore validates the ledger inputs through the pure balance
  functions but cannot compare a derived balance to stored data.
- The verifier uses stable codes documented in `docs/database.md`.
- Repositories use prepared statements, typed constraint errors, one shared
  row mapper, and a transaction handle supplied by services. They do not open
  transactions themselves.
- Foreign-key and aggregate lookup indexes in the migration files are
  documented operational indexes; partial unique indexes enforce active SKU,
  normalized barcode, one open shift per device, and one reversal per source.
- `db:reset` is intentionally limited to `.dev-data/dev.db`; production or
  arbitrary paths are refused.
- Migration backups use the online backup API. `PRAGMA foreign_keys` must be
  configured before a migration transaction because SQLite does not change it
  inside a transaction.

### Contradictions and deferred items

- The schema introduction says common columns are exact for every table, while
  append-only `audit_log` and sequence tables have their own documented
  column sets. The implementation follows each table's explicit definition.
- The schema document's historical “no migrations or repositories” status text
  predates Batch B and is no longer descriptive; the database documentation is
  the current implementation guide.
- Stored per-product on-hand columns, stored customer balances, and stored
  supplier balances do not exist in the frozen schema, so verification
  recomputes them from ledgers rather than inventing columns.
- Full repository service orchestration remains deferred to Batch C.

## Decision #7 - Void compensations run through the stock engine

**Date:** 2026-10-09  
**Status:** Accepted; extends Decision #4.

- Decision #4 requires settlement and normalization after **every** stock
  movement, including void compensations. Batch C originally wrote
  `void_compensation` rows with raw inserts, so a purchase void that drained
  stock to zero left the negated value behind (`qty == 0` with `value != 0`),
  violating invariant I1.
- New engine function `applyCompensationMovement` is now the only writer of
  `void_compensation` rows. It keeps the exact negated qty/value from
  `calculateVoidCompensation` (never re-values at the current average), skips
  the negative-stock refusal (the void domain already validated legality),
  applies `calculateNegativeStockSettlement` when an incoming compensation
  lifts stock out of negative, and always finishes with
  `calculateStockNormalization`.
- Compensation rows keep `reverses_movement_id`, so the verifier's
  `reversal_sign` check still requires the exact inversion of the original.

## Decision #8 - Customer receipts and supplier payments

**Date:** 2026-10-09  
**Status:** Accepted for the v1 treasury scope.

- Account-level receipts/payments are single `money_ledger` rows:
  `customer_receipt`/`in` and `supplier_payment`/`out`, methods
  `cash`/`card`/`wallet`. Cash rows take the current open shift's id when
  shifts are enabled (refused with `invalid_shift_state` otherwise); card and
  wallet rows carry no shift id because only cash affects drawer expectation.
- A reversal is a compensating row with the **same entry type** and the
  opposite direction, linked by `reverses_entry_id`, gated on `document.void`.
  The frozen schema derives balances by summing those entry types ("the net
  receipt total is recomputed from the ledger"), so the reversal is included
  automatically; no balance column is ever written. Using the original entry
  type (rather than `void_compensation`) is what keeps the frozen balance
  queries correct without changing `db:verify`. Reversals are once-only,
  enforced by `ux_money_ledger_reversal` and a friendly
  `reversal_already_exists` code.
- `repositories/balances.ts` is the single SQL source for derived balances; the
  sale credit-limit check and the operator-facing balance read share it, so they
  cannot disagree.
- The sale service now enforces a positive `credit_limit_piasters` against the
  receipt-aware balance (`credit_limit_exceeded`), with an audited
  owner/manager `sale.credit_override`. This closes a Batch C gap against the
  frozen schema ("a positive limit is enforced by the sale service").

## Decision #9 - Verifier compensation-rule loosening (recorded)

**Date:** 2026-10-09  
**Status:** Accepted; documented for review.

- `document_stock_mismatch` / `purchase_stock_mismatch` sum only the document's
  own movement types (`sale`, `purchase`) so a valid `void_compensation` row
  carrying the document's reference does not break the equality.
- `reversal_metadata_mismatch` accepts `entry_type = 'void_compensation'` for a
  reversal while still requiring `payment_method`, `customer_id`, and
  `supplier_id` to match the original.
- Corruption proofs in `db-verify.test.ts` show both rules still fire when a
  document's own totals are wrong or a reversal's metadata/amount does not
  match, so detection strength is unchanged.

## Decision #10 - Typed IPC layer (renderer ⇄ main contract)

**Date:** 2026-10-09  
**Status:** Accepted; the UI is built on top of it.

- **One contract file:** `src/shared/ipc.ts` holds the channel list, every
  payload/DTO type and the `IpcApi` shape the preload exposes. The renderer
  imports nothing from `src/main`, and the main process imports nothing from
  `src/renderer`.
- **The main process never rejects a channel.** Every handler resolves to
  `IpcResult<T> = { ok: true, value } | { ok: false, error }`. Electron's
  rejection path serializes the error and drops custom properties, which would
  destroy the stable `code` and the Arabic `messageKey`; resolving keeps them
  intact and keeps the window alive (AGENTS.md §3 rule 7).
- **The actor is derived in main.** `SessionStore` holds the logged-in
  `PublicUser`; `runOperation` builds the `Actor` from it. The renderer can
  never send a user id or a role, so permissions cannot be spoofed.
- **Read-only licence mode blocks writes centrally:** every channel marked
  `mutating` is refused with `read_only_mode` before the service runs.
  `auth:setup` is deliberately *not* mutating: a brand-new, still-unlicensed
  device must be able to create its first owner, and the service refuses a
  second call with `setup_already_completed`. `auth:login` is also not mutating
  even though it stamps `last_login_at` — that is an audit detail, not shop
  data, and a read-only app still has to be reachable.
- **Electron stays out of the logic:** `ipc/platform.ts` describes everything
  the IPC layer needs from the shell (printers, backups, licence, version).
  `operations.ts` therefore runs under Vitest with a fake platform, and
  `register.ts` is the only file that touches `electron`.
- **Services are built per call, not cached** (`ipc/services.ts`). Feature flags
  (`allow_negative_stock`, `shifts`) are then always current, a database restore
  can swap the connection without a stale handle, and no global state survives
  between operations (also required for a possible future LAN mode).
- **Validation is hand-rolled and dependency-free** (`ipc/validate.ts`). Money is
  validated as safe integer piasters and ids against a strict pattern, so a bad
  value cannot reach SQL. Every failure carries the offending `field`, which the
  UI uses to highlight the input.
- **Arabic errors are enforced by a test:** `ipc/error-messages.test.ts` walks
  the main-process sources and fails when a raised error code has no message in
  `src/renderer/i18n/ar.json` / `src/main/services/messages-ar.ts`.
- **Shared shapes moved to `src/shared/`** (row DTOs, `Settings`, permissions,
  `PublicUser`) and are re-exported by the main process, so there is exactly one
  definition of each and main/renderer cannot drift.
- **Deferred on purpose:** the purchase, return, void and stock-count IPC
  surfaces are added together with their screens in Phase 2, so the contract
  does not carry untested channels.


## Decision #11 - UI foundation (tokens, component kit, shell, login)

**Date:** 2026-10-09  
**Status:** Accepted; the POS screen is built on top of it.  
**Details:** `docs/ui.md`.

- **Tailwind CSS v4 with tokens as CSS variables** (`src/renderer/styles/tokens.css`).
  Tokens are the single source of truth: a component writes `bg-brand-700`, never
  `#02534B` and never a raw px. Client overlays may override `--brand-*` only,
  so a rebrand cannot break a contrast pair.
- **Tailwind's own namespace variables are overridden, not duplicated.** Radius,
  shadow and spacing utilities read `--radius-*`, `--shadow-*` and `--spacing`,
  so the `@theme` block only aliases colours, the font stack and the type scale.
  Mapping those three namespaces in `@theme` as well would mean two definitions
  of the same value, which is exactly the drift the token file exists to prevent.
- **No UI library.** Dialog, Toast, Table and the form controls are ~60 lines
  each, hand-written. MUI/Ant-sized kits are banned by the design system (§4.2)
  and a headless kit would still be a runtime dependency on a 2 GB-RAM target;
  the only behaviour we need is a focus trap, `Esc` and a live region.
- **Primitives are presentational and integer-in/integer-out.** They know nothing
  about the domain, the IPC contract or Arabic business vocabulary: money arrives
  and leaves as piasters, quantity as the smallest unit. All UI text comes from
  `src/renderer/i18n/ar.json` through the `messages`/`translate` helpers, so no
  screen can invent wording and an error code from main becomes a sentence here.
- **`MoneyInput` / `QtyInput` own their text, not their value.** Reformatting on
  every keystroke moves the caret and eats digits on a POS keyboard, so the field
  keeps what was typed, emits an integer when the text parses, and re-renders the
  canonical `12.50` on blur. An unparseable or over-precise value is *rejected*,
  never rounded — silently turning `12.505` into `12.50` loses someone's money.
- **Navigation is a `useState`, not a router.** One window, one user, no URL to
  restore; a router would be a dependency for nothing. The page list is data
  (`app/navigation.ts`), so the sidebar and the page switch cannot disagree.
- **UI-only preferences live in `localStorage`; business settings live in the DB.**
  Lite mode and the digit style change no money, stock or document, so they must
  not cost a migration and a backup. `parsePreferences` is pure and tested, so a
  corrupted store cannot stop the app booting.
- **Page visibility uses roles, not permission codes.** The permission model is
  action-level (`sale.zero_price`, `document.void`, …); there is no `settings.manage`
  yet. The renderer only *hides* the item — the main process re-checks every
  operation, so this is a convenience, not a defence.
- **The Phase-0 demo screens were ported, not deleted:** printing, backup/restore
  and licence activation now live in Settings as real sections, so nothing that
  was verified in Phase 0 became unreachable.
- **Open item:** the Cairo woff2 files (`src/renderer/assets/fonts/cairo-{400,600,700}.woff2`)
  are not in the repo yet. Until they are, the app renders with the documented
  fallback (`Segoe UI`, `Tahoma`) — the stack is already the token's fallback, so
  adding the files needs no code change. The fonts are imported by `fonts.css`
  (not referenced from `public/`) so Vite fingerprints them and rewrites the URL
  relative to the CSS: that is what makes them load over `file://` in the
  packaged app. `public/fonts/OFL.txt` ships the licence with the installer.

## Decision #12 - The POS screen

**Date:** 2026-10-10  
**Status:** Accepted; first real business screen.  
**Details:** `docs/ui.md` ("The selling screen").

- **The screen reuses `src/domain` for its totals instead of recomputing them.**
  `pages/pos/cart.ts` builds `LineInput[]` and calls the same
  `calculateLineAmounts` / `calculateSaleTotals` the sale service calls. A screen
  with its own arithmetic would eventually print a different number from the one
  it displayed, and a shop that sees that stops trusting both. The cost is that
  the renderer bundle now contains `src/domain` — cheap (pure functions, no
  imports) and the whole point of keeping `domain/` free of DB/Electron/React.
- **One stateful file.** `PosPage.tsx` owns the cart, the customer and which
  dialog is open, and is the only POS file that calls IPC. Everything below it is
  presentational and integer-in/integer-out, so the risky part (money, quantity,
  discount shapes) lives in three pure modules with unit tests
  (`cart.ts`, `payment.ts`, `search.ts`) instead of in JSX.
- **Two discount vocabularies, one translation point.** IPC uses
  `{kind:'percent', basisPoints}`; `src/domain/discount.ts` uses
  `{kind:'percentage', rateBps}`. The cart holds the IPC shape (it is what gets
  sent) and `toDomainDiscount` inside `cart.ts` is the only place the two meet —
  the same role `parseSaleInput`'s translation plays in the main process.
- **A completed sale drops the cart; it is never edited afterwards.** A wrong
  invoice is corrected by a return document from the sales screen, not by
  reopening it. This keeps a receipt that has already been handed over from
  disagreeing with the books, and it removes a whole class of "which copy is
  real?" bugs.
- **A failed print is a warning, never a failed sale.** The sale is committed
  before the printer is touched; if printing throws, the screen keeps a warning
  banner plus a reprint button. Reporting a saved sale as failed would make a
  cashier ring it up twice.
- **Recall consumes the hold.** `sales:recall-held` only reads the payload, so
  the screen drops the hold explicitly after a successful recall — otherwise the
  same parked invoice could be resumed twice and sold twice.
- **The receipt printer is a renderer preference, not a DB setting.** It names a
  driver on *this* PC (`Preferences.receiptPrinter`, alongside `autoPrintReceipt`),
  so choosing it costs no migration and no backup. Settings seeds it from the
  Windows default on first run, and the POS prints only when it is non-empty and
  auto-print is on.
- **Payment methods come from Settings.** The dialog renders only the methods in
  `settings.payment_methods`; offering a card field to a cash-only shop would
  record money against a method that never arrives.
- **Closing a shift shows the reconciliation before the gate reopens.** A
  successful close empties `shift`, which would otherwise swap the screen for the
  open-shift gate and lose the counted-vs-expected figure before anyone read it,
  so the gate waits for the dialog to be dismissed.
- **Stacked dialogs suppress the parent's `Esc`.** `Dialog` listens in the
  capture phase, so with the customer picker open over the payment dialog a single
  `Esc` would close both and throw away the tenders already entered;
  `PaymentDialog` therefore takes `nestedOpen` and refuses to dismiss itself.
- **Keyboard shortcuts are ignored while a field has focus** (except the function
  keys), so `Delete` edits the quantity in the box instead of deleting the
  invoice line.

## Decision #13 - `sale.credit_override` sits outside the frozen schema's permission list

**Date:** 2026-10-10  
**Status:** Accepted; recorded so the drift from `docs/schema-v1.md` is deliberate.

- **What the schema froze.** `docs/schema-v1.md` §8 fixes the permission codes at
  seven: `sale.zero_price`, `sale.expired_override`, `stock.negative_override`,
  `cash.manual_move`, `document.void`, `product.price_change`,
  `product.cost_change` — with owner and manager holding all of them and cashier
  holding none. That list is a statement about *the data contract*: "roles and
  permissions are defined in code, not in tables".
- **What is registered here.** `src/shared/permissions.ts` carries an eighth
  code, `sale.credit_override`, and it is the only code the schema does not
  name. It is enforced in `SaleService.completeSale` and recorded as
  `creditOverride: true` on the sale's audit row.
- **The credit-limit rule it belongs to.** When the chosen customer has a
  positive `credit_limit_piasters` and the sale would leave a due amount, the
  service projects the customer's *derived* balance (existing ledger balance plus
  this sale's due) and refuses with `credit_limit_exceeded` when the projection
  exceeds the limit. `NULL` means unlimited credit; `0` means no credit at all —
  the two are not the same thing and are never collapsed. The projection reads
  `repositories/balances.ts`, the same SQL the operator-facing balance read uses
  (Decision #8), so the number the customer is told and the number the sale is
  refused against cannot disagree.
- **Why the code is outside the frozen list.** The schema's seven codes all guard
  a *pricing or stock figure* the operator is about to corrupt by hand — a zero
  price, an expired item, negative stock, a drawer move, a void, a changed price
  or cost. The credit limit is different in kind: it is a policy limit on a
  *derived* balance, and the schema deliberately leaves the enforcement of that
  limit to the service layer (it says a positive limit "is enforced by the sale
  service", not by any constraint). An override of it is therefore app-level
  policy, exactly like the limit itself, and belongs with the other override
  codes rather than in the schema's table of figure-guarding permissions.
- **Backward compatibility.** Adding a code to `permissions.ts` cannot change the
  meaning of any frozen permission: the map is additive, `owner`/`manager` gain
  the new code by holding "all", `cashier` still holds none, and no migration or
  stored row is touched. A cashier who attempts to sell past a limit still gets
  `credit_limit_exceeded`; they simply cannot lift it.

