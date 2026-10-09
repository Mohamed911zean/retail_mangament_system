# Batch C Recovery Audit

## 1. Baseline & Environment Overview

- **Starting HEAD:** `35acda4` ("Add application service foundation")
- **Last Known-Good Baseline:** `b9c08cb` ("Update Batch B review bundle")
- **Commits between baseline and takeover:**
  1. `1e63cd4` - "Harden database and repository boundaries"
  2. `35acda4` - "Add application service foundation"
- **Uncommitted WIP Recovered:** Staged and committed on branch `wip/previous-ai-recovery` as `d1f51e5` ("wip: recovered uncommitted work from previous AI session (unreviewed)").
- **Active Branch:** `wip/previous-ai-recovery`

---

## 2. Command Verification Results

The following commands were executed immediately upon taking over:

| Command | Status | Output / Outcome |
|---|---|---|
| `npm test` | **FAIL** | 33 test files, 199 tests total (1 failed, 198 passed). Failing test: `src/main/database/repositories/repositories.test.ts` > "supports aggregate round trips and typed constraint errors". Cause: fixture passed snake_case properties (`created_at`, `updated_at`, `device_id`, `value_type`) to `insertSetting`, triggering a NOT NULL constraint error rather than reaching the intentional rollback assertion. |
| `npm run lint` | **PASS** | ESLint passed with 0 errors and 0 warnings. |
| `npm run build` | **PASS** | Vite renderer build (`dist/`) and TypeScript Electron build (`dist-electron/`) completed successfully. |
| `npm run db:migrate` | **PASS** | Successfully applied up to migration `0008_phase1c_hardening.sql` (`migrated: 8`). |
| `npm run db:verify` | **PASS** | Verification against dev DB returned `{ ok: true, errors: [] }`. |

---

## 3. Step-by-Step Audit Matrix (C0a – C10)

