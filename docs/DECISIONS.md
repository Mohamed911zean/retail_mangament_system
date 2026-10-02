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
