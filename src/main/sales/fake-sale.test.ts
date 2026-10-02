import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { saveFakeSale, type FakeSale } from './fake-sale'

const sale: FakeSale = {
  id: 'sale-001',
  totalPiasters: 2500,
  createdAt: 1700000000000,
  lines: [
    {
      id: 'sale-item-001',
      productId: 'product-001',
      quantity: 2,
      unitPricePiasters: 1000,
    },
    {
      id: 'sale-item-002',
      productId: 'product-002',
      quantity: 1,
      unitPricePiasters: 500,
    },
  ],
}

function createDatabase(): Database.Database {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  database.exec(`
    CREATE TABLE sales (
      id TEXT PRIMARY KEY,
      totalPiasters INTEGER NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE sale_items (
      id TEXT PRIMARY KEY,
      saleId TEXT NOT NULL REFERENCES sales(id),
      productId TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unitPricePiasters INTEGER NOT NULL,
      lineTotalPiasters INTEGER NOT NULL
    );
    CREATE TABLE stock_movements (
      id TEXT PRIMARY KEY,
      saleId TEXT NOT NULL REFERENCES sales(id),
      productId TEXT NOT NULL,
      quantityDelta INTEGER NOT NULL,
      createdAt INTEGER NOT NULL
    );
  `)
  return database
}

describe('saveFakeSale', () => {
  it('writes the sale, items, and stock movements atomically', () => {
    const database = createDatabase()

    saveFakeSale(database, sale)

    expect(database.prepare('SELECT COUNT(*) AS count FROM sales').get()).toEqual({ count: 1 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM sale_items').get()).toEqual({ count: 2 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM stock_movements').get()).toEqual({ count: 2 })
    expect(
      database
        .prepare('SELECT SUM(lineTotalPiasters) AS total FROM sale_items WHERE saleId = ?')
        .get(sale.id),
    ).toEqual({ total: 2500 })
    database.close()
  })

  it.each(['after-sale', 'after-item', 'after-stock-movement'] as const)(
    'rolls back all tables when failure is injected at %s',
    (failurePoint) => {
      const database = createDatabase()

      expect(() => saveFakeSale(database, sale, failurePoint)).toThrow()
      expect(database.prepare('SELECT COUNT(*) AS count FROM sales').get()).toEqual({ count: 0 })
      expect(database.prepare('SELECT COUNT(*) AS count FROM sale_items').get()).toEqual({ count: 0 })
      expect(database.prepare('SELECT COUNT(*) AS count FROM stock_movements').get()).toEqual({ count: 0 })
      database.close()
    },
  )
})
