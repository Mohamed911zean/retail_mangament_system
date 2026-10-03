# SQLite Schema and Pure Domain Proposal — v1

> **Schema v1.0 frozen — 2026-10-02:** After this revision, no schema changes
> happen before the domain functions are implemented, except through a
> documented decision in `docs/DECISIONS.md`.

**Status:** Phase 1 documentation only  
**Implementation:** No migrations, repositories, services, domain code, or UI
code are included.

This proposal follows `AGENTS.md` and `docs/design_system/design_system.md`:

- SQLite is opened only in the Electron main process.
- Repositories are the only SQL boundary; they use one generic snake_case row
  mapper.
- Services own multi-table transactions.
- `src/domain/` is pure TypeScript: no SQLite, Electron, React, filesystem,
  IPC, system clock, or ID generation.
- The app is offline, Arabic RTL by default, and intended for one ordinary shop
  on one Windows PC.
- This is not an enterprise accounting schema: no branches, approvals,
  double-entry accounting, cloud sync, or LAN UI in v1.

## 1. Decisions

These decisions incorporate the current answers from Mohamed and supersede
older open-question assumptions. They may still be changed before migrations.

- IDs use ULID text.
- Invoice numbers are sequential, zero-padded, per device, never reused.
  A device prefix is reserved only if multi-device support is ever added.
- `device_id` is generated once on first run and stored in `settings`, so it
  is included in database backups.
- All tables and columns use `snake_case`.
- Money and percentage calculations use integer arithmetic and one half-up
  rounding helper.
- Prices are tax-inclusive. Tax is feature-flagged and defaults off.
- Quantities are always stored in the product's base smallest unit. Counted
  products use scale 0; measured products use scale 3 (for example grams for
  kilograms, or milliliters for liters).
- `products.qty_scale` is the only persisted quantity scale. Packaging units
  store an integer `base_qty_per_unit`.
- `products.price_unit_qty_base` is the base quantity represented by product
  cost and selling prices: `1` for counted items and normally `1000` for
  kilogram/liter products.
- Costing uses weighted average by value, not FIFO. Expiry batches use FEFO
  selection only when the feature is enabled.
- Customer credit is an account balance, not a payment method. No ledger row is
  created for an unpaid sale portion.
- The first client profile has expiry/batches enabled; core defaults keep it
  off. Customer credit and negative stock default on; negative stock always
  shows a warning.
- Roles are `owner`, `manager`, and `cashier`. Permission codes are defined in
  TypeScript code, not permission tables.
- The schema is implemented in slices: 1a, 1b, 1c, and 1d below.
- `cash_rounding_step_piasters` defaults to `0` pending final confirmation.
- SQLite `STRICT` support is required; verify `sqlite_version() >= 3.37`
  before migrations are written.

## 2. Storage and invariant conventions

### 2.1 SQLite types

| Meaning | SQLite declaration | TypeScript boundary |
|---|---|---|
| IDs, names, statuses, codes | `TEXT` | string/branded string |
| Money, quantities, counts, timestamps | `INTEGER` | safe integer |
| Boolean | `INTEGER NOT NULL CHECK (value IN (0, 1))` | boolean |
| Display-only metadata | `TEXT` | validated JSON object |

All integer values must remain within JavaScript safe-integer range. No money
or quantity column may use `REAL`.

### 2.2 IDs and timestamps

- IDs are ULIDs; the domain receives IDs from the service.
- Timestamps are UTC epoch milliseconds in `INTEGER` columns.
- The UI displays Africa/Cairo time.
- Common mutable-row columns are `created_at`, `updated_at`, and `device_id`.
- Append-only rows retain those columns for traceability but cannot be updated.

### 2.3 Money

- Egyptian money is integer piasters: `12.50 EGP = 1250`.
- Prices, totals, payments, balances, tax, and discounts are integer piasters.
- Rates are integer basis points: `10000 = 100%`.
- Prices cannot be negative. A zero price is allowed only with the required
  permission and audit record.
- Prices are tax-inclusive. When tax is enabled, the domain reverses the tax
  from the tax-inclusive amount using half-up integer arithmetic.
- `cash_rounding_step_piasters = 0` means no cash rounding.

### 2.4 Quantities and packaging

- Every persisted quantity is in the product base smallest unit.
- `products.qty_scale` is the only scale column:
  - counted product: `0`;
  - measured product: normally `3`.
- `product_units` contains only extra packaging units, such as carton or pack.
- `product_units.base_qty_per_unit` is a positive integer. For a carton of 12,
  it is `12`.
- A line stores the selected packaging unit snapshot:
  `unit_name_snapshot`, `priced_unit_qty_base`, and `qty_base`.
- `priced_unit_qty_base` is the number of base units represented by the unit
  price: piece `1`, kilogram `1000`, carton of 12 `12`, or 5 kg bag `5000`.
- A product base unit is fixed after its first stock movement. Packaging units
  remain editable, but historical lines retain their snapshots.

### 2.5 Delete, void, and audit rules

- Master data uses `deleted_at` soft deletion.
- Financial documents are never deleted. They become `voided` and retain
  `voided_at`, `voided_by_user_id`, and `void_reason`.
- Ledger and audit tables are append-only. Database triggers reject their
  `UPDATE` and `DELETE`.
- Corrections are compensating rows.
- Every financial write, void, override, setting change, user change, price or
  cost change, license activation, backup/restore, and deletion writes audit
  data in the same transaction.
- Audit stores changed fields only, except voids, which retain full before/after
  snapshots. Password hashes and private keys never enter audit JSON.

### 2.6 Result and error convention

Every domain function returns:

```ts
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E }
```

Domain functions do not throw for expected validation or business failures.
Stable error codes include `invalid_money`, `invalid_quantity`,
`invalid_rate`, `overflow`, `insufficient_stock`, `invalid_discount`,
`invalid_payment`, `return_exceeds_original`, `document_already_voided`,
`invalid_shift_state`, and `ledger_invariant_violation`.

## 3. Schema slices

All names below are `snake_case`. Every table with `created_at`,
`updated_at`, and `device_id` has those columns marked **common** below.

### Slice 1a — settings, users, catalog, customers, suppliers, stock, batches, sales, money, shifts, holds, audit

#### `settings`

| Column | Rules |
|---|---|
| `key` | `TEXT PRIMARY KEY` |
| `value` | `TEXT NOT NULL` |
| `value_type` | `TEXT NOT NULL CHECK (value_type IN ('string','integer','boolean','json'))` |
| `description` | `TEXT NULL` |
| common | required |

Required initial keys:

| Key | Default |
|---|---|
| `device_id` | generated ULID once on first run |
| `cash_rounding_step_piasters` | `0` |
| `features.shifts` | configured feature flag |
| `features.expiry_batches` | `0` in core; enabled by frozen-food profile |
| `features.weighted_items` | configured feature flag |
| `features.customer_credit` | `1` |
| `features.tax` | `0` |
| `features.allow_negative_stock` | `1` |
| `features.payment_methods` | JSON list: cash, card, wallet |

