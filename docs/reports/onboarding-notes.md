# Onboarding Notes — Small Shop POS

**Written by:** incoming AI agent  
**HEAD at time of writing:** `04873ce`

---

## Architecture

Electron 44.5.1 desktop app. **Renderer (React/Vite/TS, sandboxed)** communicates only through the typed contract in `src/shared/ipc.ts` to the **Main process**:

```
ipc/       validate input → call service → resolve IpcResult (never reject)
services/  use-case orchestrators; one SQLite transaction per mutation; return ServiceResult
domain/    pure functions; all money/qty math; no DB/Electron/clock imports
repositories/  only SQL layer; synchronous; tx handle supplied by services
```

Money = integer piasters. Quantities = integer base units. Clock/IDs injected. No throws for expected failures (ServiceResult only).

---

## Services

| Service | Methods (summary) |
|---|---|
| StockEngine | `applyMovement`, `applyCompensationMovement`, `allocateBatches` |
| SaleService | `completeSale`, `holdSale`, `resumeHeldSale` |
| PurchaseService | `receivePurchase` |
| SaleReturnService | `processReturn` |
| VoidService | `voidSale`, `voidPurchase`, `voidSaleReturn`, `voidExpense` |
| ShiftService | `openShift`, `closeShift`, `recordExpense`, `recordCashIn/Out` |
| PaymentService | `recordCustomerReceipt`, `recordSupplierPayment`, reversals, balances |
| UserService | login with lockout, CRUD, scrypt hashing |
| CatalogService | product/category/barcode/unit CRUD |
| SettingsService | typed key/value settings with audit |

---

## IPC channels

Grouped by prefix: `auth:*`, `catalog:*`, `sales:*`, `purchases:*`, `returns:*`,
`inventory:*`, `shifts:*`, `treasury:*`, `reports:*`, `settings:*`, `backup:*`,
`printing:*`, `license:*`, `users:*`.

`ipc/operations.test.ts` enforces: every channel has an operation, every operation has a channel.

---

## Screens that exist (all real, no placeholders)

Login, Home, POS, Products+Categories, Suppliers+Purchases, Customers,
Inventory, Treasury/Expenses, Reports, Sales History, Returns, Settings
(Appearance, Features, Printing, Backup/Restore, License, Users).

---

## Migrations

Migrations 0001–0008 applied. Next must be 0009+. Each new migration needs a
DECISIONS.md entry. Never edit an applied file.

---

## Conventions

- **Commits:** conventional commits (`feat/fix/test/docs/refactor(scope): message`)
- **Error codes:** every new code gets an Arabic string in `src/renderer/i18n/ar.json`
  under `errors.<code>`; `error-messages.test.ts` enforces this automatically
- **Tests:** Vitest; domain tests are pure (no DB); service tests use real in-memory SQLite
- **No `Date.now()` / `Math.random()`** in services — use injected `deps.clock.now()` / `deps.ids.next()`
- **All strings** come from `ar.json` — no Arabic hardcoded in components
- **Logical CSS only** (`ps-*`, `pe-*`, `text-start`; never `pl/pr/left/right`)
- **New permission codes** must be documented in DECISIONS.md

---

## Contradictions found

1. `TH` component had a `numeric` prop that applied `dir:ltr` + `text-start`, which
   misaligned headers vs end-aligned cells in RTL context. The human removed the prop
   from the type signature (correct fix; committed separately as `1f69308`). Needs a
   clean commit of the remaining working-tree change.
2. `docs/ui.md` "not verified in real window" section is outdated — human has since
   hand-tested screens 1-3 (ticked in checklist).
3. `docs/features/supermarket-features-brief.md` is a new, untracked file introducing
   the next big feature phase (Excel import/export, barcode, scanning, scale, wallet, labels).
