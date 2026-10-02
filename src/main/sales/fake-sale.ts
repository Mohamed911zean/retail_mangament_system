import type Database from 'better-sqlite3'

export type FakeSaleLine = {
  id: string
  productId: string
  quantity: number
  unitPricePiasters: number
}

export type FakeSale = {
  id: string
  totalPiasters: number
  createdAt: number
  lines: FakeSaleLine[]
}

export type FakeSaleFailurePoint = 'after-sale' | 'after-item' | 'after-stock-movement'

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`)
  }
}

export function saveFakeSale(
  database: Database.Database,
  sale: FakeSale,
  failurePoint?: FakeSaleFailurePoint,
): void {
  if (sale.lines.length === 0) {
    throw new Error('A fake sale must contain at least one line')
  }

  for (const line of sale.lines) {
    assertNonNegativeInteger(line.quantity, 'quantity')
    assertNonNegativeInteger(line.unitPricePiasters, 'unitPricePiasters')
  }

  const insertSale = database.prepare(
    'INSERT INTO sales (id, totalPiasters, createdAt) VALUES (?, ?, ?)',
  )
  const insertSaleItem = database.prepare(
    'INSERT INTO sale_items (id, saleId, productId, quantity, unitPricePiasters, lineTotalPiasters) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const insertStockMovement = database.prepare(
    'INSERT INTO stock_movements (id, saleId, productId, quantityDelta, createdAt) VALUES (?, ?, ?, ?, ?)',
  )

  const saveSale = database.transaction(() => {
    insertSale.run(sale.id, sale.totalPiasters, sale.createdAt)
    if (failurePoint === 'after-sale') {
      throw new Error('Injected fake-sale failure after sale insert')
    }

    for (const line of sale.lines) {
      const lineTotalPiasters = line.quantity * line.unitPricePiasters
      insertSaleItem.run(
        line.id,
        sale.id,
        line.productId,
        line.quantity,
        line.unitPricePiasters,
        lineTotalPiasters,
      )
      if (failurePoint === 'after-item') {
        throw new Error('Injected fake-sale failure after item insert')
      }

      insertStockMovement.run(
        `${line.id}-stock`,
        sale.id,
        line.productId,
        -line.quantity,
        sale.createdAt,
      )
      if (failurePoint === 'after-stock-movement') {
        throw new Error('Injected fake-sale failure after stock movement insert')
      }
    }
  })

  saveSale()
}