#### `users`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `username` | `TEXT NOT NULL UNIQUE` |
| `display_name` | `TEXT NOT NULL` |
| `password_hash` | `TEXT NOT NULL` |
| `role` | `TEXT NOT NULL CHECK (role IN ('owner','manager','cashier'))` |
| `is_active` | boolean integer |
| `last_login_at` | `INTEGER NULL` |
| `deleted_at` | `INTEGER NULL` |
| common | required |

Permission codes are defined in code and checked by role/policy. No roles,
permissions, or join tables are created.

#### `categories`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `name` | `TEXT NOT NULL` |
| `sort_order` | `INTEGER NOT NULL DEFAULT 0` |
| `deleted_at` | `INTEGER NULL` |
| common | required |

#### `customers`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `name` | `TEXT NOT NULL` |
| `phone` | `TEXT NULL` |
| `address` | `TEXT NULL` |
| `credit_limit_piasters` | `INTEGER NULL DEFAULT NULL CHECK (credit_limit_piasters IS NULL OR credit_limit_piasters >= 0)` |
| `metadata` | display-only notes JSON |
| `deleted_at` | `INTEGER NULL` |
| common | required |

#### `suppliers`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `name` | `TEXT NOT NULL` |
| `phone` | `TEXT NULL` |
| `address` | `TEXT NULL` |
| `metadata` | display-only notes JSON |
| `deleted_at` | `INTEGER NULL` |
| common | required |

#### `products`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `sku` | `TEXT NULL` |
| `name` | `TEXT NOT NULL` |
| `category_id` | `TEXT NULL REFERENCES categories(id)` |
| `base_unit_name` | `TEXT NOT NULL` |
| `qty_scale` | `INTEGER NOT NULL CHECK (qty_scale IN (0, 3))` |
| `price_unit_qty_base` | `INTEGER NOT NULL CHECK (price_unit_qty_base > 0 AND (qty_scale <> 0 OR price_unit_qty_base = 1))` |
| `cost_price_piasters` | `INTEGER NOT NULL CHECK (cost_price_piasters >= 0)`, per `price_unit_qty_base` |
| `selling_price_piasters` | `INTEGER NOT NULL CHECK (selling_price_piasters >= 0)`, per `price_unit_qty_base` |
| `tax_rate_bps` | `INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bps BETWEEN 0 AND 10000)` |
| `track_expiry` | boolean integer |
| `is_weighted` | boolean integer |
| `low_stock_threshold_qty` | `INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_threshold_qty >= 0)` |
| `metadata` | display-only JSON, nullable |
| `deleted_at` | `INTEGER NULL` |
| common | required |

`base_unit_name` is the product's fixed base unit. It is not a foreign key and
cannot be changed after the first stock movement. `price_unit_qty_base` is
`1` for counted items and normally `1000` for kilogram/liter products. Product
cost and selling prices are always quoted for that many base units.

#### `product_units`

Extra packaging units only.

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `product_id` | `TEXT NOT NULL REFERENCES products(id)` |
| `unit_name` | `TEXT NOT NULL` |
| `base_qty_per_unit` | `INTEGER NOT NULL CHECK (base_qty_per_unit > 0)` |
| `selling_price_piasters` | `INTEGER NOT NULL CHECK (selling_price_piasters >= 0)` |
| `deleted_at` | `INTEGER NULL` |
| common | required |

The base unit is not stored in this table. Packaging changes do not rewrite
historical lines.

#### `barcodes`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `barcode` | `TEXT NOT NULL` |
| `product_id` | `TEXT NOT NULL REFERENCES products(id)` |
| `product_unit_id` | `TEXT NULL REFERENCES product_units(id)` |
| `is_primary` | boolean integer |
| `deleted_at` | `INTEGER NULL` |
| common | required |

Active normalized barcodes are unique. A null `product_unit_id` means the base
unit.

#### `stock_batches`

Optional feature table placed in slice 1a so `stock_movements` has no foreign
key to a later slice.

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `product_id` | `TEXT NOT NULL REFERENCES products(id)` |
| `batch_code` | `TEXT NULL` |
| `expiry_at` | `INTEGER NULL` |
| `received_at` | `INTEGER NOT NULL` |
| `initial_qty_base` | `INTEGER NOT NULL CHECK (initial_qty_base > 0)` |
| `deleted_at` | `INTEGER NULL` |
| common | required |

Batch quantity is derived from `stock_movements`. FEFO chooses the earliest
non-expired batch by expiry, with stable receipt/ULID tie-breaks.

#### `stock_movements`

Append-only weighted-value stock ledger.

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `product_id` | `TEXT NOT NULL REFERENCES products(id)` |
| `batch_id` | `TEXT NULL REFERENCES stock_batches(id)` |
| `qty_delta` | `INTEGER NOT NULL` |
| `value_delta_piasters` | `INTEGER NOT NULL` |
| `movement_type` | `TEXT NOT NULL CHECK (movement_type IN ('purchase','sale','sale_return','adjustment','damage','count','void_compensation','revaluation'))` |
| `reverses_movement_id` | `TEXT NULL REFERENCES stock_movements(id)` |
| `reference_type` | `TEXT NULL` |
| `reference_id` | `TEXT NULL` |
| `occurred_at` | `INTEGER NOT NULL` |
| `reason` | `TEXT NULL` |
| `created_by_user_id` | `TEXT NOT NULL REFERENCES users(id)` |
| common | required |

Movement guards: `qty_delta <> 0 OR (movement_type = 'revaluation' AND
value_delta_piasters <> 0)`, and `movement_type <> 'revaluation' OR qty_delta =
0`. Revaluation rows have `batch_id = NULL`; their value corrections are
product-level and do not need to sum per-batch values.

Positive `qty_delta` adds stock; negative removes stock. `value_delta_piasters`
uses the same direction. A sale consumes both quantity and value. A purchase
adds both. A damage row removes both. A count adjustment records the
calculated difference and value effect. A `void_compensation` row mirrors the
original movement's quantity and value exactly in magnitude, applies the
inverse signed effect, and points to it through `reverses_movement_id`.

Costing invariant:

```text
on_hand_qty   = SUM(qty_delta)
on_hand_value = SUM(value_delta_piasters)
```

Outgoing cost for `qty_sold`:

```text
if on_hand_qty > 0 and on_hand_value > 0:
  if qty_sold == on_hand_qty:
    cost = on_hand_value
  else if qty_sold < on_hand_qty:
    cost = mulDivRoundHalfUp(on_hand_value, qty_sold, on_hand_qty)
  else:
    cost = on_hand_value
           + mulDivRoundHalfUp(product.cost_price_piasters,
               qty_sold - on_hand_qty, product.price_unit_qty_base)
else:
    cost = mulDivRoundHalfUp(product.cost_price_piasters,
      qty_sold, product.price_unit_qty_base)
```

The same weighted-average rule values sales, damage, negative count
differences, and negative adjustments. Removing the entire on-hand quantity
removes exactly `on_hand_value`. Positive count differences and positive
adjustments use the current weighted-average unit cost when on-hand quantity
and value are positive; otherwise they use the product default cost per
`price_unit_qty_base`. The service writes outgoing movements using this
calculated cost. When expiry/batch
tracking is enabled, one sale may create multiple movement rows selected by
FEFO. Each batch movement receives a proportional quantity allocation using
largest remainder, and the allocated value movements sum exactly to the line
cost. The sale line itself does not reference a batch.

