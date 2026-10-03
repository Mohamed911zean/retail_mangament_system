# Database

SQLite is opened only in the Electron main process with WAL mode,
`synchronous=FULL`, foreign keys enabled, and startup `quick_check`.
The bundled SQLite version is 3.53.4. The database file is
`<userData>/database/small-shop-pos.sqlite`; backups use the online backup API.

## Tables and relationships

| Table | Important columns and rules |
|---|---|
| `settings` | key/value settings, typed value enum, common timestamps/device |
| `users` | unique username, owner/manager/cashier role, soft delete |
| `categories` | product grouping, soft delete |
| `customers` | optional credit limit, soft delete |
| `suppliers` | supplier master data, soft delete |
| `products` | quantity scale, price-unit quantity, integer prices, optional category |
| `product_units` | product unit conversion and price |
| `barcodes` | product/unit barcode; active normalized barcode is unique |
| `stock_batches` | product batch and expiry metadata |
| `stock_movements` | append-only quantity/value ledger; optional reversal and batch |
| `sales` | invoice totals, payment split, status, user/shift/customer links |
| `sale_items` | append-only sale lines and stored cost |
| `money_ledger` | append-only cash/customer/supplier ledger entries |
| `shifts` | cashier opening/closing cash; one open shift per device |
| `held_sales` | serialized held cart, soft delete |
| `audit_log` | append-only audit records |
| `device_sequences` | atomic per-device sale/purchase/return sequences |
| `purchases` | supplier purchase totals and status |
| `purchase_items` | purchase lines |
| `sale_returns` | return totals and status |
| `sale_return_items` | returned sale lines, resalable/damaged condition |
| `stock_counts` | stock count lifecycle |
| `stock_count_items` | expected and counted product quantities |
| `expenses` | posted/voided shop expenses |

All tables are `STRICT`, identifiers are `snake_case`, IDs are text, and
money, quantities, and timestamps are INTEGER. Foreign-key indexes are
present for every documented high-volume relationship. Active uniqueness is
implemented with partial indexes for products, barcodes, and open shifts.

Relationships: products reference categories and own units, barcodes, batches,
and movements; sales own sale items and may reference customers/users/shifts;
purchase and return aggregates own their items; money entries may reference
sales, customers, suppliers, and shifts; counts and expenses reference users
and their optional product/shift records.

## Mutation rules

`stock_movements`, `money_ledger`, `audit_log`, `sale_items`,
`purchase_items`, and `sale_return_items` are append-only. UPDATE and DELETE
triggers raise stable machine codes. `sales`, `purchases`, and `sale_returns`
allow only status, updated/void fields to change and reject DELETE.
Corrections use compensating rows with `reverses_*` references.

## Sequences and transactions

`device_sequences` starts at one and is incremented atomically by
`nextSequenceNumber`. Repositories receive a database/transaction handle and
never open a transaction. Services use `runInTransaction` for every
multi-table operation.

## Verification

`npm run db:verify` recomputes stock quantity/value from movements, enforces
the stock invariants, recomputes customer/supplier balance inputs using the
domain functions, checks shift cash using `calculateExpectedShiftCash`,
checks sale totals and paid/due, validates reversal links and opposite signs,
checks required triggers, and runs `foreign_key_check` and `integrity_check`.
Each error also exposes the Arabic translation key `errors.<code>`.

Verifier codes are:

| Code | Meaning |
|---|---|
| `db_foreign_key` | SQLite foreign-key violations |
| `db_integrity` | SQLite integrity or domain-input failure |
| `stock_invariant_zero_value` | zero quantity has non-zero value |
| `stock_invariant_negative_value` | positive quantity has negative value |
| `sale_total_mismatch` | lines plus rounding do not equal sale total |
| `sale_paid_due_mismatch` | paid plus due do not equal total |
| `reversal_missing` | reversal points to no original |
| `reversal_sign` | reversal does not invert its original |
| `missing_append_only_trigger` | required immutability trigger is absent |
| `shift_cash_mismatch` | stored expected shift cash differs from ledger math |
| `document_ledger_mismatch` | document payment ledger does not match stored paid amount |
| `document_stock_mismatch` | document item quantities/cost do not match stock movements |
| `return_total_mismatch` | return item refunds do not match return total |
| `return_refund_mismatch` | return refund ledger does not match cash refunded |
| `return_restock_mismatch` | resalable/damaged return movement rule is violated |
| `missing_void_compensation` | voided state does not match compensation rows |
| `reversal_metadata_mismatch` | reversal metadata does not match its original |
| `balance_mismatch` | derived balance is invalid or outside safe integer range |

The frozen schema stores customer and supplier balances as derived values, not
columns. The verifier therefore validates that their ledger inputs are
accepted by the pure balance functions; there is no stored balance to compare.
