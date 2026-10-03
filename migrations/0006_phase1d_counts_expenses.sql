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
