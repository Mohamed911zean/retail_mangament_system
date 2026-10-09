# Application Services

Services live in `src/main/services/`. They are the only layer allowed to mutate the database beyond raw repositories. All services share the same conventions:

- **Result type:** every public method returns `ServiceResult<T>` (`{ ok: true, value }` | `{ ok: false, error }`); never throws for domain failures.
- **Transactions:** each mutating operation performs all of its table writes inside exactly one `runInTransaction(database, (tx) => { ... })`. Domain errors raised mid-transaction are propagated via `ServiceTransactionError` so SQLite rolls everything back.
- **Domain purity:** all arithmetic (pricing, tax, rounding, returns, voids, shift cash) is computed by pure functions in `src/domain/`; services only orchestrate persistence.
- **Determinism:** time comes from the injected `Clock`, identifiers from the injected `IdGenerator`. No `Date.now()` / `Math.random()` in service code.
- **Audit:** every successful mutation writes an append-only `audit_log` row via `writeAudit`.
- **Fault points:** every named step calls `faults.after('<step>')` so the failure-injection suite can prove atomic rollback.

## Stock engine (`stockEngine.ts`)

`applyMovement(tx, deps, input)` is the single write path for `stock_movements`. Validates non-negative on-hand (unless `allowNegativeStock`), settles negative-stock revaluation on crossing purchases, and maintains value invariants checked by `document_stock_mismatch` / `stock_invariant_*`. `allocateBatches` implements FEFO batch selection. Only `void_compensation` movements bypass `applyMovement` (written raw by VoidService with exact negated values, per `DECISIONS.md`).

## SaleService (`sales.ts`)

`completeSale(actor, input)` — prices lines via domain pricing/tax/discount, applies cash rounding, allocates multi-tender payments, writes sale + items + stock movements (`sale`) + money ledger (`sale_payment`) + sequence number in one transaction. `holdSale` / `resumeHeldSale` manage held carts.

## PurchaseService (`purchases.ts`)

`receivePurchase(actor, input)` — manager-only. Creates supplier invoice: purchase + items + stock receipt movements (with negative-stock settlement) + `purchase_payment` ledger entries + optional supplier credit. Tax via domain inclusive-breakdown math.

## SaleReturnService (`saleReturns.ts`)

`processReturn(actor, input)` — cumulative returns math per original sale item; resalable lines restock via `sale_return` movements whose `reference_id` is the **sale_return_items row id** (db-verify `return_restock_mismatch`); damaged lines write off; refunds via `return_out` ledger entries or customer credit.

## VoidService (`voids.ts`)

Complete void orchestration for all four document types. Voiding is terminal (DB trigger `void_is_final`) and requires a reason plus the actor (`void_requires_metadata` trigger).

- `voidSale(actor, { documentId, reason, shiftId? })` — blocked by `document_not_found`, `document_already_voided`, `void_blocked_by_returns` (completed returns exist). Reverses stock (`void_compensation` movements referencing the sale) and payments (`void_compensation` ledger entries mirroring the original `payment_method` / `customer_id` / `supplier_id`).
- `voidPurchase(...)` — additionally enforces `insufficient_stock` when the purchased goods are no longer on hand and `allowNegativeStock` is false.
- `voidSaleReturn(...)` — behaves like a sale void in the domain (no negative-stock check, no return-block check) but compensates the `sale_return` document, reversing the restock.
- `voidExpense(...)` — no stock compensation; reverses the expense ledger entries.

Compensation amounts come from `calculateVoidCompensation` (`src/domain/voids.ts`); the service writes them verbatim (exact negated qty/value) so verifier checks `missing_void_compensation` and `reversal_metadata_mismatch` pass.

## ShiftService (`shifts.ts`)

- `openShift(actor, { openingCashPiasters })` — one open shift per device (`invalid_shift_state` otherwise).
- `closeShift(actor, { shiftId, countedCashPiasters, closingNotes? })` — computes expected cash from all money-ledger rows for the shift via `calculateExpectedShiftCash`, reconciles counted vs expected via `reconcileShiftCash` (`balanced` / `over` / `short`), persists expected/counted/difference, closes the row.
- `recordExpense(actor, { shiftId, category, description, amountPiasters, paymentMethod })` — expense row + `expense`/`out` ledger entry atomically.
- `recordCashIn` / `recordCashOut(actor, { shiftId, amountPiasters, referenceText? })` — manual drawer moves (`cash_in`/`cash_out` ledger entries, method `cash`).
- `getOpenShift()` — current open shift for this device, or `null`.

Shift mutations require the shift to be open (`invalid_shift_state`); amounts must be positive safe integers (`invalid_money`).

## UserService (`users.ts`)

Authentication and account management: scrypt password hashing, login with lockout policy, role-aware user CRUD producing `PublicUser` (no password hashes leak).

## CatalogService (`catalog.ts`)

Product/category/barcode/unit CRUD with duplicate-code and referential-integrity checks.

## SettingsService (`settings.ts`)

Typed key/value settings (tax toggle, cash rounding step, negative-stock policy, presets) backed by the settings repository with audit on change.

## Support modules

- `result.ts` — `ServiceResult`, `ServiceErrorCode`, `ServiceTransactionError`.
- `permissions.ts` — `Actor`, `PermissionCode`, `assertPermission`, role→permission map.
- `audit.ts` — `writeAudit` (append-only, secret-stripped snapshots).
- `clock.ts` / `ids.ts` — `Clock` and `IdGenerator` (ULID) injection points.
- `fault-injector.ts` — `FaultInjector` (`after(step)`), `noFaults` default.

## Verification

`verifyDatabase` (`src/main/database/db-verify.ts`) re-derives every document's stock and money effects and all cross-document invariants (18 codes). The integration scenario (`scenario.test.ts`) runs 320 seeded mixed operations and calls it after each one; `failure-injection.test.ts` proves every named fault step rolls back atomically.
