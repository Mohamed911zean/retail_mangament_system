CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  totalPiasters INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  saleId TEXT NOT NULL REFERENCES sales(id),
  productId TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unitPricePiasters INTEGER NOT NULL,
  lineTotalPiasters INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  saleId TEXT NOT NULL REFERENCES sales(id),
  productId TEXT NOT NULL,
  quantityDelta INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);
