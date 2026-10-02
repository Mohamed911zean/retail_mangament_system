# Small Shop POS — Offline Desktop App

> Read this file fully before writing or changing any code. It is the source of truth for scope, architecture, and rules.

## 1. What this project is

A **100% offline** point-of-sale + purchases + inventory + reports + invoices desktop app for **small, ordinary shops** in Egypt (frozen food, plain sweets, small groceries). It is **NOT an enterprise ERP**. Do not add enterprise concepts (multi-branch, approvals workflows, accounting double-entry, etc.).

- Sold at a low retail price to many clients. One shop = one Windows PC = one cashier device.
- The developer is a **solo front-end developer**. Keep everything in **TypeScript**. Prefer boring, simple, well-known solutions. Avoid cleverness.
- Delivered to the client as a **compiled installer only** (never source code).
- Each client may need custom business logic. **Maintainability and customizability of the code is the #1 goal**, even for large business-logic changes.

### Target machines (hard constraints)
- **Windows 10 ** (decided: Windows 7 is NOT supported), weak hardware (2–4 GB RAM, HDD, old CPU/GPU). Build for 64-bit, and 32-bit Windows 10 too if feasible (verify native module prebuilds). Assume no internet, ever.
- UI language: **Arabic, RTL by default**. All user-facing text lives in i18n files, never hardcoded in components.

## 2. Tech stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Shell | **Electron (a currently supported stable major, pinned exactly)** | Windows 10+ only. Choose the version at project start and record it in the Decision Log. **Never upgrade Electron without explicit instruction.** |
| Renderer | **React + TypeScript + Vite** | No Next.js. Set the Vite build target to match the pinned Electron's Chromium version. |
| Styling | Tailwind CSS (+ simple local components) | No runtime CSS-in-JS. Keep bundle small. |
| DB | **SQLite via `better-sqlite3`** | Runs in the main process only. Pin a version that builds against the pinned Electron (verify in Phase 0). |
| Query/migrations | **Drizzle ORM or Kysely** + SQL migrations | Not Prisma (does not fit). If neither works, use plain SQL + a tiny own migration runner. Decide in Phase 0 and record in the Decision Log. |
| Tests | Vitest | Domain logic must be unit tested. |
| Packaging | electron-builder (NSIS), pinned | Verify the installer on a real weak Windows 10 machine. |

Electron's embedded Chromium is only patched by upgrading Electron, so: **the app must never load remote content, never open arbitrary URLs, never use `<webview>`**, and must keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for the renderer.

## 3. Absolute rules

1. **Offline only.** No CDN, no remote fonts/icons, no telemetry, no update checks, no network calls. Bundle all fonts (Arabic font such as Cairo/Tajawal as local woff2), icons, and libraries. Set a strict Content-Security-Policy that blocks remote origins.
2. **Money is integer piasters.** Never use `Float` for money. `12.50 EGP` = `1250`. Format only at the UI edge.
3. **Quantities are integers in the smallest unit** (e.g. grams for weighed goods, pieces for counted goods; use a fixed `qtyScale` such as 1000 where fractional quantities exist). No floating-point quantity math.
4. **All multi-table writes happen in ONE SQLite transaction** (e.g. sale = invoice + items + stock movements + treasury + customer ledger). Either everything is saved or nothing.
5. **Domain logic is pure.** Pricing, discounts, tax, FIFO/batch allocation, balances, and totals are pure TypeScript functions in `src/domain/` with **no DB, no Electron, no React imports**, covered by unit tests. This is the main protection against serious bugs.
6. **Never edit core logic to satisfy one client.** Use the extension mechanism (section 6). Core changes must be generally useful and backward compatible.
7. **Never silently crash.** Wrap IPC handlers and DB operations; return typed errors; show clear **Arabic** messages. The app must keep running.
8. **Data safety first.** Never delete financial records; use soft delete/void + audit log. Never run a migration without an automatic backup right before it.
9. **TypeScript strict mode.** No `any` without a comment. Share types between main and renderer via `src/shared/`.
10. **Keep it light.** Every new dependency needs a reason (weak PCs, size, compatibility with the pinned Electron). Prefer small libs. No heavy UI kits. Virtualize long lists.
11. Do not use JS/CSS features unsupported by the pinned Electron's Chromium/Node versions.

## 4. Architecture

```
Renderer (React, sandboxed)
   │  typed IPC only (contextBridge, preload.ts)
Main process (Node)
   ├─ ipc/            thin handlers: validate input → call service → return result/error
   ├─ services/       use-cases (SaleService, PurchaseService, InventoryService, ...) — orchestrate transactions
   ├─ domain/         PURE logic (money, pricing, stock allocation, reports math) — unit tested
   ├─ repositories/   all SQL lives here (only layer that touches the DB)
   ├─ hardware/       printing, (later) barcode/scale adapters, cash drawer
   ├─ license/        offline license verification, machine fingerprint
   ├─ backup/         scheduled + on-close + pre-migration backups, restore
   └─ extensions/     extension registry & hooks (section 6)
SQLite file in userData dir (WAL mode), never inside the install dir
```