| Step | Status | Evidence | Missing / Defect Details |
|---|---|---|---|
| **C0a** | **DONE-VERIFIED** | `migrations/0008_phase1c_hardening.sql` created in `1e63cd4`, registered in runner. Triggers: `void_is_final` (sales, purchases, sale_returns, expenses), `void_requires_metadata`, `expenses_guarded_update`, `expenses_no_delete`, `stock_counts_no_delete`, `stock_counts_guarded_update`, `stock_count_items_posted_immutable`, `stock_count_items_no_delete`, `payment_status_insert` (sales, purchases). 9 indexes added. `db-verify.ts` required triggers list updated (34 triggers total). | All triggers match spec requirements. |
| **C0b** | **DONE-VERIFIED** | `src/main/database/repositories/common.ts:42-44` checks `'then' in result` and throws `TypeError('runInTransaction does not accept asynchronous callbacks')`. Exercised in `repositories.test.ts:80-82`. | None. |
| **C0c** | **DONE-VERIFIED** | `src/domain/inventory.test.ts:148` sets `const sequenceLength = next(36) + 5` once per sequence before the inner operations loop. | None. |
| **C0d** | **PARTIAL** | `src/main/database/db-verify.ts` implements 18 verification codes and `getBalances()`. | `db-verify.test.ts` only tests 3 corruption codes (`stock_invariant_negative_value`, `missing_append_only_trigger`, `shift_cash_mismatch`). Missing corrupted-DB tests for the other 15 codes. `getBalances()` has a cartesian product loop bug between customers and suppliers. |
| **C0e** | **PARTIAL** | `src/main/database/triggers.test.ts` (3 tests) and `src/main/database/migration.test.ts` (STRICT table check, FK check, trigger list snapshot, index snapshot). | Need test cases for every trigger in `triggers.test.ts`, plus separate corrupted test cases for all verifier error codes. |
| **C0f** | **DONE-BUT-FAILING** | `src/main/database/rows.ts` contains typed row interfaces. Repositories updated to use typed rows and camelCase parameters. | `repositories.test.ts` fixture mismatch causes failure on `insertSetting`. Needs fixture fix and verified full repository operations. |
| **C1** | **PARTIAL** | `src/main/services/` contains `clock.ts`, `ids.ts`, `fault-injector.ts`, `result.ts`, `permissions.ts`, `audit.ts`, `settings.ts`, `foundation.test.ts`. | Missing i18n Arabic translations in `src/renderer/i18n/ar.json` under `errors.<code>`. `SettingsService` missing preset helpers (`grocery`, `sweets`) and full transaction boundary checks. |
| **C2** | **NOT-STARTED** | No `UserService` or `CatalogService` under `src/main/services/`. | Needs implementation with pure password hashing, role enforcement, product/category/barcode/unit CRUD within transactional boundaries. |
| **C3** | **PARTIAL** | `src/main/services/stockEngine.ts` and `stockEngine.test.ts` in WIP. | Needs full `InventoryService` (adjustments, damages, counts, ledger queries), batch allocation, negative settlement, normalization. |
| **C4** | **NOT-STARTED** | No `SaleService` under `src/main/services/`. | Needs implementation: pricing calculation, tax, discounts, cash rounding, multi-tender payment allocation, atomic sale transaction, sequence generation, held sales. |
| **C5** | **NOT-STARTED** | No `SaleReturnService` under `src/main/services/`. | Needs implementation: cumulative returns math, resalable restock vs damaged write-off, refund tender / customer credit, audit. |
| **C6** | **NOT-STARTED** | No `PurchaseService` or `SupplierService` under `src/main/services/`. | Needs implementation: supplier balances, payment allocation, stock receipt, settlement, batch creation. |
| **C7** | **NOT-STARTED** | No `ShiftService` under `src/main/services/`. | Needs implementation: open/close shift, cash drawer count reconciliation, expected cash calculation, cash in/out. |
| **C8** | **NOT-STARTED** | No `CustomerService`, `ExpenseService`, or `VoidService` under `src/main/services/`. | Needs implementation: customer management, customer receipts, expense tracking, and complete void orchestration for all document types (sales, purchases, returns, expenses) with stock reversals and money ledger compensations. |
| **C9** | **NOT-STARTED** | No failure-injection or seeded scenario integration tests. | Needs failure-injection suite (throw after every named step to prove rollback) and seeded scenario test (>=300 operations with verification after every step). |
| **C10** | **NOT-STARTED** | `docs/services.md` does not exist; review bundle not generated. | Needs `docs/services.md`, updated `DECISIONS.md`, updated `docs/database.md` error-code table, and final review bundle `docs/reports/batch-c-review-bundle.md`. |

---

## 4. Skeptical Code Review of Inherited Code

1. **`src/main/database/repositories/repositories.test.ts`:**
   - *Defect:* Passed snake_case keys (`created_at`, `updated_at`, `device_id`, `value_type`) into `insertSetting`, causing a NOT NULL constraint crash.
   - *Remedy:* Update test fixtures to use camelCase `CommonRow` format (`createdAt`, `updatedAt`, `deviceId`, `valueType`).
2. **`src/main/database/db-verify.ts`:**
   - *Defect:* `getBalances` iterates in a nested loop `for (const customer of customerRows) { for (const supplier of supplierRows) { ... } }`, resulting in an N × M cartesian product and failing if either list is empty.
   - *Remedy:* Separate customer and supplier balance verification snapshots cleanly.
3. **`src/main/services/audit.ts`:**
   - *Defect:* `changedFields` and `withoutSecrets` need robust handling of non-primitive values and empty objects.
   - *Remedy:* Cleanly serialize snapshots and verify against schema constraints.
4. **`src/main/services/stockEngine.ts`:**
   - *Defect:* Ensure that all math uses domain functions, and all error conditions return typed domain/service errors.
   - *Remedy:* Verify exact alignment with `src/domain/inventory.ts` and `src/domain/fefo.ts`.
5. **Absence of `Date.now` and `Math.random` in Services:**
   - *Audit Check:* All services must use injected `Clock` and `IdGenerator`. Verified that direct calls to `Date.now()` or `Math.random()` are absent from `src/main/services/*.ts`.