#### `sales`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `invoice_number` | `TEXT NOT NULL` |
| `customer_id` | `TEXT NULL REFERENCES customers(id)` |
| `user_id` | `TEXT NOT NULL REFERENCES users(id)` |
| `shift_id` | `TEXT NULL REFERENCES shifts(id)` |
| `subtotal_piasters` | `INTEGER NOT NULL CHECK (subtotal_piasters >= 0)` |
| `line_discount_piasters` | `INTEGER NOT NULL CHECK (line_discount_piasters >= 0)` |
| `invoice_discount_piasters` | `INTEGER NOT NULL CHECK (invoice_discount_piasters >= 0)` |
| `tax_piasters` | `INTEGER NOT NULL CHECK (tax_piasters >= 0)` |
| `rounding_adjustment_piasters` | `INTEGER NOT NULL DEFAULT 0` |
| `total_piasters` | `INTEGER NOT NULL CHECK (total_piasters >= 0)` |
| `paid_piasters` | immutable sale-time snapshot |
| `due_piasters` | immutable sale-time snapshot |
| `payment_status` | `TEXT NOT NULL CHECK (payment_status IN ('paid','partial','credit'))` |
| `status` | `TEXT NOT NULL CHECK (status IN ('completed','voided'))` |
| void columns | `voided_at`, `voided_by_user_id`, `void_reason` |
| `notes` | `TEXT NULL` |
| common | required |

Constraints:

- `final_line_total = line_subtotal - line_discount -
  invoice_discount_allocated`.
- Prices are tax-inclusive; tax is informational and is not added to totals.
- `total_piasters = SUM(final_line_total_piasters) +
  rounding_adjustment_piasters`.
- `paid_piasters + due_piasters = total_piasters`.
- `UNIQUE(device_id, invoice_number)` prevents reuse on a device.
- `due_piasters > 0` requires a customer, including both `credit` and
  `partial` payment statuses.
- A customer with `credit_limit_piasters = NULL` has unlimited credit;
  `0` means no credit. A positive limit is enforced by the sale service.
  Owner/manager override is permission-controlled and audited.
- Overpayment becomes change; it does not create a credit ledger row.
- `paid_piasters` and `due_piasters` never change after sale completion.
- Invoice numbers are allocated from `device_sequences` inside the sale
  transaction and are never reused.

#### `sale_items`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `sale_id` | `TEXT NOT NULL REFERENCES sales(id)` |
| `product_id` | `TEXT NOT NULL REFERENCES products(id)` |
| `unit_name_snapshot` | `TEXT NOT NULL` |
| `priced_unit_qty_base` | `INTEGER NOT NULL CHECK (priced_unit_qty_base > 0)` |
| `qty_base` | `INTEGER NOT NULL CHECK (qty_base > 0)` |
| `unit_price_piasters` | `INTEGER NOT NULL CHECK (unit_price_piasters >= 0)` |
| `line_subtotal_piasters` | `INTEGER NOT NULL CHECK (line_subtotal_piasters >= 0)` |
| `line_discount_piasters` | `INTEGER NOT NULL CHECK (line_discount_piasters >= 0)` |
| `invoice_discount_allocated_piasters` | `INTEGER NOT NULL CHECK (invoice_discount_allocated_piasters >= 0)` |
| `tax_rate_bps_snapshot` | `INTEGER NOT NULL CHECK (tax_rate_bps_snapshot BETWEEN 0 AND 10000)` |
| `tax_piasters` | `INTEGER NOT NULL CHECK (tax_piasters >= 0)` |
| `final_line_total_piasters` | `INTEGER NOT NULL CHECK (final_line_total_piasters >= 0)` |
| `line_cost_piasters` | immutable sale-time cost snapshot |
| `product_name_snapshot` | `TEXT NOT NULL` |
| common | required |

Line discounts apply first. The invoice-level discount is allocated across
lines proportionally using largest remainder, with stable tie-break by line
index. The allocated value is stored here so returns and profit use final line
amounts without re-running historical pricing.

Canonical pricing:

```text
line_subtotal_piasters =
  round_half_up(unit_price_piasters * qty_base, priced_unit_qty_base)

final_line_total_piasters =
  line_subtotal_piasters
  - line_discount_piasters
  - invoice_discount_allocated_piasters
```

Prices are tax-inclusive; tax is informational and is not added to the final
line total. For example, 350 g at 12,000 piasters/kg is
`round_half_up(12000 * 350, 1000) = 4200` piasters.

#### `money_ledger`

One append-only ledger replaces both `payments` and
`treasury_transactions`.

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `entry_type` | `TEXT NOT NULL CHECK (entry_type IN ('sale_payment','customer_receipt','sale_return_refund','purchase_payment','supplier_payment','expense','cash_in','cash_out','void_compensation'))` |
| `direction` | `TEXT NOT NULL CHECK (direction IN ('in','out'))` |
| `amount_piasters` | `INTEGER NOT NULL CHECK (amount_piasters > 0)` |
| `payment_method` | `TEXT NULL CHECK (payment_method IN ('cash','card','wallet'))` |
| `customer_id` | `TEXT NULL REFERENCES customers(id)` |
| `supplier_id` | `TEXT NULL REFERENCES suppliers(id)` |
| `sale_id` | `TEXT NULL REFERENCES sales(id)` |
| `reference_type` | `TEXT NULL` |
| `reference_id` | `TEXT NULL` |
| `reverses_entry_id` | `TEXT NULL REFERENCES money_ledger(id)` |
| `shift_id` | `TEXT NULL REFERENCES shifts(id)` |
| `reference_text` | optional free-text payment reference |
| `tendered_piasters` | nullable cash receipt snapshot |
| `change_piasters` | nullable cash change snapshot |
| `occurred_at` | `INTEGER NOT NULL` |
| `user_id` | `TEXT NOT NULL REFERENCES users(id)` |
| common | required |

Guards:

- `credit` is not a payment method.
- `sale_payment` represents the net amount received, not the unpaid amount.
- Customer receipts are account-level and may have no `sale_id`.
- `reference_type`/`reference_id` identify purchase, return, or expense
  references without foreign keys to later slices; services and `db:verify`
  validate the referenced row.
- `cash_in`/`cash_out` require a mandatory reason.
- Manual cash in/out requires manager/owner permission.
- Ledger rows are append-only.
- Voids are compensating reverse entries only. No ledger row is excluded from
  calculations; reversals link to the original with `reverses_entry_id`.

Customer balance:

```text
sum(sales.due_piasters
    WHERE sales.due_piasters > 0
      AND sales.status = 'completed')
- sum(customer receipts, including append-only reversals linked by
      reverses_entry_id)
- sum(sale_returns.credited_to_account_piasters
      WHERE sale_returns.status = 'completed')
```

Receipt reversals are not deleted or excluded: the reversal entry has the
opposite signed effect and points to the original through
`reverses_entry_id`, so the net receipt total is recomputed from the ledger.

