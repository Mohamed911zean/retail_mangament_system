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
