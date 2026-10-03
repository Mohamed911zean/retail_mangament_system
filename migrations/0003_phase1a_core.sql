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