Cash expected for a shift includes only cash ledger entries; card and wallet
entries are excluded.

#### `shifts`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `user_id` | `TEXT NOT NULL REFERENCES users(id)` |
| `opened_at` | `INTEGER NOT NULL` |
| `closed_at` | `INTEGER NULL` |
| `opening_cash_piasters` | `INTEGER NOT NULL CHECK (opening_cash_piasters >= 0)` |
| `expected_cash_piasters` | `INTEGER NULL` |
| `counted_cash_piasters` | `INTEGER NULL CHECK (counted_cash_piasters >= 0)` |
| `difference_piasters` | `INTEGER NULL` |
| `status` | `TEXT NOT NULL CHECK (status IN ('open','closed','voided'))` |
| `closing_notes` | `TEXT NULL` |
| common | required |

There is at most one open shift per device. Shifts are feature-flagged. Held
sales do not block closing. A void's compensation ledger entries always use
the current open shift; they are never inserted retroactively into a closed
shift.

#### `held_sales`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `label` | `TEXT NULL` |
| `user_id` | `TEXT NOT NULL REFERENCES users(id)` |
| `shift_id` | `TEXT NULL REFERENCES shifts(id)` |
| `customer_id` | `TEXT NULL REFERENCES customers(id)` |
| `payload_json` | versioned draft JSON |
| `held_at` | `INTEGER NOT NULL` |
| `deleted_at` | `INTEGER NULL` |
| common | required |

Held sales create no stock, money, payment, invoice, or financial audit rows
until completion.

#### `audit_log`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `occurred_at` | `INTEGER NOT NULL` |
| `user_id` | `TEXT NULL REFERENCES users(id)` |
| `action` | `TEXT NOT NULL` |
| `entity_type` | `TEXT NOT NULL` |
| `entity_id` | `TEXT NULL` |
| `changed_fields_json` | changed fields only |
| `before_json` | full snapshot for voids only |
| `after_json` | full snapshot for voids only |
| `reason` | `TEXT NULL` |
| `device_id` | `TEXT NOT NULL` |
| `created_at` | `INTEGER NOT NULL` |

Audit rows are append-only and retained forever. CSV export is required.

#### `device_sequences`

| Column | Rules |
|---|---|
| `device_id` | `TEXT NOT NULL` |
| `sequence_name` | `TEXT NOT NULL` |
| `next_value` | `INTEGER NOT NULL CHECK (next_value > 0)` |
| `updated_at` | `INTEGER NOT NULL` |

Primary key: `(device_id, sequence_name)`. The allowed sequence names are
`sale_invoice`, `purchase`, and `sale_return`. Each allocation increments its
row atomically inside the containing transaction. Invoice, purchase, and
return numbers are six digits, zero-padded, and never reused per device.

### Slice 1b — purchases

#### `purchases`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `purchase_number` | `TEXT NOT NULL` |
| `supplier_id` | `TEXT NULL REFERENCES suppliers(id)` |
| `user_id` | `TEXT NOT NULL REFERENCES users(id)` |
| `total_piasters` | `INTEGER NOT NULL CHECK (total_piasters >= 0)` |
| `paid_piasters` | `INTEGER NOT NULL CHECK (paid_piasters >= 0)` |
| `due_piasters` | `INTEGER NOT NULL CHECK (due_piasters >= 0)` |
| `payment_status` | `TEXT NOT NULL CHECK (payment_status IN ('paid','partial','credit'))` |
| `status` | `TEXT NOT NULL CHECK (status IN ('completed','voided'))` |
| `voided_at`, `voided_by_user_id`, `void_reason` | void fields |
| common | required |

Constraint: `UNIQUE(device_id, purchase_number)`. Purchase numbers are
allocated from the `purchase` device sequence and are never reused on that
device.

Purchases use the same immutable sale-time paid/due snapshot idea. Supplier
payments are later account/document ledger entries; purchase returns are
deferred from v1.

#### `purchase_items`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `purchase_id` | `TEXT NOT NULL REFERENCES purchases(id)` |
| `product_id` | `TEXT NOT NULL REFERENCES products(id)` |
| `unit_name_snapshot` | `TEXT NOT NULL` |
| `priced_unit_qty_base` | `INTEGER NOT NULL CHECK (priced_unit_qty_base > 0)` |
| `qty_base` | `INTEGER NOT NULL CHECK (qty_base > 0)` |
| `unit_cost_piasters` | `INTEGER NOT NULL CHECK (unit_cost_piasters >= 0)` |
| `line_subtotal_piasters` | `INTEGER NOT NULL CHECK (line_subtotal_piasters >= 0)` |
| `tax_rate_bps_snapshot` | `INTEGER NOT NULL CHECK (tax_rate_bps_snapshot BETWEEN 0 AND 10000)` |
| `tax_piasters` | `INTEGER NOT NULL CHECK (tax_piasters >= 0)` |
| `line_total_piasters` | `INTEGER NOT NULL CHECK (line_total_piasters >= 0)` |
| `batch_code_snapshot` | `TEXT NULL` |
| `expiry_at_snapshot` | `INTEGER NULL` |
| common | required |

`purchase_items` intentionally has no discount column in v1. Its immutable
unit cost and line subtotal are the complete purchase-line pricing snapshot.
Its subtotal uses the same base-unit formula:
`mulDivRoundHalfUp(unit_cost_piasters, qty_base, priced_unit_qty_base)`.

### Slice 1c — sale returns

#### `sale_returns`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `return_number` | `TEXT NOT NULL` |
| `original_sale_id` | `TEXT NOT NULL REFERENCES sales(id)` |
| `customer_id` | `TEXT NULL REFERENCES customers(id)` |
| `user_id` | `TEXT NOT NULL REFERENCES users(id)` |
| `shift_id` | current open shift |
| `total_piasters` | `INTEGER NOT NULL CHECK (total_piasters >= 0)` |
| `cash_refunded_piasters` | `INTEGER NOT NULL DEFAULT 0 CHECK (cash_refunded_piasters >= 0)` |
| `credited_to_account_piasters` | `INTEGER NOT NULL DEFAULT 0 CHECK (credited_to_account_piasters >= 0)` |
| `status` | `TEXT NOT NULL CHECK (status IN ('completed','voided'))` |
| `reason` | `TEXT NULL` |
| void fields | required |
| common | required |

Constraint: `UNIQUE(device_id, return_number)`. Return numbers are allocated
from the `sale_return` device sequence and are never reused on that device.

Returns require the original invoice in v1. A return is immutable after
posting. The cashier chooses `resalable` or `damaged`; correction is a later
stock adjustment, not an edit to the return.

`cash_refunded_piasters + credited_to_account_piasters = total_piasters`.
Only the credited portion reduces customer balance; the cash portion is a
cash refund in the current open shift.

Resalable return items re-enter stock through positive
`sale_return` movements valued at the original sale-line cost. Damaged return
items create no stock movement and remain a loss; their refund can still be
cash or credited to the customer account.

