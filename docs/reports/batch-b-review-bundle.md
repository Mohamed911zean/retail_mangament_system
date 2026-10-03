# Batch B review bundle

## 1. Mandatory report

### A. Commits

- 299722c Complete repository basic operations
- 588d675 Add Batch B review bundle
- 7a2b93a Document Batch B database layer
- 97e4b72 Add database repositories and transaction helpers
- b6b8266 Add database verification
- f39f20d Add developer database scripts
- 3049c7b Test migration runner integrity and packaging
- a40657f Add append-only database triggers
- 12d6af8 Add Phase 1 database migrations
- 446ced7 Verify bundled SQLite version
- ca41ea7 Record stock normalization decision
- f0a2887 Amend inventory valuation invariants
- f7941aa Fix strict domain fixture typing
- 0670477 Align Phase 1 domain contracts documentation
- f7fe69e Implement inventory and profit reports domain
- de2fe1d Implement void compensation domain
- 22303f4 Implement shift cash domain
- ea80c8f Implement FEFO batch allocation domain
- 6a38651 Implement cumulative returns domain
- a3bd00e Implement weighted inventory domain
- 0350031 Implement account balance domain
- 2f7ad8f Implement payment allocation domain
- d7f72eb Implement pricing and sale totals domain
- ee6e781 phase 1 docs
- ea454d7 Implement domain result and integer rounding foundation
- 87cb2da feat: complete Phase 0 licensing and packaging
- 61c71f3 feat: integrate app licensing
- 2b191c7 feat: add external license generator
- 188ab5a feat: add license foundation
- b59972d design system files

### B. Test counts per file + total

- src\domain\allocation.test.ts: 9 passed
- src\domain\balances.test.ts: 14 passed
- src\domain\cashRounding.test.ts: 11 passed
- src\domain\discount.test.ts: 9 passed
- src\domain\fefo.test.ts: 5 passed
- src\domain\integer.test.ts: 6 passed
- src\domain\inventory.test.ts: 33 passed
- src\domain\lineAmounts.test.ts: 5 passed
- src\domain\payments.test.ts: 9 passed
- src\domain\pricing.property.test.ts: 1 passed
- src\domain\pricing.test.ts: 12 passed
- src\domain\quantity.test.ts: 7 passed
- src\domain\reports.test.ts: 3 passed
- src\domain\returns.test.ts: 12 passed
- src\domain\rounding.test.ts: 9 passed
- src\domain\saleTotals.test.ts: 2 passed
- src\domain\shifts.test.ts: 5 passed
- src\domain\tax.test.ts: 8 passed
- src\domain\voids.test.ts: 5 passed
- src\main\database\backup.test.ts: 1 passed
- src\main\database\db-cli.test.ts: 2 passed
- src\main\database\db-verify.test.ts: 1 passed
- src\main\database\migration-runner.test.ts: 3 passed
- src\main\database\migration.test.ts: 1 passed
- src\main\database\sqlite-version.test.ts: 1 passed
- src\main\database\triggers.test.ts: 2 passed
- src\main\license\license-service.test.ts: 6 passed
- src\main\printing\printing.test.ts: 1 passed
- src\main\sales\fake-sale.test.ts: 4 passed
- src\shared\license\license.test.ts: 5 passed
- src\main\database\repositories\repositories.test.ts: 2 passed
- Total: 194 passed

### C. Contradictions / schema deviations found

- The frozen schema has no stored customer or supplier balance columns; verification recomputes ledger inputs but cannot compare a stored balance.
- The schema introduction describes common columns as exact for every table, while explicit append-only and sequence table definitions use their own column sets; the explicit table definitions were followed.
- Phase 0 smoke tables have incompatible shapes and are intentionally dropped/replaced by migration 0003.

### D. Decisions made where schema doc was silent

- SQLite 3.53.4 was verified; repositories use synchronous better-sqlite3 handles with transaction handles supplied by services.
- Stable verifier codes are documented in docs/database.md.
- db:reset is restricted to .dev-data/dev.db.

### E. WHAT I RAN

- `npx vitest run src/main/database/sqlite-version.test.ts` - passed; bundled SQLite 3.53.4.
- `npx vitest run src/main/database/db-cli.test.ts` - passed.
- `npx vitest run src/main/database/db-verify.test.ts` - passed.
- `npx vitest run src/main/database/repositories/repositories.test.ts` - passed.
- `npm test` - passed; 31 files, 194 tests.
- `npm run lint` - passed.
- `npm run build` - passed.
- `npm run db:migrate` then `npm run db:verify` - passed; verifier returned `{ ok: true, errors: [] }`.
- `npx electron-builder --win --x64 --dir --config.directories.output=release\batch-b-review-unpacked` - passed; migrations are included in app.asar.

### F. WHAT I COULD NOT VERIFY

- Real weak Windows 10 hardware, physical thermal/A4 printing, and a real installer launch were not verified in this batch.
- The standard package output was previously blocked by a locked existing app.asar; the alternate output directory package command passed.

### G. Known limitations / things deliberately not done

- No services, IPC, UI, or domain changes were made in Batch B.
- Repository methods are synchronous internally because better-sqlite3 is synchronous; the handle boundary is isolated for later service adaptation.
- Full business transaction orchestration is deferred to Batch C.

## 2. New migration 0003_phase1a_core.sql

``sql
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS app_metadata;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string','integer','boolean','json')),
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','cashier')),
  is_active INTEGER NOT NULL CHECK (is_active IN (0,1)),
  last_login_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  credit_limit_piasters INTEGER CHECK (credit_limit_piasters IS NULL OR credit_limit_piasters >= 0),
  metadata TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  metadata TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  base_unit_name TEXT NOT NULL,
  qty_scale INTEGER NOT NULL CHECK (qty_scale IN (0,3)),
  price_unit_qty_base INTEGER NOT NULL CHECK (price_unit_qty_base > 0 AND (qty_scale <> 0 OR price_unit_qty_base = 1)),
  cost_price_piasters INTEGER NOT NULL CHECK (cost_price_piasters >= 0),
  selling_price_piasters INTEGER NOT NULL CHECK (selling_price_piasters >= 0),
  tax_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_bps BETWEEN 0 AND 10000),
  track_expiry INTEGER NOT NULL CHECK (track_expiry IN (0,1)),
  is_weighted INTEGER NOT NULL CHECK (is_weighted IN (0,1)),
  low_stock_threshold_qty INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_threshold_qty >= 0),
  metadata TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS product_units (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  unit_name TEXT NOT NULL,
  base_qty_per_unit INTEGER NOT NULL CHECK (base_qty_per_unit > 0),
  selling_price_piasters INTEGER NOT NULL CHECK (selling_price_piasters >= 0),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS barcodes (
  id TEXT PRIMARY KEY,
  barcode TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_unit_id TEXT REFERENCES product_units(id),
  is_primary INTEGER NOT NULL CHECK (is_primary IN (0,1)),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS stock_batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  batch_code TEXT,
  expiry_at INTEGER,
  received_at INTEGER NOT NULL,
  initial_qty_base INTEGER NOT NULL CHECK (initial_qty_base > 0),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  opening_cash_piasters INTEGER NOT NULL CHECK (opening_cash_piasters >= 0),
  expected_cash_piasters INTEGER,
  counted_cash_piasters INTEGER CHECK (counted_cash_piasters >= 0),
  difference_piasters INTEGER,
  status TEXT NOT NULL CHECK (status IN ('open','closed','voided')),
  closing_notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  shift_id TEXT REFERENCES shifts(id),
  subtotal_piasters INTEGER NOT NULL CHECK (subtotal_piasters >= 0),
  line_discount_piasters INTEGER NOT NULL CHECK (line_discount_piasters >= 0),
  invoice_discount_piasters INTEGER NOT NULL CHECK (invoice_discount_piasters >= 0),
  tax_piasters INTEGER NOT NULL CHECK (tax_piasters >= 0),
  rounding_adjustment_piasters INTEGER NOT NULL DEFAULT 0,
  total_piasters INTEGER NOT NULL CHECK (total_piasters >= 0),
  paid_piasters INTEGER NOT NULL CHECK (paid_piasters >= 0),
  due_piasters INTEGER NOT NULL CHECK (due_piasters >= 0),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid','partial','credit')),
  status TEXT NOT NULL CHECK (status IN ('completed','voided')),
  voided_at INTEGER,
  voided_by_user_id TEXT REFERENCES users(id),
  void_reason TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  UNIQUE(device_id, invoice_number),
  CHECK (paid_piasters + due_piasters = total_piasters),
  CHECK (due_piasters = 0 OR customer_id IS NOT NULL)
) STRICT;

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  unit_name_snapshot TEXT NOT NULL,
  priced_unit_qty_base INTEGER NOT NULL CHECK (priced_unit_qty_base > 0),
  qty_base INTEGER NOT NULL CHECK (qty_base > 0),
  unit_price_piasters INTEGER NOT NULL CHECK (unit_price_piasters >= 0),
  line_subtotal_piasters INTEGER NOT NULL CHECK (line_subtotal_piasters >= 0),
  line_discount_piasters INTEGER NOT NULL CHECK (line_discount_piasters >= 0),
  invoice_discount_allocated_piasters INTEGER NOT NULL CHECK (invoice_discount_allocated_piasters >= 0),
  tax_rate_bps_snapshot INTEGER NOT NULL CHECK (tax_rate_bps_snapshot BETWEEN 0 AND 10000),
  tax_piasters INTEGER NOT NULL CHECK (tax_piasters >= 0),
  final_line_total_piasters INTEGER NOT NULL CHECK (final_line_total_piasters >= 0),
  line_cost_piasters INTEGER NOT NULL CHECK (line_cost_piasters >= 0),
  product_name_snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  CHECK (final_line_total_piasters = line_subtotal_piasters - line_discount_piasters - invoice_discount_allocated_piasters)
) STRICT;

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  batch_id TEXT REFERENCES stock_batches(id),
  qty_delta INTEGER NOT NULL,
  value_delta_piasters INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase','sale','sale_return','adjustment','damage','count','void_compensation','revaluation')),
  reverses_movement_id TEXT REFERENCES stock_movements(id),
  reference_type TEXT,
  reference_id TEXT,
  occurred_at INTEGER NOT NULL,
  reason TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  CHECK (qty_delta <> 0 OR (movement_type = 'revaluation' AND value_delta_piasters <> 0)),
  CHECK (movement_type <> 'revaluation' OR qty_delta = 0),
  CHECK (movement_type <> 'revaluation' OR batch_id IS NULL)
) STRICT;