Dependency direction: `ipc → services → (domain, repositories)`. `domain` imports nothing from the app. The UI never imports from main-process code; it talks through the typed IPC contract in `src/shared/ipc.ts`.

### Suggested folder layout
```
/src
  /main            electron main process (ipc, services, repositories, hardware, license, backup)
  /domain          pure logic + *.test.ts
  /renderer        React app (pages, components, hooks, i18n/ar.json)
  /shared          types, IPC contract, constants
  /extensions      core extension API + built-in modules
/clients           per-client overlays (config + extension modules + templates) — NOT forks
/migrations        ordered SQL migrations
/tools/license-gen separate small CLI (developer machine only; holds private key; NEVER shipped)
/docs              decision log, schema notes
```

## 5. Data conventions

- IDs: **ULID/UUID text**. Timestamps: **UTC epoch milliseconds (integer)**; display in Africa/Cairo.
- Every transactional table has `createdAt`, `updatedAt`, and `deviceId` (cheap insurance for a possible future multi-device/LAN mode; do **not** build sync now).
- Soft delete (`deletedAt`) for master data; financial documents are **voided**, never deleted.
- SQLite pragmas: `journal_mode=WAL`, `synchronous=FULL` (power cuts are common), `foreign_keys=ON`. Run `PRAGMA quick_check` at startup.
- Invoice numbers come from a per-device sequence table, generated inside the sale transaction.
- Settings are a key/value table (`settings`), including feature flags and the active client profile.

### Core tables (v1)
`settings`, `users` (+roles/permissions), `categories`, `products`, `product_units` (unit conversions e.g. box/piece), `barcodes`, `stock_movements` (**append-only ledger**: purchase, sale, return, adjustment, damage, count), `stock_batches` (only when expiry/batch feature is on), `sales`, `sale_items` (**store cost price at time of sale**), `sale_returns`, `customers`, `suppliers`, `purchases`, `purchase_items`, `purchase_returns`, `payments` (customer/supplier payments ledger — balances are **derived** from ledger entries, not hand-edited numbers), `treasury_transactions` (linked to sale/purchase/payment/expense), `expenses`, `shifts` (open/close, expected vs counted cash per cashier), `held_sales`, `stock_counts`, `audit_log`, `schema_migrations`.

Dynamic per-business attributes: use typed **extension tables** when data must be queried/filtered; use a `metadata` JSON column only for display-only data.

## 6. Customization model (how we avoid 20 diverging forks)

There is ONE core. Client differences live in `/clients/<client-name>/` and are loaded at build time (`CLIENT=<name>`), never by editing core files.

Mechanisms, in order of preference:
1. **Settings / feature flags** (e.g. `features.expiryDates`, `features.weightedItems`, `features.customerCredit`) for toggling built-in modules.
2. **Hooks** exposed by services, e.g. `beforeSaleComplete`, `afterSaleComplete`, `calculateLineDiscount`, `validatePurchase`, `extendReceiptContext`. Client extensions register handlers in the extension registry.
3. **Extension tables + extension UI slots** (extra product fields, extra report, extra settings page) registered through the module registry.
4. **Templates** for receipts/invoices/labels (HTML templates per client).
5. Only if none of the above works: add a **new generic hook/extension point to core** (small PR-style change), then use it from the client folder.

If a request seems to require changing core behavior, **stop and propose a new extension point** instead of hardcoding.

## 7. Printing (must work with many printer types)

- Enumerate installed printers via Electron (`getPrintersAsync`) and let the user pick the receipt printer and the A4 printer in Settings; store choices.
- Paper presets: 58mm, 80mm, A4 (width/margins in settings).
- Render receipts/invoices as **HTML templates** (RTL, local Arabic font) in a hidden window and print **silently through the Windows driver**. No raw ESC/POS in v1 (Arabic code-page issues). Cash-drawer kick can be added later as an optional adapter.
- Provide a "print test receipt" button in Settings.
- Hardware access goes through adapters in `src/main/hardware/` so new devices can be added without touching services.

## 8. Licensing (anti-copy, pragmatic — do not over-invest)

- Machine fingerprint from **multiple sources** (Windows `MachineGuid`, system-drive volume serial, CPU id); accept a match of **2 of 3** so hardware changes/reinstalls don't lock the customer out. Never rely on motherboard serial alone (often fake on cheap PCs).
- Client sends the machine code → developer generates a license with `tools/license-gen` (**Ed25519** signature; private key only on the developer machine) → client enters the key in the app. App embeds the **public** key only.
- License payload: machine fingerprint, client name, expiry (annual) with a grace period, allowed features.
- Verify in the **main process**, in more than one place (startup + periodically + on sensitive actions), not a single `if`. Detect clock rollback by storing the latest seen timestamp.
- Later hardening (optional): compile main-process code to V8 bytecode / obfuscate. Goal is deterring casual copying, not stopping determined pirates.
- Updates, support, and backup tooling should be tied to a valid license.