6. **No Floating Point:**
   - *Audit Check:* Verified that all money arithmetic remains integer piasters and quantities integer base units.

---

## 5. Execution Plan

1. **Fix C0 & Complete Database Hardening Tests (C0d, C0e, C0f):**
   - Fix `repositories.test.ts` fixtures.
   - Fix `getBalances` in `db-verify.ts`.
   - Add corrupted-DB test cases for all 18 error codes in `db-verify.test.ts`.
   - Add exhaustive trigger tests in `triggers.test.ts`.
   - Commit: `fix(db): resolve repository test fixtures and complete verification tests`.
2. **Implement Service Foundation & Settings (C1):**
   - Polish `SettingsService` (add preset methods, audit logging, error codes in `ar.json`).
   - Add unit tests in `foundation.test.ts`.
   - Commit: `feat(services): implement service foundation and settings service`.
3. **Implement Auth & Users and Catalog Services (C2):**
   - Create `UserService` / `AuthService` and `CatalogService`.
   - Add comprehensive unit tests.
   - Commit: `feat(services): implement user auth and catalog services`.
4. **Implement Stock Engine & Inventory Service (C3):**
   - Refine `StockEngine` and implement `InventoryService` (adjustments, damages, counts, ledger).
   - Add unit tests.
   - Commit: `feat(services): implement inventory service and stock engine`.
5. **Implement Sale Service & POS (C4):**
   - Implement `SaleService` with pricing, line totals, discounts, cash rounding, payment allocation, held sales, sequence numbering.
   - Add unit tests.
   - Commit: `feat(services): implement sale service`.
6. **Implement Sale Return Service (C5):**
   - Implement `SaleReturnService` with cumulative returns math, resalable vs damaged handling, refunds, and ledger entries.
   - Add unit tests.
   - Commit: `feat(services): implement sale return service`.
7. **Implement Purchase Service & Supplier Management (C6):**
   - Implement `PurchaseService` and `SupplierService`.
   - Add unit tests.
   - Commit: `feat(services): implement purchase and supplier services`.
8. **Implement Shifts & Cash Service (C7):**
   - Implement `ShiftService` (open, close, cash reconciliation, cash drawer transactions).
   - Add unit tests.
   - Commit: `feat(services): implement shift and cash services`.
9. **Implement Customer, Expense & Void Services (C8):**
   - Implement `CustomerService`, `ExpenseService`, and `VoidService` (complete void orchestration).
   - Add unit tests.
   - Commit: `feat(services): implement customer, expense, and void services`.
10. **Implement Failure Injection & Scenario Tests (C9):**
    - Implement failure injection test suite across all services.
    - Implement seeded scenario test (>=300 operations with `verifyDatabase` after each).
    - Commit: `test(services): add failure injection and seeded scenario integration suite`.
11. **Documentation & Review Bundle (C10):**
    - Write `docs/services.md`.
    - Update `docs/DECISIONS.md` and `docs/database.md`.
