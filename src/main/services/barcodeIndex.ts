import type { DatabaseHandle } from '../database/repositories/common'
import { normalize, upcAToEan13 } from '../../domain/barcodeValidation'

export type BarcodeIndexEntry = {
  productId: string
  productUnitId: string | null
}

/**
 * In-memory fast barcode index for O(1) scanner lookups.
 * Kept in memory in the main process and refreshed when catalog mutating operations occur.
 */
export class BarcodeIndex {
  private entries = new Map<string, BarcodeIndexEntry>()
  private dirty = true

  constructor() {}

  /**
   * Rebuilds the in-memory index from the SQLite barcodes table.
   * Loads all non-deleted barcodes in one query.
   */
  build(database: DatabaseHandle): void {
    this.entries.clear()
    const rows = database
      .prepare(
        'SELECT barcode, product_id, product_unit_id FROM barcodes WHERE deleted_at IS NULL',
      )
      .all() as Array<{
      barcode: string
      product_id: string
      product_unit_id: string | null
    }>

    for (const row of rows) {
      const normalized = normalize(row.barcode)
      if (normalized.length > 0) {
        this.entries.set(normalized, {
          productId: row.product_id,
          productUnitId: row.product_unit_id,
        })
      }
    }
    this.dirty = false
  }

  /**
   * Marks the index as dirty so it will be rebuilt on the next query.
   */
  invalidate(): void {
    this.dirty = true
  }

  /**
   * Looks up a barcode in O(1) time. Normalizes digits and handles UPC-A/EAN-13 equivalences.
   */
  get(barcode: string, database?: DatabaseHandle): BarcodeIndexEntry | undefined {
    if (this.dirty && database) {
      this.build(database)
    }
    const normalized = normalize(barcode)
    if (!normalized) return undefined

    // 1. Direct match
    const direct = this.entries.get(normalized)
    if (direct !== undefined) return direct

    // 2. If 12-digit UPC-A, try with leading zero (EAN-13)
    if (normalized.length === 12) {
      const ean13 = upcAToEan13(normalized)
      const eanMatch = this.entries.get(ean13)
      if (eanMatch !== undefined) return eanMatch
    }

    // 3. If 13-digit starting with 0, try 12-digit without leading 0
    if (normalized.length === 13 && normalized.startsWith('0')) {
      const upcA = normalized.slice(1)
      const upcMatch = this.entries.get(upcA)
      if (upcMatch !== undefined) return upcMatch
    }

    return undefined
  }

  set(barcode: string, entry: BarcodeIndexEntry): void {
    const normalized = normalize(barcode)
    if (normalized.length > 0) {
      this.entries.set(normalized, entry)
    }
  }

  delete(barcode: string): void {
    const normalized = normalize(barcode)
    if (normalized.length > 0) {
      this.entries.delete(normalized)
    }
  }

  clear(): void {
    this.entries.clear()
    this.dirty = true
  }

  size(): number {
    return this.entries.size
  }

  isDirty(): boolean {
    return this.dirty
  }
}

/** Global singleton barcode index in main process */
export const globalBarcodeIndex = new BarcodeIndex()