## 9. Backup, restore, updates

- Backups use SQLite's online backup API (`better-sqlite3` `.backup()`), never a raw copy of a live file.
- Triggers: every N minutes (configurable), on app close, **before every migration**, and manual. Keep the last K backups; optional second location (USB drive path).
- Restore UI: pick a backup → confirm → app restarts on the restored DB (keep the replaced DB as a safety copy).
- Excel/CSV export for key reports and data.
- Updates: client installs a new installer over the old one; on startup run pending migrations (after auto-backup). Migrations are forward-only, tested against a copy of a realistic database. If a migration fails, restore the pre-migration backup and show an Arabic error.

## 9.1 Performance on weak PCs

- Consider `app.disableHardwareAcceleration()` as a setting (helps on old GPUs).
- Single window, single-instance lock, no menu bar, lazy-load heavy pages, virtualized lists, indexed queries, debounce search. Measure idle RAM and cold start time and record them in the docs.

## 10. v1 scope

**In:** POS screen (barcode, quick search, hold/resume, item and invoice discounts, cash/card/credit/partial payment, returns), products/categories/units/barcodes, purchases & suppliers, inventory (ledger, adjustments, stock count, low-stock alerts, optional expiry/batch), customers & credit balances, treasury & expenses, shifts & cash count, users/roles/permissions, receipts & invoices printing, reports (daily sales, profit, stock value, low stock, expiry, customer/supplier balances), backup/restore, licensing, Arabic RTL UI.

**Out (do not build, but do not block):** multi-device/LAN, cloud sync, government e-invoicing, pharmacy specifics, restaurant tables, clothing variants matrix, any online feature, accounting double-entry.

## 11. Phase plan

### Phase 0 — Walking skeleton / spike (FIRST. Nothing else until this passes)
Goal: prove the stack works on the real target machines.
- [ ] Electron + Vite + React + TS app that opens, packaged with electron-builder NSIS installer (plus a portable single-.exe target as an optional output).
- [ ] `better-sqlite3` built for the pinned Electron (use `@electron/rebuild`); DB created in userData; migration runner works (pick Drizzle/Kysely/plain SQL and record it).
- [ ] A fake sale writes across 3+ tables inside one transaction; test killing the app mid-write (no corruption/partial data).
- [ ] Silent receipt print (Arabic RTL, local font) on a thermal printer and on A4; printer picker works.
- [ ] Tested on a **weak real Windows 10 machine** (and 32-bit Windows 10 if targeted): installs, starts, runs. Record cold-start time, idle RAM, installer size.
- [ ] License demo: generate a key with `tools/license-gen`, validate in the app, wrong machine rejected.
- [ ] Backup via `.backup()` + restore demo.
- [ ] Verify the CSP blocks all remote requests and the app works with the network cable unplugged.

Write results and any version pins into `docs/DECISIONS.md`.

### Phase 1 — Core
Domain functions + tests (money, totals, discounts, FIFO), schema & migrations, repositories, services, users/roles, settings, i18n/RTL shell.

### Phase 2 — Daily operations
POS, products, purchases, inventory ledger, customers/suppliers, treasury, shifts, printing templates.

### Phase 3 — Reports, backup/restore UI, licensing UI, installer polish.

### Phase 4 — Extension system hardening + first client profile (frozen food / sweets / grocery presets).

## 12. How the AI should work in this repo

- Before coding a feature: state which layer(s) it touches and which extension point (if any) it uses.
- Write/extend unit tests for any change in `src/domain/`.
- Do not refactor unrelated code. Do not add dependencies without justification (size, compatibility with the pinned Electron).
- Do not change pinned versions (Electron, better-sqlite3, electron-builder) unless asked.
- Prefer small, reviewable changes. Update `docs/DECISIONS.md` when a technical decision is made.
- All user-visible errors are in Arabic and actionable.
- When unsure about scope, ask instead of expanding the project.

## Decision log (initial)

- Shell: **Electron** (supported stable major, exact version recorded here after Phase 0) — chosen for a TypeScript-only, solo front-end developer. (Tauri/Neutralino rejected: Rust/sidecar needed, transaction/printing complexity.)
- Platform: **Windows 10 only. Windows 7 is not supported** (decided). Clients on Windows 7 must upgrade Windows or the PC.
- DB: SQLite (better-sqlite3), WAL, integer money.
- ORM: pending Phase 0 (Drizzle / Kysely / plain SQL).
- Multi-device: not in v1; data model keeps `deviceId` and repository boundary for a possible future LAN mode.


## Future: LAN multi-device mode (NOT in v1, do not build)
Keep the architecture ready for one host PC serving other PCs on the local network:
- The renderer must never access Node/Electron/DB directly; only through the typed API in src/shared.
- Services must be stateless: no global in-memory state (stock caches, current-sale objects) in the main process.
- Never share the SQLite file over a network folder. Only the host process opens it.