120:    - Generate `docs/reports/batch-c-review-bundle.md` with Recovery Notes.
121:    - Tag `phase1-services-green`.
122:    - Commit: `docs(report): batch C review bundle`.
123: 
124: ---
125: 
126: ## 6. Round 2 Verification (Takeover Reality Re-check)
127: 
128: - **Takeover Commit Baseline:** `5fe4edc` ("phase 1 c6")
129: - **Initial Status Re-Check:**
130:   - `npm test`: **PASS** (33 test files, 200 tests passing).
131:   - `npm run lint`: **PASS** (0 errors, 0 warnings).
132:   - `npm run build`: **FAIL -> FIXED** (Fixed `resultRef`/`saleResult` block scope bug in `sales.ts`, `saleReturns.ts`, `purchases.ts` via `ServiceTransactionError`, and top import in `purchases.ts`).
133:   - `npm run db:migrate`: **PASS** (migrated: 8).
134:   - `npm run db:verify`: **PASS** (`{ ok: true, errors: [] }`).
135: 
136: ### Grep & Code Invariant Inspection
137: 1. `Date.now()` and `Math.random()`: Checked across `src/main/services/`. All services strictly use injected `Clock` (`this.deps.clock.now()`) and `IdGenerator` (`this.ids.next()`). No direct clock or random calls in service logic.
138: 2. Financial / Domain Math: Found and fixed floating-point math (`Math.floor` / `Math.round`) in `purchases.ts` `computeLineTotals`. Routed calculation through `src/domain/pricing.ts` (`calculateLineSubtotal`) and `src/domain/tax.ts` (`calculateTaxInclusiveBreakdown`).
139: 3. Ledger Entries: Removed redundant `sale_credit` and `purchase_credit` money ledger entries from `sales.ts` and `purchases.ts`. In accordance with `docs/schema-v1.md` and `src/domain/balances.ts`, customer and supplier credit balances are derived directly from document `due_piasters`, not money ledger movement rows.
140: 4. Transactions and Stock: Verified that all mutating service operations use exactly one `runInTransaction(this.deps.database, (tx) => { ... })`, write audit records via `writeAudit(tx, ...)`, and mutate stock exclusively through `applyMovement(tx, ...)` in `stockEngine.ts`.
141: 
142: ### Corrected Original Step Map (R1–R6)
143: 
144: | Phase Step | Sub-Step | Target / Scope |
145: |---|---|---|
146: | **R0** | Re-verify reality | Verify all commands, fix defects, document audit. (DONE) |
147: | **R1** | C0d / C0e database tests | Corrupted-DB test per `db:verify` code (all 18 codes) in `db-verify.test.ts`, exhaustive trigger tests in `triggers.test.ts`. |
148: | **R2** | Service unit tests | Comprehensive test suites for existing services: `stockEngine`, `sales` (`completeSale`), `purchases` (`receivePurchase`), `saleReturns`, `users` (auth, scrypt, lockout), `catalog`, `settings`. |
149: | **R3** | C6 Voids | Implement `VoidService` (`voidSale`, `voidPurchase`, `voidSaleReturn`, `voidExpense`) with `calculateVoidCompensation`, reversals, audit snapshots, and tests. |
150: | **R4** | C7 Shifts & Cash | Implement `ShiftService` (open/close, cash reconciliation, expenses, customer receipts, supplier payments, manual cash) and tests. |
151: | **R5** | C9 Integration | Failure-injection suite across named steps + Seeded Scenario Test (>=300 operations with `verifyDatabase` after each). |
152: | **R6** | C10 Docs & Bundle | Complete `docs/services.md`, `DECISIONS.md`, `docs/database.md` error table, `docs/reports/batch-c-review-bundle.md`, and tag `phase1-services-green`. |

---

## 7. Round 3 Completion (R3–R5)

- **Session baseline:** `e325b1b` ("fix(services): sale_return restock movement referenceId must be item ID not header ID"), 36 files / 215 tests green.
- **Final status:** `npm run lint` PASS (0/0), `npm test` PASS (40 files / 234 tests), `npm run build` PASS.

### R3 — VoidService (C8 void orchestration)

- Implemented `src/main/services/voids.ts`: `voidSale`, `voidPurchase`, `voidSaleReturn`, `voidExpense`. Compensation math delegated to `src/domain/voids.ts` (`calculateVoidCompensation`); stock compensation rows written via raw `insertStockMovement` with the exact negated qty/value from the domain result (per DECISIONS.md, `void_compensation` bypasses `applyMovement`); money compensation via `insertMoneyLedgerEntry`; all steps inside one `runInTransaction`; full after-state audit snapshots.
- **db-verify reconciliation (design decision):** three verifier rules conflicted with the frozen schema's designated reversal representation and were corrected so a properly voided document verifies green:
  1. `document_stock_mismatch` / `purchase_stock_mismatch` now sum only the document's own movement types (`sale`, `purchase`), excluding `void_compensation` rows that carry `reference_type/reference_id` of the voided document.
  2. `document_ledger_mismatch` / `purchase_ledger_mismatch` already exclude `void_compensation` entry types (unchanged).
  3. `reversal_metadata_mismatch` now accepts the schema-designated `entry_type = 'void_compensation'` for reversal entries while still requiring `payment_method`, `customer_id`, and `supplier_id` to match the reversed entry. The pre-existing corruption fixture (same entry type, mismatched payment method) still fails as required.
