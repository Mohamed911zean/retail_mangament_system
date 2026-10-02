# Phase 0 Completion Report

## Scope and outcome

Phase 0 proves the offline desktop walking skeleton for Small Shop POS. The
repository now contains an Electron + React + TypeScript application with
SQLite persistence, transactional rollback protection, Arabic RTL printing
demonstration, online backup/restore, offline Ed25519 licensing, and x64
Windows packaging.

The application remains a technical walking skeleton. No production POS,
purchases, inventory, accounting, or enterprise workflow has been added.

## Fixed decisions and version pins

| Area | Decision |
|---|---|
| Shell | Electron `44.5.1` |
| Renderer | React + TypeScript + Vite |
| Database | SQLite through `better-sqlite3 13.0.3` |
| Query/migrations | Plain SQL migration runner |
| Packaging | `electron-builder 26.15.3` |
| Tests | Vitest `5.0.3` |
| Platform target | Windows 10 x64 |
| UI direction | Arabic RTL by default |
| Money convention | Integer piasters; no floating-point money logic |
| Offline rule | No remote content, network calls, telemetry, or update checks |

## Step 1 — Electron + Vite + React + TypeScript scaffold

### Implemented

- Electron main process and sandboxed CommonJS preload.
- React + Vite renderer.
- Strict BrowserWindow security:
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Arabic RTL starter screen and local-only Content Security Policy.
- Main-process error logging under `%APPDATA%\small_erp\logs\main.log`.
- Renderer load and renderer-process failure reporting with
  `dialog.showErrorBox`.

### Verification

```powershell
npm run build
npm run lint
npx electron --version
```

The Electron binary reported `v44.5.1`. Development and packaged launches
were tested during the runtime module fix; `window.api` was confirmed as an
object through DevTools/CDP.

## Step 2 — SQLite and plain SQL migrations

### Implemented

- `better-sqlite3` database in Electron `userData`.
- WAL mode, `synchronous=FULL`, foreign keys, and startup `quick_check`.
- Ordered SQL migrations in `migrations/`.
- Automatic pre-migration online backup using `.backup()`.
- Database and backup paths remain outside the installation directory.

### Verification

- First-run migration completed without a backup.
- A second pending migration created exactly one pre-migration backup.
- Live Electron startup created the SQLite database and WAL sidecars.
- Native source rebuild was attempted but Visual Studio was unavailable;
  the installed Windows N-API prebuild loaded successfully in Electron.

## Step 3 — Transactional fake sale and rollback

### Implemented

- Technical fake sale writes across `sales`, `sale_items`, and
  `stock_movements`.
- One SQLite transaction covers the complete write.
- Failure injection after each table write.

### Verification

Vitest proved that injected failures after the sale, item, or stock movement
write leave all three tables empty. This is a technical transaction proof,
not a production sales feature.

## Step 4 — Arabic RTL receipt printing and printer picker

### Implemented

- Typed printer IPC and printer enumeration.
- Hidden HTML receipt window with Arabic RTL markup.
- Local-only assets and HTML escaping.
- Silent Windows-driver print request.
- Printer picker in the Arabic renderer.

### Verification

- Printer enumeration returned five installed Windows printers in the test
  environment.
- Receipt HTML tests passed.
- Packaged UI opened with the printer picker.
- Microsoft Print to PDF rejected the silent test request; this was recorded
  as a driver limitation. Physical thermal and A4 printing were not claimed as
  successful.

## Step 5 — Online backup and restore

### Implemented

- Manual online backup using `better-sqlite3.backup()`.
- Backup listing.
- Restore through a temporary online snapshot.
- Pre-restore safety backup.
- WAL cleanup, replacement, reopen, and validation.
- Typed backup IPC and Arabic demo controls.

### Verification

- Backup and restore tests passed.
- A live manual backup of `45056` bytes was created.
- Restore succeeded and created a `pre-restore` safety backup.
- Restore does not raw-copy an open live database.

## Step 6 — Offline Ed25519 licensing