#### `sale_return_items`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `sale_return_id` | `TEXT NOT NULL REFERENCES sale_returns(id)` |
| `sale_item_id` | `TEXT NOT NULL REFERENCES sale_items(id)` |
| `product_id` | `TEXT NOT NULL REFERENCES products(id)` |
| `qty_base` | `INTEGER NOT NULL CHECK (qty_base > 0)` |
| `refund_piasters` | `INTEGER NOT NULL CHECK (refund_piasters >= 0)` |
| `condition` | `TEXT NOT NULL CHECK (condition IN ('resalable','damaged'))` |
| common | required |

For each line, partial returns use cumulative exactness:

```text
refund_i =
  mulDivRoundHalfUp(final_line_total_piasters,
    cumulative_returned_qty_base, original_qty_base)
  - refunded_so_far
```

The same shape is used for restocked cost with
`line_cost_piasters` and `already_restocked_value`. Therefore a 1001-piaster
line returned one unit at a time over three units refunds `334`, `333`, and
`334`, with cumulative targets `334`, `667`, and `1001`, never exceeding the
original total. When batch tracking is enabled,
resalable quantities are restocked into the original sale movements' batches
using largest-remainder proportional allocation, preserving each original
batch movement's relative quantity allocation.

For a resalable item, the cumulative restocked value is based on the original
`sale_items.line_cost_piasters`. For a damaged item, no stock movement is
written and the original cost remains an inventory loss.

Known limitation: a sale's cash rounding adjustment is not refunded by
returns; returns refund `final_line_total_piasters` only.

### Slice 1d — stock counts, expenses

#### `stock_counts`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `status` | `TEXT NOT NULL CHECK (status IN ('draft','posted','voided'))` |
| `started_at` | `INTEGER NOT NULL` |
| `posted_at` | `INTEGER NULL` |
| `user_id` | `TEXT NOT NULL REFERENCES users(id)` |
| `notes` | `TEXT NULL` |
| void fields | required |
| common | required |

#### `stock_count_items`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `stock_count_id` | `TEXT NOT NULL REFERENCES stock_counts(id)` |
| `product_id` | `TEXT NOT NULL REFERENCES products(id)` |
| `expected_qty_base` | snapshot when counted |
| `counted_qty_base` | `INTEGER NOT NULL CHECK (counted_qty_base >= 0)` |
| `difference_qty_base` | calculated signed integer |
| common | required |

There is no inventory freeze. Expected quantity is captured when each line is
counted. Posting creates count movements for non-zero differences.

#### `expenses`

| Column | Rules |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `category` | `TEXT NOT NULL` |
| `description` | `TEXT NOT NULL` |
| `amount_piasters` | `INTEGER NOT NULL CHECK (amount_piasters > 0)` |
| `payment_method` | `TEXT NOT NULL CHECK (payment_method IN ('cash','card','wallet'))` |
| `expense_at` | `INTEGER NOT NULL` |
| `user_id` | `TEXT NOT NULL REFERENCES users(id)` |
| `shift_id` | current shift only when the UI's “paid from the drawer?”
  answer is yes; otherwise `NULL` |
| `status` | `TEXT NOT NULL CHECK (status IN ('posted','voided'))` |
| void fields | required |
| common | required |

Posted expenses create an `expense` money-ledger row in the same transaction.

## 4. Required indexes, guards, and verification

### 4.1 Indexes

Required indexes include:

- Active unique normalized barcode and SKU indexes.
- `products(name, deleted_at)`, `categories(name, deleted_at)`.
- `product_units(product_id, deleted_at)`.
- `UNIQUE(device_id, invoice_number)`, `sales(created_at)`,
  `sales(customer_id, created_at)`,
  `sale_items(sale_id)`, `sale_items(product_id)`.
- `purchases(supplier_id, created_at)`,
  `purchase_items(purchase_id)`.
- `stock_movements(product_id, occurred_at)`,
  `stock_movements(batch_id, occurred_at)`.
- `money_ledger(customer_id, occurred_at)`,
  `money_ledger(supplier_id, occurred_at)`,
  `money_ledger(shift_id, occurred_at)`.
- `audit_log(entity_type, entity_id, occurred_at)`.
- `UNIQUE(device_id, purchase_number)` on `purchases`.
- `UNIQUE(device_id, return_number)` on `sale_returns`.
- `UNIQUE(device_id) WHERE status = 'open'` on `shifts`, allowing at most one
  open shift per device.

### 4.2 STRICT and SQLite verification

All application tables should use SQLite `STRICT` tables. Before migrations are
written, verify the bundled SQLite version supports `STRICT` and record the
result. The Phase 1 database verification must fail clearly if the runtime
SQLite version is too old.

The exact verification command is still implementation work, but the planned
developer command is:

```powershell
npm run db:verify
```

It must open a copied/test database and recompute:

- product quantity from `stock_movements`;
- product value from `value_delta_piasters`;
- customer balance from credit-sale due snapshots, customer receipts, and
  credited returns, including the net effect of receipt reversals and only
  completed sales/returns; every completed sale with `due_piasters > 0`
  contributes, whether its status is `credit` or `partial`;
- supplier balance from purchases and supplier ledger entries;
- shift expected cash from opening cash plus cash-only ledger entries whose
  `shift_id` equals that shift;
- sale totals from persisted line totals, tax, discounts, and rounding;
- audit/ledger append-only and foreign-key invariants.
- stock movement reversals and compensation rows, including exact mirrored
  quantity/value effects;
- no product has `on_hand_qty = 0` with `on_hand_value <> 0`;
- revaluation settlements and reported cost variance reconcile exactly.

It must return a non-zero exit code and an actionable error when any invariant
does not hold.

### 4.3 Database triggers

Migrations must add triggers that reject `UPDATE` and `DELETE` on:

- `stock_movements`;
- `money_ledger`;
- `audit_log`.
- `sale_items`;
- `purchase_items`;
- `sale_return_items`.

Migrations must also add guarded `UPDATE` triggers on `sales`, `purchases`, and
`sale_returns`. These triggers allow changes only to `status`, `updated_at`,
and the `voided_at`, `voided_by_user_id`, and `void_reason` columns. Paid, due,
total, line, cost, customer, and other historical fields are immutable after
insert.

The trigger error text should be a stable internal code. User-facing Arabic
translation belongs in the service/IPC layer.

### 4.4 Party and direction checks

Database `CHECK` constraints plus service validation must enforce:

- customer entries use a customer and permitted entry type;
- supplier entries use a supplier and permitted entry type;
- a sale payment references the sale or is an account-level customer receipt;
- a purchase payment references its purchase through `reference_type` and
  `reference_id`, or is an account-level supplier payment;
- `direction = 'in'` and `direction = 'out'` agree with the entry type;
- `payment_method` is never `credit`;
- cash-only shift calculations ignore card and wallet entries.
- A void is blocked when `features.shifts` is enabled and there is no current
  open shift.
- `due_piasters > 0` requires `customer_id`.
- `credited_to_account_piasters > 0` requires `customer_id`.
- Non-cash tendered amounts cannot exceed the sale due amount. Cash may exceed
  due only when the excess is explicitly recorded as change.

## 5. Transaction boundaries

Every listed operation is one SQLite transaction:

### Complete sale

1. Validate settings, permissions, customer requirement, stock policy, and
   optional expired-item override.
