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
