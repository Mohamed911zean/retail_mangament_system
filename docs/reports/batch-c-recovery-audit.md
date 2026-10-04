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