2. Allocate the never-reused invoice number from `device_sequences`.
3. Calculate line discounts, proportional invoice discount allocation, tax,
   cash rounding, paid/due snapshots, and weighted-average cost.
4. Insert `sales` and `sale_items`.
5. Insert stock movement rows, possibly multiple FEFO rows per sale line.
6. Insert net received money-ledger rows; store tendered/change snapshots.
7. Insert audit rows and update the current shift relationship.

### Purchase

Insert purchase header/items, positive stock movements, optional batch rows,
supplier/payment ledger entries, and audit rows atomically.

### Sale return

Validate against original invoice and prior returns, insert return rows,
restore or remove stock based on immutable condition, insert refund ledger rows
in the current open shift, and audit atomically.

### Void

Mark the document voided and insert compensation rows in the **current open
shift**. Never write compensation retroactively into a closed shift. Preserve
the original document, lines, costs, and historical snapshots.

If `features.shifts` is enabled, a void cannot be posted unless a current open
shift exists. Stock compensation uses `stock_movements.movement_type =
'void_compensation'` and `reverses_movement_id`; money compensation uses
`money_ledger.reverses_entry_id`. Compensation rows mirror the original quantity/value magnitude or signed money
effect and apply the inverse signed effect.

Additional void rules:

- A sale with completed returns cannot be voided; all completed returns must be
  voided first.
- Customer receipt entries linked to a voided credit sale remain in the
  append-only ledger and become account credit; they are not deleted or
  silently excluded.
- Voiding a purchase whose stock was already sold follows
  `features.allow_negative_stock`: it is allowed with the configured warning
  and audit/override policy when enabled, and blocked when disabled.

### Stock count and expense

Posting a count inserts movement differences and audit in one transaction.
Posting an expense inserts the expense, money-ledger row, and audit together.

### Supplier payments and expenses

For supplier cash payments and expenses, the UI asks: **“paid from the
drawer?”** If the answer is yes, the money-ledger row uses the current
`shift_id`; if no, `shift_id` is `NULL`. Expected shift cash counts only cash
ledger entries whose `shift_id` equals that shift. Card and wallet entries,
and cash entries paid outside the drawer, do not affect expected drawer cash.

### Restore

Restore first preserves the current database as a safety backup. After the
backup is restored, the service increases all three device sequences
(`sale_invoice`, `purchase`, and `sale_return`) by `1000`, writes one audit row
describing the restore and all sequence bumps,
and warns the user that invoice numbers issued after the restored backup may
have been lost. The restored database remains the source of truth; no
financial rows are deleted to resolve the numbering gap.

## 6. Pure domain functions for `src/domain/`

All functions return `Result<T, DomainError>`, never expected exceptions. Inputs
contain all values needed for deterministic calculation. IDs, timestamps, and
settings are passed in by services.

### 6.1 Safe integer and rounding

#### `safeInteger(value, label)`

- **Input:** unknown or number plus a field label.
- **Output:** `Result<number, InvalidMoney | InvalidQuantity | Overflow>`.
- **Rules:** finite safe integer only; no implicit floating-point conversion.
- **Tests:** strings, NaN, infinity, fractions, unsafe integers, min/max safe
  values.

#### `roundHalfUp(numerator, denominator)`

- **Input:** signed integer numerator and positive integer denominator.
- **Output:** `Result<integer, InvalidRate | Overflow>`.
- **Rules:** one shared half-up implementation; exact division stays exact.
- **Tests:** positive/negative halves, zero, denominator one, invalid
  denominator, overflow.

#### `mulDivRoundHalfUp(a, b, c)`

- **Input:** signed safe integers `a` and `b`, and positive safe integer `c`.
- **Output:** `Result<number, InvalidRate | Overflow>`.
- **Rules:** multiply and divide with `BigInt` internally, then return a
  JavaScript safe integer. Half-up for negative values means half away from
  zero. This is the required helper for every multiply-then-divide operation,
  including tax, cost, and proportional allocation.
- **Tests:** positive and negative exact values, both signs at a half,
  denominator one, invalid denominator, safe-boundary results, intermediate
  products larger than `Number.MAX_SAFE_INTEGER`, and final-result overflow.

### 6.2 Packaging and line quantities

#### `convertUnitToBaseQty(displayedQty, baseQtyPerUnit)`

- **Input:** positive integer displayed quantity and positive integer factor.
- **Output:** `qty_base` integer.
- **Rules:** multiplication only; reject overflow and non-positive values.
- **Tests:** piece unit factor 1, carton factor 12, measured quantity, zero,
  negative, overflow.

#### `calculateLineSubtotal(unitPricePiasters, qtyBase, pricedUnitQtyBase)`

- **Input:** non-negative price, positive base quantity, and positive
  `priced_unit_qty_base`.
- **Output:** integer piaster subtotal.
- **Rules:** `mulDivRoundHalfUp(unitPricePiasters, qtyBase,
  pricedUnitQtyBase)`; no floating point.
- **Tests:** piece, kilogram, carton, 350 g at 12,000 piasters/kg = 4,200,
  zero price, invalid denominator, large intermediate product, overflow.

### 6.3 Discounts, tax, and totals

#### `calculateDiscountAmount(basePiasters, discount)`

- **Input:** base amount and fixed-piaster or basis-point percentage discount.
- **Output:** capped integer discount.
- **Rules:** half-up for percentage; no negative discount; cannot exceed base.
- **Tests:** zero, fixed, percentage, 100%, over-100%, remainder, invalid input.

#### `allocateProportionally(totalToAllocate, weights, tieBreakOrder)`

- **Input:** non-negative total and non-negative integer weights.
- **Output:** integer allocations whose sum equals the total.
- **Rules:** largest-remainder allocation; stable tie-break by line index.
- **Tests:** zero weights, one line, equal weights, remainder, ties, total
  smaller than line count, overflow.

#### `calculateLineAmounts(lineInputs, invoiceDiscount, taxPolicy)`

- **Input:** line prices/quantities and line discounts, invoice discount,
  tax-inclusive policy.
- **Output:** per-line subtotal, line discount, allocated invoice discount,
  taxable/base amount, tax, final line total.
- **Rules:** line discounts first; invoice discount allocated proportionally
  by largest remainder; all allocations persisted per line.
- **Tests:** empty input, mixed line values, equal ties, zero-price line,
  discount cap, tax disabled/enabled, rounding residual.

#### `calculateTaxInclusiveBreakdown(finalLineAmount, taxRateBps, enabled)`

- **Input:** tax-inclusive line amount, rate, feature flag.
- **Output:** net amount and tax piasters.
- **Rules:** half-up reverse-tax calculation using `mulDivRoundHalfUp`;
  disabled tax returns tax zero.
- **Tests:** zero tax, exact rates, remainder, 100%, invalid rate, large
  intermediate product.

#### `calculateSaleTotals(lines, cashRoundingStepPiasters)`

- **Input:** finalized line amounts and cash rounding setting.
- **Output:** subtotal, discounts, tax, pre-round total, rounding adjustment,
  final total.