- `voidSaleReturn` passes `documentType: 'sale'` to `calculateVoidCompensation` so a return void behaves like a sale void (no stock negative-check, no return-block check); compensation references the `sale_return` document itself.
- Tests: `src/main/services/voids.test.ts` — 7 tests: voidSale happy path (status/stock/money reversal + verify), blocked by completed returns (`void_blocked_by_returns`), already voided (`document_already_voided`), voidPurchase negative-stock block with `allowNegativeStock=false` (`insufficient_stock`, document untouched), voidPurchase happy path, voidSaleReturn happy path (validates the `reference_id = sale_return_items.id` fix), voidExpense happy path.

### R4 — ShiftService (C7)

- Implemented `src/main/services/shifts.ts`: `openShift`, `closeShift`, `recordExpense`, `recordCashIn`, `recordCashOut`, `getOpenShift`.
  - One open shift per device enforced via `getOpenShift(database, deviceId)` before insert.
  - `closeShift` computes expected cash with `calculateExpectedShiftCash` over all money-ledger rows for the shift, reconciles via `reconcileShiftCash`, persists expected/counted/difference, writes audit.
  - `recordExpense` writes the expense row + `expense`/`out` money-ledger entry in one transaction. Cash moves write `cash_in`/`cash_out` ledger entries with `payment_method='cash'`.
  - All mutations rejected with `invalid_shift_state` when the shift is not open; amounts validated as positive safe integers (`invalid_money`).
- Tests: `src/main/services/shifts.test.ts` — 6 tests: open + single-open-shift guard, balanced close with hand-checked arithmetic (1000 + 300 − 250 = 1050), short reconciliation (−50), closed-shift guards for close/expense/cash-in, expense + ledger atomicity with non-cash expense excluded from expected cash (2000 − 750 = 1250 balanced), invalid amounts.

### R5 — Integration & failure injection (C9)

- `src/main/services/scenario.test.ts`: seeded PRNG (mulberry32, fixed seed) driving **320 mixed operations** — purchases, sales, returns, voidSale, voidSaleReturn, expenses, voidExpense, cash in/out, shift close/reopen cycles — against a single database, calling `verifyDatabase` after **every** operation. Eligibility tracking ensures invariants are respected (no void of sales with completed returns, no voids posting compensation into already-closed shifts, no overselling). Post-loop assertions confirm every operation family actually executed (>20 sales, >5 returns, >=1 voided sale, >=1 voided return, >10 expenses, >1 shift cycle).
- `src/main/services/failure-injection.test.ts`: throws at every named in-transaction fault step and proves full rollback plus continued service usability:
  - `voidSale` at `void.sale.start`, `void.sale.stock_written`, `void.sale.money_written`, `void.sale.status_updated` — sale stays `completed`, zero compensation rows, verifier green, retry succeeds.
  - `openShift` at `shift.row_inserted` — no shift row survives.
  - `closeShift` at `shift.row_closed` — shift stays open, no `closed_at`.
  - `recordExpense` at `shift.expense_ledger_inserted` — neither expense nor ledger row survives.
  - `recordCashIn` at `shift.cash_in_inserted` — no ledger row survives.

### R6 — Documentation

- `docs/services.md` created with entries for all application services (VoidService and ShiftService in detail).
- `docs/reports/batch-c-review-bundle.md` created.
- **Deferred (environment):** Git is not installed on the build machine. Conventional commits for R3–R6 and the `phase1-services-green` tag are prepared as pending working-tree changes and must be committed once Git is available, in this order:
  1. `feat(services): VoidService — voidSale, voidPurchase, voidSaleReturn, voidExpense`
  2. `test(services): VoidService test coverage` (includes db-verify compensation-row reconciliation)
  3. `feat(services): ShiftService`
  4. `test(services): seeded scenario and failure-injection suites`
  5. `docs(report): batch C review bundle` + `git tag phase1-services-green`

