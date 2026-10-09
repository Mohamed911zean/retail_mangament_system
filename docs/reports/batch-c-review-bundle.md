# Batch C Review Bundle — Phase 1 Services Green

**Scope:** Recovery and completion of Batch C (Phase 1 core): database hardening tests, all application services, void orchestration, shifts/cash, integration and failure-injection suites.
**Final verification:** `npm run lint` 0/0 · `npm test` 40 files / 234 tests, all pass · `npm run build` pass · `npm run db:verify` green on the dev database.

## 1. What was delivered

| Area | Deliverable | Tests |
|---|---|---|
| Database verification | `db-verify` with 18 codes; corrupted-DB test per code; compensation-row reconciliation for voided documents | `db-verify.test.ts`, `triggers.test.ts`, `migration*.test.ts` |
| Stock engine | `applyMovement`, FEFO allocation, negative settlement, normalization | `stockEngine.test.ts`, `src/domain/inventory.test.ts` (33) |
| Sales | `SaleService.completeSale` + held sales | `sales.test.ts` (5) |
| Purchases | `PurchaseService.receivePurchase` with corrected line math and transaction error propagation | `purchases.test.ts` (4) |
| Returns | `SaleReturnService.processReturn`; restock `reference_id` = sale_return_items id | `saleReturns.test.ts` (3), `src/domain/returns.test.ts` (12) |
| Voids | `VoidService`: `voidSale`, `voidPurchase`, `voidSaleReturn`, `voidExpense` | `voids.test.ts` (7), `src/domain/voids.test.ts` (5) |
| Shifts & cash | `ShiftService`: open/close with cash reconciliation, expenses, cash in/out | `shifts.test.ts` (6) |
| Integration (C9) | Seeded scenario: 320 mixed operations, `verifyDatabase` after every one | `scenario.test.ts` |
| Failure injection (C9) | Fault at every named step; full rollback proven; service stays usable | `failure-injection.test.ts` (5) |

## 2. Key decisions made this round

1. **Verifier compensation reconciliation.** The frozen schema designates `entry_type='void_compensation'` (and `movement_type='void_compensation'`) as the reversal representation, but three verifier rules made a correctly voided document unverifiable:
   - `document_stock_mismatch` / `purchase_stock_mismatch` now sum only the document's own movement types (`sale`, `purchase`), excluding compensation rows that carry the document's `reference_type/reference_id`.
   - `reversal_metadata_mismatch` accepts `entry_type='void_compensation'` for reversals while still requiring `payment_method`, `customer_id`, `supplier_id` to match the reversed entry. The existing corruption fixtures still trip every code, so detection strength is unchanged.
2. **Return restock reference.** `sale_return` restock movements use `reference_id = sale_return_items.id` (item row), not the return header id — matches `return_restock_mismatch` (commit `e325b1b`).
3. **`voidSaleReturn` domain typing.** Passed as `documentType: 'sale'` to `calculateVoidCompensation` (no negative-stock check, no return-block), while all written rows reference the `sale_return` document itself.
4. **Shift cash source of truth.** Expected cash is computed from `money_ledger` only (`payment_method='cash'`, `shift_id = shift`), exactly matching the verifier's `shift_cash_mismatch` recomputation; non-cash expenses never affect expected cash.
5. **Void/shift interaction in scenarios.** Compensation entries inherit the original document's `shift_id`; the scenario therefore only voids documents from the currently open shift, mirroring real cashier workflow and keeping closed shifts immutable for the verifier.

## 3. Recovery notes

- Round 1–2 state (audit sections 1–6) was verified as accurate: baseline `e325b1b`, 36 files / 215 tests green.
- Pre-existing lint debt in `saleReturns.test.ts` (unused import, six `as any` casts) was fixed with proper result narrowing; no expected values were changed anywhere to make tests pass.
- `voids.ts` was delivered uncompiled by the previous session; it was made type-clean (removed unused imports, replaced raw-query `any` casts with typed `DatabaseHandle` access) before tests were written.

## 4. Outstanding / deferred

- **Git unavailable on this machine.** All Batch C round-3 work is uncommitted working-tree changes. Commit order once Git is installed:
  1. `feat(services): VoidService — voidSale, voidPurchase, voidSaleReturn, voidExpense`
  2. `test(services): VoidService test coverage`
  3. `feat(services): ShiftService`
  4. `test(services): seeded scenario and failure-injection suites`
  5. `docs(report): batch C review bundle`
  6. `git tag phase1-services-green`
- R4 scope trimmed per handoff: customer receipts and supplier payments are not part of `ShiftService`; they belong to the treasury work in Phase 2.
- C10 remnants: `DECISIONS.md` and `docs/database.md` error-table updates remain as minor doc follow-ups.

## 5. Evidence

```
npm run lint   → 0 errors, 0 warnings
npm test       → Test Files 40 passed (40) / Tests 234 passed (234)
npm run build  → vite renderer + electron main compiled
scenario       → 320 ops, verifyDatabase after each, all green
fault suite    → every named step rolls back; retry succeeds
```