- **Rules:** totals equal persisted line sums; rounding adjustment is stored in
  `sales.rounding_adjustment_piasters`. Canonically,
  `sales.total_piasters = SUM(final_line_total_piasters) +
  rounding_adjustment_piasters`.
- **Tests:** empty sale, one line, multiple lines, exact step, up/down
  adjustment, step zero, invalid step.

#### `roundCashTotal(totalPiasters, stepPiasters)`

- **Input:** non-negative total and non-negative rounding step.
- **Output:** `Result<{ roundedTotalPiasters, adjustmentPiasters }, DomainError>`.
- **Rules:** step zero means unchanged; otherwise round half-up to the
  configured step using integer arithmetic.
- **Tests:** step zero, already rounded, halfway, below/above midpoint, total
  smaller than step, invalid step.

### 6.4 Payments, customer balances, and change

#### `calculatePaymentAllocation(totalPiasters, tenderedPayments, customer)`

- **Input:** sale total, cash/card/wallet tendered amounts, optional customer.
- **Output:** net ledger entries, `paid_piasters`, `due_piasters`, status,
  tendered and change snapshots.
- **Rules:** credit is not a method; credit sale requires a customer; overpay
  becomes change; ledger records net received. Non-cash tendered amounts may
  not exceed `due_piasters`; only cash may exceed due, and the excess becomes
  explicit change. Any sale with `due_piasters > 0`, including a partial
  payment, requires a customer. The sale service enforces the customer's
  nullable credit limit: `NULL` is unlimited, `0` blocks credit, and a
  positive limit blocks balances above the limit unless an audited
  manager/owner override is granted.
- **Tests:** exact cash, change, partial credit, mixed methods, card/wallet,
  no-customer credit rejection, negative values, non-cash over-due rejection,
  overpayment.

#### `calculateCustomerBalance(entries)`

- **Input:** credit-sale obligations, account-level customer receipts, and
  credited return entries.
- **Output:** signed balance and status (`settled`, `due`, `credit`).
- **Rules:** sum `due_piasters` for every completed sale where
  `due_piasters > 0` (both `credit` and `partial`), subtract the
  net signed effect of customer-receipt ledger rows including their
  `reverses_entry_id` compensations, and subtract credited amounts from
  completed returns. No balance field is manually edited.
- **Tests:** empty, completed credit sale, voided credit sale, receipt later,
  partial-payment sale, voided receipt, cash refund, credited return, voided
  return, overpayment, and reversal compensation.

#### `calculateSupplierBalance(entries)`

- **Input:** purchase obligations, supplier payment entries, and compensations.
- **Output:** signed payable balance and summary.
- **Rules:** integer piasters; purchase returns are deferred.
- **Tests:** cash, credit, partial payment, void, empty, overpayment.

### 6.5 Weighted-average costing and optional FEFO

#### `calculateOnHand(movements)`

- **Input:** signed `qty_delta` and `value_delta_piasters`.
- **Output:** `on_hand_qty`, `on_hand_value`.
- **Rules:** simple signed sums; reject incompatible product identity.
- **Tests:** purchase/sale/return/damage/count, zero result, negative stock,
  and the sell-more-than-on-hand → purchase → sell sequence ending with both
  on-hand quantity and value exactly zero.

#### `calculateNegativeStockSettlement(onHandQty, onHandValuePiasters, incomingQtyBase, incomingUnitCostPiasters, priceUnitQtyBase)`

- **Input:** pre-purchase on-hand quantity/value, incoming quantity, incoming
  cost per priced unit, and the product price-unit quantity.
- **Output:** `Result<{ settledQty, settledValuePiasters, revaluationPiasters,
  costVariancePiasters }, DomainError>`.
- **Rules:** when a purchase moves quantity from negative to zero or positive,
  append a `revaluation` movement so the resulting on-hand value equals
  `on_hand_qty * incoming unit cost`; value is exactly zero when quantity is
  zero. `costVariancePiasters = -revaluationPiasters`; positive variance is
  extra cost and reduces gross profit.
- **Tests:** after selling 8 with 5 on hand (quantity `-3`, value `-300`),
  purchasing 3 at 120 yields quantity `0`, value `60`, revaluation `-60`,
  and cost variance `+60`; purchasing 3 at 80 yields value `-60`,
  revaluation `+60`, and cost variance `-60`; purchasing 10 at 120 yields
  quantity `7`, value `900`, revaluation `-60`, and final value `840`.
  Also test no-op positive stock, zero-crossing, overflow, and invalid
  price-unit quantity.

#### `calculateOutgoingCost(onHandQty, onHandValuePiasters, qtyBase, defaultCostPiasters, priceUnitQtyBase)`

- **Signature:** `calculateOutgoingCost(onHandQty, onHandValuePiasters,
  qtyBase, defaultCostPiasters, priceUnitQtyBase)`.
- **Input:** current weighted-average quantity/value, outgoing base quantity,
  product default cost per priced unit, and `price_unit_qty_base`.
- **Output:** integer outgoing cost.
- **Rules:** if `on_hand_qty > 0` and `on_hand_value > 0`, use the weighted
  average for a partial outgoing quantity, return exactly `on_hand_value` when
  the outgoing quantity removes all on-hand stock, and for
  `qtyBase > on_hand_qty` charge all on-hand value plus the remainder at
  `mulDivRoundHalfUp(defaultCostPiasters, remainder, priceUnitQtyBase)`.
  If `on_hand_qty <= 0` or `on_hand_value <= 0`, use
  `mulDivRoundHalfUp(defaultCostPiasters, qtyBase, priceUnitQtyBase)`.
  This function is used for sales, damage, negative count differences, and
  negative adjustments.
- **Tests:** exact full depletion, partial outgoing quantity, outgoing quantity
  larger than stock, damage, negative count difference, negative adjustment,
  zero/negative stock, non-positive on-hand value, counted-item fallback with
  price unit `1`, measured-item fallback with price unit `1000`, zero default
  cost, large intermediate product, overflow, and a count that brings quantity
  to zero while leaving value exactly `0`.

#### `calculateReturnStockValue(originalCostPiasters, returnedQtyBase, originalQtyBase, alreadyReturnedQtyBase, alreadyRestockedValuePiasters)`

- **Input:** original sale-line cost, current return quantity, original sale
  quantity, already returned quantity, and already restocked value.
- **Output:** integer stock value.
- **Rules:** compute cumulative target value minus already restocked value:
  `mulDivRoundHalfUp(originalCostPiasters, alreadyReturnedQtyBase +
  returnedQtyBase, originalQtyBase) - alreadyRestockedValuePiasters`.
- **Tests:** partial return, full return, one-by-one 1001/3 returns producing
  `334`, `333`, `334` and cumulative targets `334`, `667`, `1001`, cumulative
  exactness, invalid quantities, large intermediate product, overflow.

#### `calculateReturnRefund(finalLineTotalPiasters, returnedQtyBase, originalQtyBase, alreadyReturnedQtyBase, refundedSoFarPiasters)`

- **Input:** final line total, current return quantity, original quantity,
  already returned quantity, and already refunded amount.
- **Output:** exact refund for the current return.
- **Rules:** cumulative target minus refunded-so-far using
  `mulDivRoundHalfUp`; the sum of all returns cannot exceed the final line
  total and a full return refunds exactly the remaining amount.