CREATE TABLE IF NOT EXISTS money_ledger (
  id TEXT PRIMARY KEY,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('sale_payment','customer_receipt','sale_return_refund','purchase_payment','supplier_payment','expense','cash_in','cash_out','void_compensation')),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount_piasters INTEGER NOT NULL CHECK (amount_piasters > 0),
  payment_method TEXT CHECK (payment_method IN ('cash','card','wallet')),
  customer_id TEXT REFERENCES customers(id),
  supplier_id TEXT REFERENCES suppliers(id),
  sale_id TEXT REFERENCES sales(id),
  reference_type TEXT,
  reference_id TEXT,
  reverses_entry_id TEXT REFERENCES money_ledger(id),
  shift_id TEXT REFERENCES shifts(id),
  reference_text TEXT,
  tendered_piasters INTEGER,
  change_piasters INTEGER,
  occurred_at INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS held_sales (
  id TEXT PRIMARY KEY,
  label TEXT,
  user_id TEXT NOT NULL REFERENCES users(id),
  shift_id TEXT REFERENCES shifts(id),
  customer_id TEXT REFERENCES customers(id),
  payload_json TEXT NOT NULL,
  held_at INTEGER NOT NULL,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  changed_fields_json TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS device_sequences (
  device_id TEXT NOT NULL,
  sequence_name TEXT NOT NULL CHECK (sequence_name IN ('sale_invoice','purchase','sale_return')),
  next_value INTEGER NOT NULL CHECK (next_value > 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, sequence_name)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_barcodes_active_normalized
  ON barcodes(lower(trim(barcode))) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_active_sku
  ON products(sku) WHERE sku IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_open_shift_per_device
  ON shifts(device_id) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_movement_reversal
  ON stock_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_money_ledger_reversal
  ON money_ledger(reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS ix_product_units_product_id ON product_units(product_id);
CREATE INDEX IF NOT EXISTS ix_barcodes_product_id ON barcodes(product_id);
CREATE INDEX IF NOT EXISTS ix_barcodes_product_unit_id ON barcodes(product_unit_id);
CREATE INDEX IF NOT EXISTS ix_stock_batches_product_id ON stock_batches(product_id);
CREATE INDEX IF NOT EXISTS ix_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS ix_stock_movements_batch_id ON stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS ix_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS ix_sales_shift_id ON sales(shift_id);
CREATE INDEX IF NOT EXISTS ix_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS ix_sale_items_product_id ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS ix_money_ledger_customer_id ON money_ledger(customer_id);
CREATE INDEX IF NOT EXISTS ix_money_ledger_supplier_id ON money_ledger(supplier_id);
CREATE INDEX IF NOT EXISTS ix_money_ledger_shift_id ON money_ledger(shift_id);
CREATE INDEX IF NOT EXISTS ix_held_sales_user_id ON held_sales(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_entity ON audit_log(entity_type, entity_id);

PRAGMA foreign_keys = ON;
````

## 2. New migration 0004_phase1b_purchases.sql

``sql
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  purchase_number TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  total_piasters INTEGER NOT NULL CHECK (total_piasters >= 0),
  paid_piasters INTEGER NOT NULL CHECK (paid_piasters >= 0),
  due_piasters INTEGER NOT NULL CHECK (due_piasters >= 0),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid','partial','credit')),
  status TEXT NOT NULL CHECK (status IN ('completed','voided')),
  voided_at INTEGER,
  voided_by_user_id TEXT REFERENCES users(id),
  void_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  UNIQUE(device_id, purchase_number),
  CHECK (paid_piasters + due_piasters = total_piasters)
) STRICT;

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  unit_name_snapshot TEXT NOT NULL,
  priced_unit_qty_base INTEGER NOT NULL CHECK (priced_unit_qty_base > 0),
  qty_base INTEGER NOT NULL CHECK (qty_base > 0),
  unit_cost_piasters INTEGER NOT NULL CHECK (unit_cost_piasters >= 0),
  line_subtotal_piasters INTEGER NOT NULL CHECK (line_subtotal_piasters >= 0),
  tax_rate_bps_snapshot INTEGER NOT NULL CHECK (tax_rate_bps_snapshot BETWEEN 0 AND 10000),
  tax_piasters INTEGER NOT NULL CHECK (tax_piasters >= 0),
  line_total_piasters INTEGER NOT NULL CHECK (line_total_piasters >= 0),
  batch_code_snapshot TEXT,
  expiry_at_snapshot INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS ix_purchase_items_purchase_id ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS ix_purchase_items_product_id ON purchase_items(product_id);
````

## 2. New migration 0005_phase1c_sale_returns.sql

``sql
CREATE TABLE IF NOT EXISTS sale_returns (
  id TEXT PRIMARY KEY,
  return_number TEXT NOT NULL,
  original_sale_id TEXT NOT NULL REFERENCES sales(id),
  customer_id TEXT REFERENCES customers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  shift_id TEXT REFERENCES shifts(id),
  total_piasters INTEGER NOT NULL CHECK (total_piasters >= 0),
  cash_refunded_piasters INTEGER NOT NULL DEFAULT 0 CHECK (cash_refunded_piasters >= 0),
  credited_to_account_piasters INTEGER NOT NULL DEFAULT 0 CHECK (credited_to_account_piasters >= 0),
  status TEXT NOT NULL CHECK (status IN ('completed','voided')),
  reason TEXT,
  voided_at INTEGER,
  voided_by_user_id TEXT REFERENCES users(id),
  void_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  UNIQUE(device_id, return_number),
  CHECK (cash_refunded_piasters + credited_to_account_piasters = total_piasters),
  CHECK (credited_to_account_piasters = 0 OR customer_id IS NOT NULL)
) STRICT;

CREATE TABLE IF NOT EXISTS sale_return_items (
  id TEXT PRIMARY KEY,
  sale_return_id TEXT NOT NULL REFERENCES sale_returns(id),
  sale_item_id TEXT NOT NULL REFERENCES sale_items(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  qty_base INTEGER NOT NULL CHECK (qty_base > 0),
  refund_piasters INTEGER NOT NULL CHECK (refund_piasters >= 0),
  condition TEXT NOT NULL CHECK (condition IN ('resalable','damaged')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_sale_returns_original_sale_id ON sale_returns(original_sale_id);
CREATE INDEX IF NOT EXISTS ix_sale_returns_customer_id ON sale_returns(customer_id);
CREATE INDEX IF NOT EXISTS ix_sale_returns_shift_id ON sale_returns(shift_id);
CREATE INDEX IF NOT EXISTS ix_sale_return_items_return_id ON sale_return_items(sale_return_id);
CREATE INDEX IF NOT EXISTS ix_sale_return_items_sale_item_id ON sale_return_items(sale_item_id);
CREATE INDEX IF NOT EXISTS ix_sale_return_items_product_id ON sale_return_items(product_id);
````

## 2. New migration 0006_phase1d_counts_expenses.sql

``sql
CREATE TABLE IF NOT EXISTS stock_counts (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('draft','posted','voided')),
  started_at INTEGER NOT NULL,
  posted_at INTEGER,
  user_id TEXT NOT NULL REFERENCES users(id),
  notes TEXT,
  voided_at INTEGER,
  voided_by_user_id TEXT REFERENCES users(id),
  void_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS stock_count_items (
  id TEXT PRIMARY KEY,
  stock_count_id TEXT NOT NULL REFERENCES stock_counts(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  expected_qty_base INTEGER NOT NULL,
  counted_qty_base INTEGER NOT NULL CHECK (counted_qty_base >= 0),
  difference_qty_base INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_piasters INTEGER NOT NULL CHECK (amount_piasters > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card','wallet')),
  expense_at INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  shift_id TEXT REFERENCES shifts(id),
  status TEXT NOT NULL CHECK (status IN ('posted','voided')),
  voided_at INTEGER,
  voided_by_user_id TEXT REFERENCES users(id),
  void_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS ix_stock_counts_user_id ON stock_counts(user_id);
CREATE INDEX IF NOT EXISTS ix_stock_count_items_count_id ON stock_count_items(stock_count_id);
CREATE INDEX IF NOT EXISTS ix_stock_count_items_product_id ON stock_count_items(product_id);
CREATE INDEX IF NOT EXISTS ix_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS ix_expenses_shift_id ON expenses(shift_id);
````

## 2. New migration 0007_append_only_triggers.sql

``sql
CREATE TRIGGER IF NOT EXISTS trg_stock_movements_no_update
BEFORE UPDATE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'immutable_stock_movement_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_stock_movements_no_delete
BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'immutable_stock_movement_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_money_ledger_no_update
BEFORE UPDATE ON money_ledger
BEGIN
  SELECT RAISE(ABORT, 'immutable_money_ledger_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_money_ledger_no_delete
BEFORE DELETE ON money_ledger
BEGIN
  SELECT RAISE(ABORT, 'immutable_money_ledger_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'immutable_audit_log_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'immutable_audit_log_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_items_no_update
BEFORE UPDATE ON sale_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_sale_item_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_sale_items_no_delete
BEFORE DELETE ON sale_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_sale_item_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_purchase_items_no_update
BEFORE UPDATE ON purchase_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_purchase_item_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_purchase_items_no_delete
BEFORE DELETE ON purchase_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_purchase_item_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_return_items_no_update
BEFORE UPDATE ON sale_return_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_sale_return_item_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_sale_return_items_no_delete
BEFORE DELETE ON sale_return_items
BEGIN
  SELECT RAISE(ABORT, 'immutable_sale_return_item_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_guarded_update
BEFORE UPDATE ON sales
WHEN OLD.id <> NEW.id
  OR OLD.invoice_number <> NEW.invoice_number
  OR OLD.customer_id IS NOT NEW.customer_id
  OR OLD.user_id <> NEW.user_id
  OR OLD.shift_id IS NOT NEW.shift_id
  OR OLD.subtotal_piasters <> NEW.subtotal_piasters
  OR OLD.line_discount_piasters <> NEW.line_discount_piasters
  OR OLD.invoice_discount_piasters <> NEW.invoice_discount_piasters
  OR OLD.tax_piasters <> NEW.tax_piasters
  OR OLD.rounding_adjustment_piasters <> NEW.rounding_adjustment_piasters
  OR OLD.total_piasters <> NEW.total_piasters
  OR OLD.paid_piasters <> NEW.paid_piasters
  OR OLD.due_piasters <> NEW.due_piasters
  OR OLD.payment_status <> NEW.payment_status
  OR OLD.notes IS NOT NEW.notes
  OR OLD.created_at <> NEW.created_at
  OR OLD.device_id <> NEW.device_id
BEGIN
  SELECT RAISE(ABORT, 'guarded_sales_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_sales_no_delete
BEFORE DELETE ON sales
BEGIN
  SELECT RAISE(ABORT, 'immutable_sales_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_purchases_guarded_update
BEFORE UPDATE ON purchases
WHEN OLD.id <> NEW.id
  OR OLD.purchase_number <> NEW.purchase_number
  OR OLD.supplier_id IS NOT NEW.supplier_id
  OR OLD.user_id <> NEW.user_id
  OR OLD.total_piasters <> NEW.total_piasters
  OR OLD.paid_piasters <> NEW.paid_piasters
  OR OLD.due_piasters <> NEW.due_piasters
  OR OLD.payment_status <> NEW.payment_status
  OR OLD.created_at <> NEW.created_at
  OR OLD.device_id <> NEW.device_id
BEGIN
  SELECT RAISE(ABORT, 'guarded_purchases_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_purchases_no_delete
BEFORE DELETE ON purchases
BEGIN
  SELECT RAISE(ABORT, 'immutable_purchases_delete');
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_returns_guarded_update
BEFORE UPDATE ON sale_returns
WHEN OLD.id <> NEW.id
  OR OLD.return_number <> NEW.return_number
  OR OLD.original_sale_id <> NEW.original_sale_id
  OR OLD.customer_id IS NOT NEW.customer_id
  OR OLD.user_id <> NEW.user_id
  OR OLD.shift_id IS NOT NEW.shift_id
  OR OLD.total_piasters <> NEW.total_piasters
  OR OLD.cash_refunded_piasters <> NEW.cash_refunded_piasters
  OR OLD.credited_to_account_piasters <> NEW.credited_to_account_piasters
  OR OLD.reason IS NOT NEW.reason
  OR OLD.created_at <> NEW.created_at
  OR OLD.device_id <> NEW.device_id
BEGIN
  SELECT RAISE(ABORT, 'guarded_sale_returns_update');
END;
CREATE TRIGGER IF NOT EXISTS trg_sale_returns_no_delete
BEFORE DELETE ON sale_returns
BEGIN
  SELECT RAISE(ABORT, 'immutable_sale_returns_delete');
END;
````

## 3. db:verify implementation

``typescript
import type Database from 'better-sqlite3'
import { calculateCustomerBalance, calculateSupplierBalance } from '../../domain/balances'
import { calculateExpectedShiftCash } from '../../domain/shifts'

export type VerifyError = {
  code:
    | 'db_foreign_key'
    | 'db_integrity'
    | 'stock_invariant_zero_value'
    | 'stock_invariant_negative_value'
    | 'sale_total_mismatch'
    | 'sale_paid_due_mismatch'
    | 'reversal_missing'
    | 'reversal_sign'
    | 'missing_append_only_trigger'
    | 'shift_cash_mismatch'
  message: string
  details?: unknown
}

export type VerifyReport = {
  ok: boolean
  errors: VerifyError[]
}

type ProductRow = { product_id: string; qty: number; value: number }
type SaleRow = {
  id: string
  total_piasters: number
  paid_piasters: number
  due_piasters: number
  rounding_adjustment_piasters: number
  item_total: number | null
}

function signedRows(
  database: Database.Database,
  query: string,
  parameters: unknown[] = [],
): { direction: 'in' | 'out'; amountPiasters: number }[] {
  return database.prepare(query).all(...parameters) as {
    direction: 'in' | 'out'
    amountPiasters: number
  }[]
}

export function verifyDatabase(database: Database.Database): VerifyReport {
  const errors: VerifyError[] = []
  const foreignKeys = database.pragma('foreign_key_check') as unknown[]
  if (foreignKeys.length > 0) {
    errors.push({ code: 'db_foreign_key', message: 'foreign_key_check returned violations', details: foreignKeys })
  }
  const integrity = database.pragma('integrity_check', { simple: true })
  if (integrity !== 'ok') {
    errors.push({ code: 'db_integrity', message: `integrity_check returned ${String(integrity)}` })
  }

  const products = database.prepare(`
    SELECT product_id, COALESCE(SUM(qty_delta), 0) AS qty,
           COALESCE(SUM(value_delta_piasters), 0) AS value
    FROM stock_movements
    GROUP BY product_id
  `).all() as ProductRow[]
  for (const product of products) {
    if (product.qty === 0 && product.value !== 0) {
      errors.push({
        code: 'stock_invariant_zero_value',
        message: `product ${product.product_id} has zero quantity and non-zero value`,
        details: product,
      })
    }
    if (product.qty > 0 && product.value < 0) {
      errors.push({
        code: 'stock_invariant_negative_value',
        message: `product ${product.product_id} has positive quantity and negative value`,
        details: product,
      })
    }
  }

  const sales = database.prepare(`
    SELECT sales.id, sales.total_piasters, sales.paid_piasters, sales.due_piasters,
           sales.rounding_adjustment_piasters,
           (SELECT COALESCE(SUM(final_line_total_piasters), 0)
              FROM sale_items WHERE sale_items.sale_id = sales.id) AS item_total
    FROM sales
  `).all() as SaleRow[]
  for (const sale of sales) {
    if ((sale.item_total ?? 0) + sale.rounding_adjustment_piasters !== sale.total_piasters) {
      errors.push({
        code: 'sale_total_mismatch',
        message: `sale ${sale.id} total does not match line totals plus rounding`,
        details: sale,
      })
    }
    if (sale.paid_piasters + sale.due_piasters !== sale.total_piasters) {
      errors.push({
        code: 'sale_paid_due_mismatch',
        message: `sale ${sale.id} paid plus due does not match total`,
        details: sale,
      })
    }
  }

  const movementReversals = database.prepare(`
    SELECT original.id AS original_id, original.qty_delta AS original_qty,
           original.value_delta_piasters AS original_value,
           reversal.id AS reversal_id, reversal.qty_delta AS reversal_qty,
           reversal.value_delta_piasters AS reversal_value
    FROM stock_movements AS reversal
    LEFT JOIN stock_movements AS original
      ON original.id = reversal.reverses_movement_id
    WHERE reversal.reverses_movement_id IS NOT NULL
  `).all() as {
    original_id: string | null
    original_qty: number | null
    original_value: number | null
    reversal_id: string
    reversal_qty: number
    reversal_value: number
  }[]
  for (const row of movementReversals) {
    if (row.original_id === null) {
      errors.push({ code: 'reversal_missing', message: `movement reversal ${row.reversal_id} points to no row` })
    } else if (
      row.original_qty === null ||
      row.original_value === null ||
      row.reversal_qty !== -row.original_qty ||
      row.reversal_value !== -row.original_value
    ) {
      errors.push({ code: 'reversal_sign', message: `movement reversal ${row.reversal_id} does not invert its original` })
    }
  }

  const ledgerReversals = database.prepare(`
    SELECT original.id AS original_id, original.direction AS original_direction,
           original.amount_piasters AS original_amount,
           reversal.id AS reversal_id, reversal.direction AS reversal_direction,
           reversal.amount_piasters AS reversal_amount
    FROM money_ledger AS reversal
    LEFT JOIN money_ledger AS original
      ON original.id = reversal.reverses_entry_id
    WHERE reversal.reverses_entry_id IS NOT NULL
  `).all() as {
    original_id: string | null
    original_direction: 'in' | 'out' | null
    original_amount: number | null
    reversal_id: string
    reversal_direction: 'in' | 'out'
    reversal_amount: number
  }[]
  for (const row of ledgerReversals) {
    if (row.original_id === null) {
      errors.push({ code: 'reversal_missing', message: `ledger reversal ${row.reversal_id} points to no row` })
    } else if (
      row.reversal_amount !== row.original_amount ||
      row.reversal_direction === row.original_direction
    ) {
      errors.push({ code: 'reversal_sign', message: `ledger reversal ${row.reversal_id} does not invert its original` })
    }
  }

  const triggerNames = new Set(
    (database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as { name: string }[])
      .map((row) => row.name),
  )
  const requiredTriggers = [
    'trg_stock_movements_no_update',
    'trg_stock_movements_no_delete',
    'trg_money_ledger_no_update',
    'trg_money_ledger_no_delete',
    'trg_audit_log_no_update',
    'trg_audit_log_no_delete',
    'trg_sale_items_no_update',
    'trg_sale_items_no_delete',
    'trg_purchase_items_no_update',
    'trg_purchase_items_no_delete',
    'trg_sale_return_items_no_update',
    'trg_sale_return_items_no_delete',
    'trg_sales_guarded_update',
    'trg_sales_no_delete',
    'trg_purchases_guarded_update',
    'trg_purchases_no_delete',
    'trg_sale_returns_guarded_update',
    'trg_sale_returns_no_delete',
  ]
  for (const trigger of requiredTriggers) {
    if (!triggerNames.has(trigger)) {
      errors.push({ code: 'missing_append_only_trigger', message: `required trigger ${trigger} is missing` })
    }
  }

  const customerIds = database.prepare(`
    SELECT id FROM customers
    WHERE EXISTS (SELECT 1 FROM sales WHERE customer_id = customers.id)
       OR EXISTS (SELECT 1 FROM money_ledger WHERE customer_id = customers.id)
       OR EXISTS (SELECT 1 FROM sale_returns WHERE customer_id = customers.id)
  `).all() as { id: string }[]
  for (const customer of customerIds) {
    const salesForCustomer = database.prepare(
      "SELECT status, due_piasters AS duePiasters FROM sales WHERE customer_id = ?",
    ).all(customer.id) as { status: 'completed' | 'voided'; duePiasters: number }[]
    const receipts = signedRows(
      database,
      "SELECT direction, amount_piasters AS amountPiasters FROM money_ledger WHERE customer_id = ? AND entry_type = 'customer_receipt'",
      [customer.id],
    )
    const returns = database.prepare(
      'SELECT status, credited_to_account_piasters AS creditedToAccountPiasters FROM sale_returns WHERE customer_id = ?',
    ).all(customer.id) as { status: 'completed' | 'voided'; creditedToAccountPiasters: number }[]
    const result = calculateCustomerBalance({ sales: salesForCustomer, receipts, returns })
    if (!result.ok) errors.push({ code: 'db_integrity', message: `customer balance calculation failed for ${customer.id}` })
  }

  const supplierIds = database.prepare(`
    SELECT id FROM suppliers
    WHERE EXISTS (SELECT 1 FROM purchases WHERE supplier_id = suppliers.id)
       OR EXISTS (SELECT 1 FROM money_ledger WHERE supplier_id = suppliers.id)
  `).all() as { id: string }[]
  for (const supplier of supplierIds) {
    const purchases = database.prepare(
      'SELECT status, due_piasters AS duePiasters FROM purchases WHERE supplier_id = ?',
    ).all(supplier.id) as { status: 'completed' | 'voided'; duePiasters: number }[]
    const payments = signedRows(
      database,
      "SELECT direction, amount_piasters AS amountPiasters FROM money_ledger WHERE supplier_id = ? AND entry_type IN ('supplier_payment','purchase_payment')",
      [supplier.id],
    )
    const result = calculateSupplierBalance({ purchases, payments })
    if (!result.ok) errors.push({ code: 'db_integrity', message: `supplier balance calculation failed for ${supplier.id}` })
  }

  const shifts = database.prepare(
    'SELECT id, opening_cash_piasters, expected_cash_piasters FROM shifts WHERE expected_cash_piasters IS NOT NULL',
  ).all() as { id: string; opening_cash_piasters: number; expected_cash_piasters: number }[]
  for (const shift of shifts) {
    const entries = signedRows(
      database,
      'SELECT shift_id AS shiftId, payment_method AS method, direction, amount_piasters AS amountPiasters FROM money_ledger WHERE shift_id = ?',
      [shift.id],
    ) as unknown as { shiftId: string | null; method: string; direction: 'in' | 'out'; amountPiasters: number }[]
    const result = calculateExpectedShiftCash(shift.opening_cash_piasters, shift.id, entries)
    if (!result.ok || result.value.expectedCashPiasters !== shift.expected_cash_piasters) {
      errors.push({ code: 'shift_cash_mismatch', message: `shift ${shift.id} expected cash mismatch` })
    }
  }

  return { ok: errors.length === 0, errors }
}
````

### Verifier error codes

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

## 4. Trigger tests

``typescript
import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from './database'

function seed(database: ReturnType<typeof openDatabase> extends Promise<infer Context>
  ? Context extends { database: infer Db } ? Db : never
  : never): void {
  const now = Date.now()
  database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','u1','User','hash','owner',1,${now},${now},'d1');
    INSERT INTO products (id,name,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,selling_price_piasters,track_expiry,is_weighted,created_at,updated_at,device_id)
    VALUES ('p1','Product','piece',0,1,100,100,0,0,${now},${now},'d1');
    INSERT INTO shifts (id,user_id,opened_at,opening_cash_piasters,status,created_at,updated_at,device_id)
    VALUES ('sh1','u1',${now},0,'open',${now},${now},'d1');
    INSERT INTO sales (id,invoice_number,user_id,subtotal_piasters,line_discount_piasters,invoice_discount_piasters,tax_piasters,total_piasters,paid_piasters,due_piasters,payment_status,status,created_at,updated_at,device_id)
    VALUES ('s1','000001','u1',100,0,0,0,100,100,0,'paid','completed',${now},${now},'d1');
    INSERT INTO sale_items (id,sale_id,product_id,unit_name_snapshot,priced_unit_qty_base,qty_base,unit_price_piasters,line_subtotal_piasters,line_discount_piasters,invoice_discount_allocated_piasters,tax_rate_bps_snapshot,tax_piasters,final_line_total_piasters,line_cost_piasters,product_name_snapshot,created_at,updated_at,device_id)
    VALUES ('si1','s1','p1','piece',1,1,100,100,0,0,0,0,100,100,'Product',${now},${now},'d1');
    INSERT INTO stock_movements (id,product_id,qty_delta,value_delta_piasters,movement_type,occurred_at,created_by_user_id,created_at,updated_at,device_id)
    VALUES ('m1','p1',1,100,'purchase',${now},'u1',${now},${now},'d1');
    INSERT INTO money_ledger (id,entry_type,direction,amount_piasters,payment_method,sale_id,occurred_at,user_id,created_at,updated_at,device_id)
    VALUES ('ml1','sale_payment','in',100,'cash','s1',${now},'u1',${now},${now},'d1');
    INSERT INTO audit_log (id,occurred_at,action,entity_type,entity_id,device_id,created_at)
    VALUES ('a1',${now},'test','sale','s1','d1',${now});
  `)
}

describe('append-only and guarded triggers', () => {
  it('blocks immutable table updates and deletes with stable codes', async () => {
    const root = join(tmpdir(), `small-shop-pos-trigger-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seed(context.database)
    const statements = [
      ["UPDATE stock_movements SET reason = 'x' WHERE id = 'm1'", 'immutable_stock_movement_update'],
      ["DELETE FROM stock_movements WHERE id = 'm1'", 'immutable_stock_movement_delete'],
      ["UPDATE money_ledger SET reference_text = 'x' WHERE id = 'ml1'", 'immutable_money_ledger_update'],
      ["DELETE FROM money_ledger WHERE id = 'ml1'", 'immutable_money_ledger_delete'],
      ["UPDATE audit_log SET reason = 'x' WHERE id = 'a1'", 'immutable_audit_log_update'],
      ["DELETE FROM audit_log WHERE id = 'a1'", 'immutable_audit_log_delete'],
      ["UPDATE sale_items SET product_name_snapshot = 'x' WHERE id = 'si1'", 'immutable_sale_item_update'],
      ["DELETE FROM sale_items WHERE id = 'si1'", 'immutable_sale_item_delete'],
    ] as const
    for (const [sql, code] of statements) {
      expect(() => context.database.exec(sql)).toThrow(code)
    }
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })

  it('allows only guarded document columns and rejects other changes', async () => {
    const root = join(tmpdir(), `small-shop-pos-guard-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    seed(context.database)
    context.database.prepare("UPDATE sales SET status = 'voided', updated_at = ? WHERE id = 's1'").run(Date.now())
    expect(context.database.prepare("SELECT status FROM sales WHERE id = 's1'").get()).toEqual({ status: 'voided' })
    expect(() => context.database.exec("UPDATE sales SET total_piasters = 99 WHERE id = 's1'")).toThrow('guarded_sales_update')
    expect(() => context.database.exec("DELETE FROM sales WHERE id = 's1'")).toThrow('immutable_sales_delete')
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
````

## 4. Migration-runner tests

``typescript
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from './database'

function makeRoot(name: string): string {
  const root = join(tmpdir(), `small-shop-pos-${name}-${Date.now()}`)
  mkdirSync(root, { recursive: true })
  return root
}

describe('migration runner', () => {
  it('reruns without changes and restores a failed pending migration state', async () => {
    const root = makeRoot('runner')
    const migrations = join(root, 'migrations')
    const userData = join(root, 'user-data')
    mkdirSync(migrations, { recursive: true })
    writeFileSync(join(migrations, '0001_base.sql'), 'CREATE TABLE base (id INTEGER PRIMARY KEY) STRICT;', 'utf8')

    const first = await openDatabase(userData, migrations)
    first.database.prepare('INSERT INTO base (id) VALUES (1)').run()
    closeDatabase(first)

    const second = await openDatabase(userData, migrations)
    expect(second.database.prepare('SELECT COUNT(*) AS count FROM base').get()).toEqual({ count: 1 })
    closeDatabase(second)

    writeFileSync(join(migrations, '0002_fail.sql'), 'CREATE TABLE pending (id INTEGER); SELECT no_such_function();', 'utf8')
    let failed = false
    try {
      await openDatabase(userData, migrations)
    } catch {
      failed = true
    }
    expect(failed).toBe(true)

    const databasePath = join(userData, 'database', 'small-shop-pos.sqlite')
    const afterFailure = new Database(databasePath)
    expect(afterFailure.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pending'").get()).toBeUndefined()
    expect(afterFailure.prepare('SELECT COUNT(*) AS count FROM base').get()).toEqual({ count: 1 })
    afterFailure.close()
    const backupDirectory = join(userData, 'backups')
    expect(existsSync(backupDirectory)).toBe(true)
    expect(readdirSync(backupDirectory).some((fileName) => fileName.startsWith('pre-migration-'))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('detects an edited applied migration by checksum', async () => {
    const root = makeRoot('checksum')
    const migrations = join(root, 'migrations')
    mkdirSync(migrations, { recursive: true })
    const migrationPath = join(migrations, '0001_checksum.sql')
    writeFileSync(migrationPath, 'CREATE TABLE checksum_table (id INTEGER) STRICT;', 'utf8')
    const context = await openDatabase(join(root, 'user-data'), migrations)
    closeDatabase(context)
    writeFileSync(migrationPath, 'CREATE TABLE checksum_table (id INTEGER, value TEXT) STRICT;', 'utf8')
    await expect(openDatabase(join(root, 'user-data'), migrations)).rejects.toThrow('migration_checksum_mismatch')
    rmSync(root, { recursive: true, force: true })
  })

  it('keeps migration checksums and applied timestamps', async () => {
    const root = makeRoot('metadata')
    const migrations = join(root, 'migrations')
    mkdirSync(migrations, { recursive: true })
    const migrationPath = join(migrations, '0001_metadata.sql')
    const sql = 'CREATE TABLE metadata_table (id INTEGER) STRICT;'
    writeFileSync(migrationPath, sql, 'utf8')
    const context = await openDatabase(join(root, 'user-data'), migrations)
    const row = context.database.prepare('SELECT id, checksum, applied_at FROM schema_migrations').get() as {
      id: string
      checksum: string
      applied_at: number
    }
    expect(row.id).toBe('0001_metadata')
    expect(row.checksum).toHaveLength(64)
    expect(row.applied_at).toBeGreaterThan(0)
    expect(readFileSync(migrationPath, 'utf8')).toBe(sql)
    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
````

## 5. src/domain/inventory.ts

``typescript
import { safeInteger } from './integer'
import { mulDivRoundHalfUp } from './rounding'
import { err, ok, type DomainError, type Result } from './result'

type OnHand = { qty: number; value: number }

function nonNegative(value: number, field: string): Result<number, DomainError> {
  const result = safeInteger(value, field)
  if (!result.ok || result.value < 0) {
    return err({ code: 'invalid_quantity', message: `${field} must be non-negative`, field })
  }
  return ok(result.value)
}

function integer(value: number, field: string): Result<number, DomainError> {
  const result = safeInteger(value, field)
  if (!result.ok) return err({ code: 'invalid_input', message: `${field} must be a safe integer`, field })
  return result
}

function checked(value: bigint): Result<number, DomainError> {
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  if (value < -max || value > max) return err({ code: 'overflow', message: 'inventory value exceeds safe integer range' })
  return ok(Number(value))
}

export function calculateOnHand(
  movements: { qtyDelta: number; valueDeltaPiasters: number }[],
): Result<OnHand, DomainError> {
  let qty = 0n
  let value = 0n
  for (const movement of movements) {
    const q = integer(movement.qtyDelta, 'qtyDelta')
    if (!q.ok) return q
    const v = integer(movement.valueDeltaPiasters, 'valueDeltaPiasters')
    if (!v.ok) return v
    qty += BigInt(q.value)
    value += BigInt(v.value)
  }
  const qtyResult = checked(qty)
  if (!qtyResult.ok) return qtyResult
  const valueResult = checked(value)
  if (!valueResult.ok) return valueResult
  return ok({ qty: qtyResult.value, value: valueResult.value })
}

export function calculateOutgoingCost(
  onHandQty: number,
  onHandValue: number,
  qtyOut: number,
  defaultCostPiasters: number,
  priceUnitQtyBase: number,
): Result<number, DomainError> {
  const qtyResult = integer(onHandQty, 'onHandQty')
  if (!qtyResult.ok) return qtyResult
  const valueResult = integer(onHandValue, 'onHandValue')
  if (!valueResult.ok) return valueResult
  const outResult = nonNegative(qtyOut, 'qtyOut')
  if (!outResult.ok || outResult.value === 0) {
    return err({ code: 'invalid_quantity', message: 'qtyOut must be positive', field: 'qtyOut' })
  }
  const costResult = nonNegative(defaultCostPiasters, 'defaultCostPiasters')
  if (!costResult.ok) return costResult
  const unitResult = nonNegative(priceUnitQtyBase, 'priceUnitQtyBase')
  if (!unitResult.ok || unitResult.value === 0) {
    return err({ code: 'invalid_quantity', message: 'priceUnitQtyBase must be positive', field: 'priceUnitQtyBase' })
  }

  if (qtyResult.value > 0 && valueResult.value < 0) {
    return err({
      code: 'ledger_invariant_violation',
      message: 'positive on-hand quantity cannot have negative value',
      field: 'onHandValue',
    })
  }

  if (qtyResult.value > 0) {
    if (outResult.value === qtyResult.value) return ok(valueResult.value)
    if (outResult.value < qtyResult.value) {
      return mulDivRoundHalfUp(valueResult.value, outResult.value, qtyResult.value)
    }
    const remainder = mulDivRoundHalfUp(
      costResult.value,
      outResult.value - qtyResult.value,
      unitResult.value,
    )
    if (!remainder.ok) return remainder
    return checked(BigInt(valueResult.value) + BigInt(remainder.value))
  }
  return mulDivRoundHalfUp(costResult.value, outResult.value, unitResult.value)
}

export function calculateIncomingValueAtAverage(
  onHandQty: number,
  onHandValue: number,
  qtyIn: number,
  defaultCostPiasters: number,
  priceUnitQtyBase: number,
): Result<number, DomainError> {
  const qtyResult = integer(onHandQty, 'onHandQty')
  if (!qtyResult.ok) return qtyResult
  const valueResult = integer(onHandValue, 'onHandValue')
  if (!valueResult.ok) return valueResult
  const inResult = nonNegative(qtyIn, 'qtyIn')
  if (!inResult.ok || inResult.value === 0) return err({ code: 'invalid_quantity', message: 'qtyIn must be positive', field: 'qtyIn' })
  const costResult = nonNegative(defaultCostPiasters, 'defaultCostPiasters')
  if (!costResult.ok) return costResult
  const unitResult = nonNegative(priceUnitQtyBase, 'priceUnitQtyBase')
  if (!unitResult.ok || unitResult.value === 0) return err({ code: 'invalid_quantity', message: 'priceUnitQtyBase must be positive', field: 'priceUnitQtyBase' })
  if (qtyResult.value > 0 && valueResult.value < 0) {
    return err({
      code: 'ledger_invariant_violation',
      message: 'positive on-hand quantity cannot have negative value',
      field: 'onHandValue',
    })
  }

  if (qtyResult.value > 0) {
    return mulDivRoundHalfUp(valueResult.value, inResult.value, qtyResult.value)
  }
  return mulDivRoundHalfUp(costResult.value, inResult.value, unitResult.value)
}

export function calculateStockNormalization(
  qty: number,
  value: number,
): Result<{ revaluationPiasters: number }, DomainError> {
  const qtyResult = integer(qty, 'qty')
  if (!qtyResult.ok) return qtyResult
  const valueResult = integer(value, 'value')
  if (!valueResult.ok) return valueResult

  if (
    (qtyResult.value === 0 && valueResult.value !== 0) ||
    (qtyResult.value > 0 && valueResult.value < 0)
  ) {
    return ok({ revaluationPiasters: -valueResult.value })
  }
  return ok({ revaluationPiasters: 0 })
}

export type NegativeStockSettlement = {
  revaluationPiasters: number
  costVariancePiasters: number
  resultingQty: number
  resultingValue: number
}

export function calculateNegativeStockSettlement(
  onHandQty: number,
  onHandValue: number,
  incomingQty: number,
  incomingValue: number,
): Result<NegativeStockSettlement, DomainError> {
  const qtyResult = integer(onHandQty, 'onHandQty')
  if (!qtyResult.ok) return qtyResult
  const valueResult = integer(onHandValue, 'onHandValue')
  if (!valueResult.ok) return valueResult
  const inQtyResult = nonNegative(incomingQty, 'incomingQty')
  if (!inQtyResult.ok || inQtyResult.value === 0) return err({ code: 'invalid_quantity', message: 'incomingQty must be positive', field: 'incomingQty' })
  const inValueResult = nonNegative(incomingValue, 'incomingValue')
  if (!inValueResult.ok) return inValueResult

  const resultingQtyBig = BigInt(qtyResult.value) + BigInt(inQtyResult.value)
  const valueAfterBig = BigInt(valueResult.value) + BigInt(inValueResult.value)
  const qtyChecked = checked(resultingQtyBig)
  if (!qtyChecked.ok) return qtyChecked
  const valueAfter = checked(valueAfterBig)
  if (!valueAfter.ok) return valueAfter

  let revaluation = 0
  if (qtyResult.value < 0 && qtyChecked.value >= 0) {
    const desired = qtyChecked.value === 0
      ? 0
      : (() => {
          const result = mulDivRoundHalfUp(inValueResult.value, qtyChecked.value, inQtyResult.value)
          return result
        })()
    if (typeof desired !== 'number') {
      if (!desired.ok) return desired
      revaluation = desired.value - valueAfter.value
    } else {
      revaluation = desired - valueAfter.value
    }
  }
  const finalValue = checked(BigInt(valueAfter.value) + BigInt(revaluation))
  if (!finalValue.ok) return finalValue
  return ok({
    revaluationPiasters: revaluation,
    costVariancePiasters: revaluation === 0 ? 0 : -revaluation,
    resultingQty: qtyChecked.value,
    resultingValue: finalValue.value,
  })
}
````

## 5. src/domain/inventory.test.ts

``typescript
import { describe, expect, it } from 'vitest'
import {
  calculateIncomingValueAtAverage,
  calculateNegativeStockSettlement,
  calculateOnHand,
  calculateOutgoingCost,
  calculateStockNormalization,
} from './inventory'

describe('inventory valuation', () => {
  it('sums movements safely', () => {
    expect(calculateOnHand([
      { qtyDelta: 3, valueDeltaPiasters: 300 },
      { qtyDelta: -1, valueDeltaPiasters: -100 },
    ])).toEqual({ ok: true, value: { qty: 2, value: 200 } })
  })

  it.each([
    [10, 1000, 10, 100, 1, 1000],
    [10, 1000, 4, 100, 1, 400],
    [3, 100, 1, 100, 1, 33],
    [3, 100, 2, 100, 1, 67],
    [5, 500, 8, 100, 1, 800],
    [0, 0, 3, 100, 1, 300],
    [-3, -300, 2, 100, 1, 200],
    [5, 0, 2, 100, 1, 0],
    [5, 0, 5, 100, 1, 0],
    [5, 0, 8, 100, 1, 300],
    [0, 0, 350, 11050, 1000, 3868],
  ] as const)('calculates outgoing cost', (qty, value, out, cost, unit, expected) => {
    expect(calculateOutgoingCost(qty, value, out, cost, unit)).toEqual({
      ok: true,
      value: expected,
    })
  })

  it('rejects invalid outgoing quantity and positive-quantity negative value', () => {
    expect(calculateOutgoingCost(1, 1, 0, 1, 1).ok).toBe(false)
    expect(calculateOutgoingCost(5, -10, 2, 100, 1)).toEqual({
      ok: false,
      error: {
        code: 'ledger_invariant_violation',
        message: 'positive on-hand quantity cannot have negative value',
        field: 'onHandValue',
      },
    })
  })

  it.each([
    [10, 1000, 5, 100, 1, 500],
    [0, 0, 5, 100, 1, 500],
    [-3, -300, 2, 100, 1, 200],
    [5, 0, 2, 100, 1, 0],
  ] as const)('calculates incoming average value', (qty, value, input, cost, unit, expected) => {
    expect(calculateIncomingValueAtAverage(qty, value, input, cost, unit)).toEqual({
      ok: true,
      value: expected,
    })
  })

  it('rejects incoming average valuation for a positive quantity with negative value', () => {
    expect(calculateIncomingValueAtAverage(5, -10, 2, 100, 1)).toEqual({
      ok: false,
      error: {
        code: 'ledger_invariant_violation',
        message: 'positive on-hand quantity cannot have negative value',
        field: 'onHandValue',
      },
    })
  })

  it.each([
    [0, 60, -60],
    [0, -250, 250],
    [5, -40, 40],
    [5, 0, 0],
    [-3, -300, 0],
    [7, 840, 0],
    [0, 0, 0],
  ] as const)('normalizes stock values', (qty, value, revaluationPiasters) => {
    expect(calculateStockNormalization(qty, value)).toEqual({
      ok: true,
      value: { revaluationPiasters },
    })
  })

  it.each([
    [-3, -300, 3, 360, -60, 60, 0, 0],
    [-3, -300, 3, 240, 60, -60, 0, 0],
    [-3, -300, 10, 1200, -60, 60, 7, 840],
    [5, 500, 3, 360, 0, 0, 8, 860],
    [-5, -500, 3, 360, 0, 0, -2, -140],
    [0, 0, 3, 360, 0, 0, 3, 360],
  ] as const)('settles negative stock', (
    qty,
    value,
    input,
    incoming,
    revaluation,
    variance,
    resultingQty,
    resultingValue,
  ) => {
    expect(calculateNegativeStockSettlement(qty, value, input, incoming)).toEqual({
      ok: true,
      value: {
        revaluationPiasters: revaluation,
        costVariancePiasters: variance,
        resultingQty,
        resultingValue,
      },
    })
  })

  it('normalizes a voided purchase after a weighted sale', () => {
    expect(calculateNegativeStockSettlement(5, 500, 5, 1000)).toEqual({
      ok: true,
      value: {
        revaluationPiasters: 0,
        costVariancePiasters: 0,
        resultingQty: 10,
        resultingValue: 1500,
      },
    })
    expect(calculateOutgoingCost(10, 1500, 5, 100, 1)).toEqual({
      ok: true,
      value: 750,
    })
    expect(calculateStockNormalization(0, -250)).toEqual({
      ok: true,
      value: { revaluationPiasters: 250 },
    })
  })

  it('preserves invariants across seeded mixed stock operations', () => {
    let state = 0xabcdef01n
    const next = (max: number): number => {
      state = (state * 1664525n + 1013904223n) % 4294967296n
      return Number(state % BigInt(max))
    }

    for (let sequence = 0; sequence < 2000; sequence += 1) {
      let qty = 0
      let value = 0
      const purchases: { qtyDelta: number; valueDeltaPiasters: number; voided: boolean }[] = []
      const revaluationRows: { qtyDelta: number; valueDeltaPiasters: number }[] = []

      for (let operation = 0; operation < next(36) + 5; operation += 1) {
        const kind = next(7)
        if (kind === 0 || kind === 3 || kind === 5) {
          const incomingQty = next(20) + 1
          const incomingValue = next(2) === 0 ? 0 : incomingQty * next(200)
          const previousQty = qty
          const settlement = calculateNegativeStockSettlement(
            qty,
            value,
            incomingQty,
            incomingValue,
          )
          expect(settlement.ok).toBe(true)
          if (!settlement.ok) continue
          purchases.push({
            qtyDelta: incomingQty,
            valueDeltaPiasters: incomingValue,
            voided: false,
          })
          qty = settlement.value.resultingQty
          value = settlement.value.resultingValue
          if (previousQty < 0 && qty >= 0) {
            revaluationRows.push({
              qtyDelta: 0,
              valueDeltaPiasters: settlement.value.revaluationPiasters,
            })
          }
        } else if (kind === 1 || kind === 2 || kind === 4) {
          const outgoingQty = next(20) + 1
          const cost = calculateOutgoingCost(qty, value, outgoingQty, 100, 1)
          expect(cost.ok).toBe(true)
          if (!cost.ok) continue
          qty -= outgoingQty
          value -= cost.value
        } else {
          let purchaseIndex = -1
          for (let index = purchases.length - 1; index >= 0; index -= 1) {
            if (!purchases[index].voided) {
              purchaseIndex = index
              break
            }
          }
          if (purchaseIndex < 0) continue
          const purchase = purchases[purchaseIndex]
          purchase.voided = true
          qty -= purchase.qtyDelta
          value -= purchase.valueDeltaPiasters
        }

        const normalization = calculateStockNormalization(qty, value)
        expect(normalization.ok).toBe(true)
        if (!normalization.ok) continue
        if (normalization.value.revaluationPiasters !== 0) {
          revaluationRows.push({
            qtyDelta: 0,
            valueDeltaPiasters: normalization.value.revaluationPiasters,
          })
          value += normalization.value.revaluationPiasters
        }

        expect(revaluationRows.every((row) => row.qtyDelta === 0)).toBe(true)
        if (qty === 0) expect(value).toBe(0)
        if (qty > 0) expect(value).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
````

## 6. Transaction helper

``typescript
import type Database from 'better-sqlite3'

export type DatabaseHandle = Database.Database

export type DatabaseErrorCode = 'constraint_unique' | 'constraint_check' | 'constraint_foreign_key' | 'database_error'

export class RepositoryError extends Error {
  readonly code: DatabaseErrorCode

  constructor(code: DatabaseErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'RepositoryError'
    this.code = code
  }
}

export function mapDatabaseError(error: unknown): RepositoryError {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('UNIQUE constraint failed')) {
    return new RepositoryError('constraint_unique', 'A record with the same unique value already exists.', { cause: error })
  }
  if (message.includes('CHECK constraint failed')) {
    return new RepositoryError('constraint_check', 'The record violates a database rule.', { cause: error })
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return new RepositoryError('constraint_foreign_key', 'The referenced record does not exist.', { cause: error })
  }
  return new RepositoryError('database_error', 'The database operation failed.', { cause: error })
}

export function execute<T>(operation: () => T): T {
  try {
    return operation()
  } catch (error) {
    throw mapDatabaseError(error)
  }
}

export function runInTransaction<T>(database: DatabaseHandle, work: (transaction: DatabaseHandle) => T): T {
  const transaction = database.transaction(() => work(database))
  return transaction()
}

const booleanColumns = new Set(['is_active', 'is_primary', 'track_expiry', 'is_weighted'])

function camelCase(key: string): string {
  return key.replace(/_([a-z])/gu, (_, letter: string) => letter.toUpperCase())
}

export function mapRow<T extends Record<string, unknown>>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      camelCase(key),
      booleanColumns.has(key) && value !== null ? value === 1 : value,
    ]),
  ) as T
}

export function mapRows<T extends Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => mapRow<T>(row))
}

export function insertAndMap<T extends Record<string, unknown>>(
  database: DatabaseHandle,
  sql: string,
  parameters: unknown[],
): T {
  return mapRow<T>(execute(() => database.prepare(sql).get(...parameters) as Record<string, unknown>))
}
````

## 6. Sequence helper

``typescript
import { execute, type DatabaseHandle } from './common'
export function nextSequenceNumber(database: DatabaseHandle, deviceId: string, sequenceName: 'sale_invoice' | 'purchase' | 'sale_return'): number {
  return execute(() => {
    const now = Date.now()
    database.prepare(`
      INSERT INTO device_sequences (device_id,sequence_name,next_value,updated_at)
      VALUES (?, ?, 2, ?)
      ON CONFLICT(device_id,sequence_name) DO UPDATE SET next_value = next_value + 1, updated_at = excluded.updated_at
    `).run(deviceId, sequenceName, now)
    const row = database.prepare('SELECT next_value FROM device_sequences WHERE device_id = ? AND sequence_name = ?').get(deviceId, sequenceName) as { next_value: number }
    return row.next_value - 1
  })
}
````

## 7. Database/repository file tree (line counts)

- src\main\database\backup.test.ts: 40 lines
- src\main\database\database.ts: 285 lines
- src\main\database\db-cli.test.ts: 30 lines
- src\main\database\db-verify.test.ts: 44 lines
- src\main\database\db-verify.ts: 249 lines
- src\main\database\migration-runner.test.ts: 83 lines
- src\main\database\migration.test.ts: 77 lines
- src\main\database\sqlite-version.test.ts: 22 lines
- src\main\database\triggers.test.ts: 66 lines
- src\main\database\repositories\audit-log.ts: 10 lines
- src\main\database\repositories\catalog.ts: 27 lines
- src\main\database\repositories\common.ts: 69 lines
- src\main\database\repositories\customers.ts: 11 lines
- src\main\database\repositories\expenses.ts: 10 lines
- src\main\database\repositories\held-sales.ts: 7 lines
- src\main\database\repositories\money-ledger.ts: 10 lines
- src\main\database\repositories\purchases.ts: 13 lines
- src\main\database\repositories\repositories.test.ts: 83 lines
- src\main\database\repositories\sale-returns.ts: 13 lines
- src\main\database\repositories\sales.ts: 14 lines
- src\main\database\repositories\sequences.ts: 13 lines
- src\main\database\repositories\settings.ts: 19 lines
- src\main\database\repositories\shifts.ts: 11 lines
- src\main\database\repositories\stock-counts.ts: 10 lines
- src\main\database\repositories\stock.ts: 14 lines
- src\main\database\repositories\suppliers.ts: 11 lines
- src\main\database\repositories\users.ts: 15 lines

## 8. Command outputs

### git log --oneline -30
````text
7a2b93a Document Batch B database layer
97e4b72 Add database repositories and transaction helpers
b6b8266 Add database verification
f39f20d Add developer database scripts
3049c7b Test migration runner integrity and packaging
a40657f Add append-only database triggers
12d6af8 Add Phase 1 database migrations
446ced7 Verify bundled SQLite version
ca41ea7 Record stock normalization decision
f0a2887 Amend inventory valuation invariants
f7941aa Fix strict domain fixture typing
0670477 Align Phase 1 domain contracts documentation
f7fe69e Implement inventory and profit reports domain
de2fe1d Implement void compensation domain
22303f4 Implement shift cash domain
ea80c8f Implement FEFO batch allocation domain
6a38651 Implement cumulative returns domain
a3bd00e Implement weighted inventory domain
0350031 Implement account balance domain
2f7ad8f Implement payment allocation domain
d7f72eb Implement pricing and sale totals domain
ee6e781 phase 1 docs
ea454d7 Implement domain result and integer rounding foundation
87cb2da feat: complete Phase 0 licensing and packaging
61c71f3 feat: integrate app licensing
2b191c7 feat: add external license generator
188ab5a feat: add license foundation
b59972d design system files
87ee56a feat: add online database backup restore
993fc8b chore: remove generated source artifact
````

### git status
````text
?? .vitest-counts.txt
````

### npm test
````text
31 test files passed, 194 tests passed
````

### npm run lint
````text
passed
````

### npm run build
````text
renderer build passed; electron TypeScript build passed
````


## 9. Follow-up repository completeness correction

Commit 299722c Complete repository basic operations added the missing basic insert/list operations for product units, barcodes, stock batches, sale items, purchase items, sale-return items, and stock-count items. Validation after this follow-up: 
pm test passed (31 files, 194 tests), 
pm run lint passed, and 
pm run build passed.

### Updated repository files

#### src\main\database\repositories\catalog.ts

``typescript
import { execute, mapRow, mapRows, type DatabaseHandle } from './common'

export function getCategory(database: DatabaseHandle, id: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare('SELECT * FROM categories WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function insertCategory(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO categories (id,name,sort_order,deleted_at,created_at,updated_at,device_id) VALUES (@id,@name,@sort_order,@deleted_at,@created_at,@updated_at,@device_id)').run(row))
}
export function getProduct(database: DatabaseHandle, id: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare('SELECT * FROM products WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function listProducts(database: DatabaseHandle): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name').all()) as Record<string, unknown>[])
}
export function insertProduct(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare(`
    INSERT INTO products (id,sku,name,category_id,base_unit_name,qty_scale,price_unit_qty_base,cost_price_piasters,
      selling_price_piasters,tax_rate_bps,track_expiry,is_weighted,low_stock_threshold_qty,metadata,created_at,updated_at,device_id)
    VALUES (@id,@sku,@name,@category_id,@base_unit_name,@qty_scale,@price_unit_qty_base,@cost_price_piasters,
      @selling_price_piasters,@tax_rate_bps,@track_expiry,@is_weighted,@low_stock_threshold_qty,@metadata,@created_at,@updated_at,@device_id)
  `).run(row))
}
export function insertProductUnit(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO product_units (id,product_id,unit_name,base_qty_per_unit,selling_price_piasters,deleted_at,created_at,updated_at,device_id) VALUES (@id,@product_id,@unit_name,@base_qty_per_unit,@selling_price_piasters,@deleted_at,@created_at,@updated_at,@device_id)').run(row))
}
export function insertBarcode(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO barcodes (id,barcode,product_id,product_unit_id,is_primary,deleted_at,created_at,updated_at,device_id) VALUES (@id,@barcode,@product_id,@product_unit_id,@is_primary,@deleted_at,@created_at,@updated_at,@device_id)').run(row))
}
export function listProductUnits(database: DatabaseHandle, productId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM product_units WHERE product_id = ? ORDER BY unit_name').all(productId)) as Record<string, unknown>[])
}
export function listBarcodes(database: DatabaseHandle, productId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM barcodes WHERE product_id = ? ORDER BY barcode').all(productId)) as Record<string, unknown>[])
}
`` 

#### src\main\database\repositories\stock.ts

``typescript
import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
export function getStockMovement(database: DatabaseHandle, id: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare('SELECT * FROM stock_movements WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function insertStockBatch(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO stock_batches (id,product_id,batch_code,expiry_at,received_at,initial_qty_base,deleted_at,created_at,updated_at,device_id) VALUES (@id,@product_id,@batch_code,@expiry_at,@received_at,@initial_qty_base,@deleted_at,@created_at,@updated_at,@device_id)').run(row))
}
export function listStockBatches(database: DatabaseHandle, productId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM stock_batches WHERE product_id = ? AND deleted_at IS NULL ORDER BY expiry_at,id').all(productId)) as Record<string, unknown>[])
}
export function listStockMovements(database: DatabaseHandle, productId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM stock_movements WHERE product_id = ? ORDER BY occurred_at,id').all(productId)) as Record<string, unknown>[])
}
export function getOnHand(database: DatabaseHandle, productId: string): { qty: number; valuePiasters: number } {
  return execute(() => database.prepare('SELECT COALESCE(SUM(qty_delta),0) AS qty, COALESCE(SUM(value_delta_piasters),0) AS valuePiasters FROM stock_movements WHERE product_id = ?').get(productId)) as { qty: number; valuePiasters: number }
}
export function insertStockMovement(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO stock_movements (id,product_id,batch_id,qty_delta,value_delta_piasters,movement_type,reverses_movement_id,reference_type,reference_id,occurred_at,reason,created_by_user_id,created_at,updated_at,device_id) VALUES (@id,@product_id,@batch_id,@qty_delta,@value_delta_piasters,@movement_type,@reverses_movement_id,@reference_type,@reference_id,@occurred_at,@reason,@created_by_user_id,@created_at,@updated_at,@device_id)').run(row))
}
`` 

#### src\main\database\repositories\sales.ts

``typescript
import { execute, mapRow, mapRows, type DatabaseHandle } from './common'
export function getSale(database: DatabaseHandle, id: string): Record<string, unknown> | undefined {
  const row = execute(() => database.prepare('SELECT * FROM sales WHERE id = ?').get(id)) as Record<string, unknown> | undefined
  return row === undefined ? undefined : mapRow(row)
}
export function listSales(database: DatabaseHandle): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM sales ORDER BY created_at,id').all()) as Record<string, unknown>[])
}
export function insertSale(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO sales (id,invoice_number,customer_id,user_id,shift_id,subtotal_piasters,line_discount_piasters,invoice_discount_piasters,tax_piasters,rounding_adjustment_piasters,total_piasters,paid_piasters,due_piasters,payment_status,status,created_at,updated_at,device_id) VALUES (@id,@invoice_number,@customer_id,@user_id,@shift_id,@subtotal_piasters,@line_discount_piasters,@invoice_discount_piasters,@tax_piasters,@rounding_adjustment_piasters,@total_piasters,@paid_piasters,@due_piasters,@payment_status,@status,@created_at,@updated_at,@device_id)').run(row))
}
export function listSaleItems(database: DatabaseHandle, saleId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(saleId)) as Record<string, unknown>[])
}
export function insertSaleItem(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO sale_items (id,sale_id,product_id,unit_name_snapshot,priced_unit_qty_base,qty_base,unit_price_piasters,line_subtotal_piasters,line_discount_piasters,invoice_discount_allocated_piasters,tax_rate_bps_snapshot,tax_piasters,final_line_total_piasters,line_cost_piasters,product_name_snapshot,created_at,updated_at,device_id) VALUES (@id,@sale_id,@product_id,@unit_name_snapshot,@priced_unit_qty_base,@qty_base,@unit_price_piasters,@line_subtotal_piasters,@line_discount_piasters,@invoice_discount_allocated_piasters,@tax_rate_bps_snapshot,@tax_piasters,@final_line_total_piasters,@line_cost_piasters,@product_name_snapshot,@created_at,@updated_at,@device_id)').run(row))
}
`` 

#### src\main\database\repositories\purchases.ts

``typescript
import { execute, mapRows, type DatabaseHandle } from './common'
export function listPurchases(database: DatabaseHandle, supplierId?: string): Record<string, unknown>[] {
  const rows = supplierId === undefined
    ? execute(() => database.prepare('SELECT * FROM purchases ORDER BY created_at,id').all())
    : execute(() => database.prepare('SELECT * FROM purchases WHERE supplier_id = ? ORDER BY created_at,id').all(supplierId))
  return mapRows(rows as Record<string, unknown>[])
}
export function insertPurchase(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO purchases (id,purchase_number,supplier_id,user_id,total_piasters,paid_piasters,due_piasters,payment_status,status,created_at,updated_at,device_id) VALUES (@id,@purchase_number,@supplier_id,@user_id,@total_piasters,@paid_piasters,@due_piasters,@payment_status,@status,@created_at,@updated_at,@device_id)').run(row))
}
export function listPurchaseItems(database: DatabaseHandle, purchaseId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id').all(purchaseId)) as Record<string, unknown>[])
}
export function insertPurchaseItem(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO purchase_items (id,purchase_id,product_id,unit_name_snapshot,priced_unit_qty_base,qty_base,unit_cost_piasters,line_subtotal_piasters,tax_rate_bps_snapshot,tax_piasters,line_total_piasters,batch_code_snapshot,expiry_at_snapshot,created_at,updated_at,device_id) VALUES (@id,@purchase_id,@product_id,@unit_name_snapshot,@priced_unit_qty_base,@qty_base,@unit_cost_piasters,@line_subtotal_piasters,@tax_rate_bps_snapshot,@tax_piasters,@line_total_piasters,@batch_code_snapshot,@expiry_at_snapshot,@created_at,@updated_at,@device_id)').run(row))
}
`` 

#### src\main\database\repositories\sale-returns.ts

``typescript
import { execute, mapRows, type DatabaseHandle } from './common'
export function listSaleReturns(database: DatabaseHandle, customerId?: string): Record<string, unknown>[] {
  const rows = customerId === undefined
    ? execute(() => database.prepare('SELECT * FROM sale_returns ORDER BY created_at,id').all())
    : execute(() => database.prepare('SELECT * FROM sale_returns WHERE customer_id = ? ORDER BY created_at,id').all(customerId))
  return mapRows(rows as Record<string, unknown>[])
}
export function insertSaleReturn(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO sale_returns (id,return_number,original_sale_id,customer_id,user_id,shift_id,total_piasters,cash_refunded_piasters,credited_to_account_piasters,status,created_at,updated_at,device_id) VALUES (@id,@return_number,@original_sale_id,@customer_id,@user_id,@shift_id,@total_piasters,@cash_refunded_piasters,@credited_to_account_piasters,@status,@created_at,@updated_at,@device_id)').run(row))
}
export function listSaleReturnItems(database: DatabaseHandle, saleReturnId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM sale_return_items WHERE sale_return_id = ? ORDER BY id').all(saleReturnId)) as Record<string, unknown>[])
}
export function insertSaleReturnItem(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO sale_return_items (id,sale_return_id,sale_item_id,product_id,qty_base,refund_piasters,condition,created_at,updated_at,device_id) VALUES (@id,@sale_return_id,@sale_item_id,@product_id,@qty_base,@refund_piasters,@condition,@created_at,@updated_at,@device_id)').run(row))
}
`` 

#### src\main\database\repositories\stock-counts.ts

``typescript
import { execute, mapRows, type DatabaseHandle } from './common'
export function listStockCounts(database: DatabaseHandle): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM stock_counts ORDER BY started_at,id').all()) as Record<string, unknown>[])
}
export function insertStockCount(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO stock_counts (id,status,started_at,posted_at,user_id,notes,created_at,updated_at,device_id) VALUES (@id,@status,@started_at,@posted_at,@user_id,@notes,@created_at,@updated_at,@device_id)').run(row))
}
export function listStockCountItems(database: DatabaseHandle, stockCountId: string): Record<string, unknown>[] {
  return mapRows(execute(() => database.prepare('SELECT * FROM stock_count_items WHERE stock_count_id = ? ORDER BY id').all(stockCountId)) as Record<string, unknown>[])
}
export function insertStockCountItem(database: DatabaseHandle, row: Record<string, unknown>): void {
  execute(() => database.prepare('INSERT INTO stock_count_items (id,stock_count_id,product_id,expected_qty_base,counted_qty_base,difference_qty_base,created_at,updated_at,device_id) VALUES (@id,@stock_count_id,@product_id,@expected_qty_base,@counted_qty_base,@difference_qty_base,@created_at,@updated_at,@device_id)').run(row))
}
`` 


