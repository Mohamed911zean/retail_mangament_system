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