- **Tests:** 1001 piasters over 3 units returns `334`, `333`, `334`, with
  cumulative targets `334`, `667`, `1001`, never exceeding 1001, full return,
  duplicate/over-return, and overflow.

#### `allocateFefoBatches(requestedQtyBase, batches, now)`

- **Input:** requested quantity, batch quantities/expiry dates, current time.
- **Output:** ordered batch allocations and remaining quantity.
- **Rules:** only enabled batch workflows call this function; earliest expiry
  first, stable receipt/ULID tie-break; expired batches are excluded unless an
  explicit manager/owner override with reason is supplied outside the pure
  selector. After selection, allocate the sale line's cost across selected
  batch movement rows proportionally by batch quantity using largest remainder;
  the resulting movement values must sum exactly to `line_cost_piasters`.
  Resalable returns use the original sale movement batches with the same
  largest-remainder proportional allocation.
- **Tests:** one batch, multiple expiry dates, equal expiry tie, insufficient
  stock, all expired, override input, zero request, proportional cost
  allocation, remainder tie by batch order, exact total value.

### 6.6 Shifts, returns, voids, and reports

#### `calculateExpectedShiftCash(openingCash, ledgerEntries)`

- **Input:** opening cash and posted money-ledger entries for the target
  `shift_id`.
- **Output:** expected closing cash and breakdown.
- **Rules:** include only cash entries whose `shift_id` equals the target
  shift; card/wallet entries and cash entries with another or null
  `shift_id` are excluded. Compensating reverse entries are included as
  ordinary signed cash effects.
- **Tests:** no activity, sale, refund, expense, manual cash in/out, void
  compensation, cash paid outside the drawer, wrong-shift cash, and non-cash
  entries.

#### `reconcileShiftCash(expectedCash, countedCash)`

- **Input:** expected and counted piasters.
- **Output:** signed difference and balanced/short/over status.
- **Rules:** no rounding.
- **Tests:** exact, shortage, overage, zero, invalid negative count.

#### `validateReturnQty(originalQty, alreadyReturnedQty, requestedQty)`

- **Input:** base-unit integer quantities.
- **Output:** `Result<{ remainingQty }, DomainError>`.
- **Rules:** requested return cannot exceed remaining original quantity.
- **Tests:** partial, full, duplicate, over-return, zero/negative.

#### `calculateVoidCompensation(document, currentOpenShiftId)`

- **Input:** immutable document effects and current open shift identity.
- **Output:** compensating stock and money-ledger entries.
- **Rules:** compensation uses current open shift only; original snapshots are
  reused; already voided documents are rejected. A sale with completed returns
  is rejected until those returns are voided. Receipts linked to a voided
  credit sale remain as account credit.
  Voiding a purchase after its stock was sold follows the negative-stock
  feature policy.
- **Tests:** paid/credit/mixed sale, partial-payment sale, sale with completed
  return, void returns first then sale, expense, purchase after stock was sold
  with negative stock enabled/disabled, purchase that triggered a revaluation
  and reversal of that revaluation through `reverses_movement_id`, closed
  prior shift, no open shift, already voided.

#### `calculateProfitSummary(saleLines, returns, voids)`

- **Input:** persisted final line totals and cost snapshots.
- **Output:** revenue, discount, cost, gross profit, margin basis points.
- **Rules:** use stored final line values and `line_cost_piasters`, never
  current prices. Resalable returns reverse their original line cost because
  they re-enter stock; damaged returns reverse no cost because they create no
  stock movement, so the original cost remains a loss. Include
  `costVariancePiasters = -revaluationPiasters` from negative-stock
  revaluation settlements; positive variance reduces gross profit.
- **Tests:** profit, loss, resalable return cost recovery, damaged return with
  no cost recovery, negative-stock variance `60` and `-60`, voids, zero
  revenue, zero cost.

#### `calculateStockValue(onHandRows)`

- **Input:** weighted-average on-hand quantity/value rows.
- **Output:** total integer piaster stock value and product breakdown.
- **Rules:** use ledger value; define negative-stock reporting policy explicitly.
- **Tests:** empty, mixed products, negative value, zero quantity.

## 7. Required invariants and test strategy

Every pure function gets a colocated `*.test.ts`. Tests use integer literals,
fixed inputs, and explicit expected outputs; they never read the system clock or
database.

Required invariants:

- Every successful total equals the sum of its persisted parts.
- Every proportional allocation sums exactly to its requested total.
- Every payment allocation conserves money; change is explicit.
- Customer balance recomputes from account ledger entries.
- Stock quantity and value equal signed movement sums.
- Sale cost follows weighted-average rules and exact full-depletion behavior.
- Sequence costing remains exact across negative stock: sell more than
  on-hand, purchase the missing quantity, then sell again; when on-hand
  quantity reaches zero, on-hand value must also be exactly zero.
- FEFO allocations never exceed requested or available quantity.
- Return quantity never exceeds original quantity, and cumulative refund and
  restocked-cost allocations are exact and never exceed their original line
  values.
- Expected cash equals opening cash plus cash-only ledger inflows minus
  outflows.
- Void compensation nets the original stock and money effects, while remaining
  in the current open shift.
- Append-only and foreign-key invariants are checked by `db:verify`.

## 8. Decisions

The current implementation decisions are:

- Cash rounding defaults to `0`; when configured, it rounds half-up to the
  configured step.
- The bundled SQLite runtime must satisfy `sqlite_version() >= 3.37` for
  `STRICT` tables.
- The base unit is a name only (`products.base_unit_name`); there is no base
  unit catalog table.
- Payment methods are configurable and initially include cash, card, and
  wallet. Wallet payments may carry a free-text reference.
- Supplier payments are account-level in slice 1b; purchase returns are
  deferred.
- Negative stock is flagged in a needs-review list and is never reported as a
  negative stock value. When a purchase settles negative quantity, a
  `revaluation` movement makes the resulting value exact and its difference is
  reported as cost variance.
- When `features.shifts` is enabled, sales require an open shift. Otherwise
  `sales.shift_id` is `NULL`.
- Invoice, purchase, and return numbers are six-digit, zero-padded values from
  the `sale_invoice`, `purchase`, and `sale_return` sequences respectively.
- Permission codes are:
  `sale.zero_price`, `sale.expired_override`,
  `stock.negative_override`, `cash.manual_move`, `document.void`,
  `product.price_change`, and `product.cost_change`. Owner and manager have
  all of them; cashier has none.
- The Arabic glossary remains pending shop-owner confirmation.
- Cairo is bundled locally as WOFF2 subsets with its OFL license file.

Future open question: define the format and handling of price-embedded
barcodes produced by weighing scales.

## 9. Explicit non-goals

- No migrations.
- No `src/domain/` implementation.
- No repositories, services, or `db:verify` command implementation.
- No renderer screens or design-token implementation.
- No purchase returns in the first schema slice.
- No FIFO costing; optional batches use FEFO selection.
- No double-entry accounting, LAN sync, cloud sync, government e-invoicing,
  or enterprise approval workflows.