### 6(a) Shared license foundation

- Ed25519 sign/verify with base64url token encoding.
- Payload fields: `licenseId`, `kid`, client, machine code, issue/expiry
  timestamps, and feature identifiers.
- Injectable Windows fingerprint readers for MachineGuid, system volume
  serial, and CPU ID.
- 2-of-3 normalized fingerprint-source matching.
- Empty fingerprint values fail explicitly.

### 6(b) External generator

- `tools/license-gen` is developer-only and compiled separately.
- `keygen` creates DEMO keys in an explicitly supplied external directory.
- `issue` requires an external `--key-file` and emits the activation token.
- Issuance metadata is appended to ignored `issued-licenses.csv`.
- Private keys are stored outside the repository under
  `A:\web\LICENSE-KEYS`.

Verified files:

```text
A:\web\LICENSE-KEYS\demo-2026.private.pem
A:\web\LICENSE-KEYS\demo-2026.public.pem
```

The private key was not copied to source, build output, logs, or packaged
application contents.

### 6(c) App service and activation UI

- Main-process `LicenseService`.
- Typed IPC methods `getLicenseStatus()` and `activateLicense(key)`.
- Build-time public-key embedding.
- Atomic activation file storage under
  `%APPDATA%\small_erp\license\activation.key`.
- Arabic screen with machine code, checksum, copy button, activation input,
  client, expiry, and `kid`.
- Read-only mode for missing, invalid, expired, mismatched, or unavailable
  licenses.
- Data is retained and visible; no deletion or hiding is performed.

### 6(d) Edge-case and clock tests

Tests cover:

- Wrong machine.
- One changed fingerprint source through the shared 2-of-3 matcher.
- Tampered token.
- Expired license.
- Missing activation file.
- Clock rollback.
- Last-seen timestamp persistence in two locations.

Final license test result:

```text
5 test files, 17 tests passed
```

### 6(e) Electron Fuses

The after-pack hook applies Electron Fuses to Windows builds:

- Run as Node disabled.
- Cookie encryption enabled.
- `NODE_OPTIONS` environment variable disabled.
- CLI inspect arguments disabled.
- Only load the application from ASAR enabled.

Fuse inspection confirmed the expected values on the unpacked executable.

## Step 7 — Windows packaging

### Available commands

```powershell
npm run package:win:dir
npm run package:win:nsis
npm run package:win:portable
```

### Verified Phase 0 artifacts

```text
A:\web\SMALL_ERP\small_erp\release-phase0\win-unpacked\small-shop-pos.exe
A:\web\SMALL_ERP\small_erp\release-phase0\Small Shop POS-Setup-0.1.0-x64.exe
A:\web\SMALL_ERP\small_erp\release-phase0\Small Shop POS 0.1.0.exe
```

The unpacked executable was launched and displayed the Arabic title
`نقطة البيع`. NSIS and portable packaging completed successfully.

## Validation summary

| Check | Result |
|---|---|
| `npm test` | Passed: 5 files, 17 tests |
| `npm run build` | Passed |
| `npm run lint` | Passed |
| x64 unpacked package | Built and launched |
| x64 NSIS installer | Built |
| x64 portable executable | Built |
| Electron Fuses | Inspected and confirmed |
| Real weak Windows 10 PC | Not available for this session |
| 32-bit Windows 10 | Not verified |
| Physical thermal/A4 print | Not verified |

## Commits

The Phase 0 work was intentionally split into reviewable commits, including
separate commits for the scaffold, packaging configuration, CommonJS runtime
fix, database, fake sale, printing, backup/restore, license foundation,
external generator, and app licensing.

## Remaining limitations before production

- Test on a real weak Windows 10 machine.
- Verify installer installation and uninstall behavior on the target PC.
- Verify physical thermal and A4 printers.
- Decide whether 32-bit Windows 10 is supported after native-module testing.
- Replace the demo public key and client-specific defaults before shipping.
- Complete production license-key rotation and operational key custody.
