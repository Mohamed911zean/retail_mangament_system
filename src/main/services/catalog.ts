import type { DatabaseHandle } from '../database/repositories/common'
import { runInTransaction } from '../database/repositories/common'
import {
  getCategory, listCategories, insertCategory, updateCategory, softDeleteCategory,
  getProduct, getProductBySku, listProducts, insertProduct, updateProduct, softDeleteProduct,
  insertProductUnit, listProductUnits,
  insertBarcode, listBarcodes, getBarcode,
} from '../database/repositories/catalog'
import { getOnHand } from '../database/repositories/stock'
import type { CategoryRow, ProductRow, BarcodeRow, ProductUnitRow } from '../database/rows'
import type { ProductSummary } from '../../shared/ipc'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import { noFaults } from './fault-injector'
import type { IdGenerator } from './ids'
import { createUlidGenerator } from './ids'
import type { Actor } from './permissions'
import { serviceErr, serviceOk, type ServiceResult } from './result'
import { writeAudit } from './audit'

export type CategoryInput = { name: string; sortOrder?: number }
export type ProductInput = {
  sku?: string | null
  name: string
  categoryId?: string | null
  baseUnitName: string
  qtyScale?: 0 | 3
  priceUnitQtyBase?: number
  costPricePiasters?: number
  sellingPricePiasters?: number
  taxRateBps?: number
  trackExpiry?: boolean
  isWeighted?: boolean
  lowStockThresholdQty?: number
  metadata?: string | null
}

type CatalogDeps = { database: DatabaseHandle; clock: Clock; ids?: IdGenerator; deviceId: string; faults?: FaultInjector }

export class CatalogService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector
  constructor(private readonly deps: CatalogDeps) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  async listCategories(): Promise<ServiceResult<CategoryRow[]>> {
    try { return serviceOk(listCategories(this.deps.database)) } catch (e) { return serviceErr('database_error', e) }
  }

  async createCategory(actor: Actor, input: CategoryInput): Promise<ServiceResult<CategoryRow>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertCategory(tx, { id, name: input.name, sortOrder: input.sortOrder ?? 0, createdAt: now, updatedAt: now, deviceId: this.deps.deviceId })
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'category_created', entityType: 'category', entityId: id, after: { id, name: input.name }, now, deviceId: this.deps.deviceId })
        this.faults.after('category.created_audited')
      })
      const row = getCategory(this.deps.database, id)
      if (row === undefined) return serviceErr('database_error')
      return serviceOk(row)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async updateCategory(actor: Actor, id: string, input: CategoryInput): Promise<ServiceResult<CategoryRow>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      const existing = getCategory(this.deps.database, id)
      if (existing === undefined) return serviceErr('not_found')
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        updateCategory(tx, id, input.name, input.sortOrder ?? existing.sortOrder, now)
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'category_updated', entityType: 'category', entityId: id, before: { name: existing.name }, after: { name: input.name }, now, deviceId: this.deps.deviceId })
        this.faults.after('category.updated_audited')
      })
      const row = getCategory(this.deps.database, id)
      if (row === undefined) return serviceErr('database_error')
      return serviceOk(row)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async deleteCategory(actor: Actor, id: string): Promise<ServiceResult<true>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      if (getCategory(this.deps.database, id) === undefined) return serviceErr('not_found')
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        softDeleteCategory(tx, id, now)
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'category_deleted', entityType: 'category', entityId: id, now, deviceId: this.deps.deviceId })
        this.faults.after('category.deleted_audited')
      })
      return serviceOk(true)
    } catch (e) { return serviceErr('database_error', e) }
  }

  // ─── Products ─────────────────────────────────────────────────────────────

  async listProducts(): Promise<ServiceResult<ProductRow[]>> {
    try { return serviceOk(listProducts(this.deps.database)) } catch (e) { return serviceErr('database_error', e) }
  }

  async getProduct(id: string): Promise<ServiceResult<ProductRow>> {
    try {
      const row = getProduct(this.deps.database, id)
      return row === undefined ? serviceErr('not_found') : serviceOk(row)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async createProduct(actor: Actor, input: ProductInput): Promise<ServiceResult<ProductRow>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      if (input.sku) {
        const existing = getProductBySku(this.deps.database, input.sku)
        if (existing !== undefined) return serviceErr('invalid_input', { field: 'sku', message: 'sku already exists' })
      }
      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertProduct(tx, {
          id, sku: input.sku ?? null, name: input.name, categoryId: input.categoryId ?? null,
          baseUnitName: input.baseUnitName, qtyScale: input.qtyScale ?? 0,
          priceUnitQtyBase: input.priceUnitQtyBase ?? 1,
          costPricePiasters: input.costPricePiasters ?? 0,
          sellingPricePiasters: input.sellingPricePiasters ?? 0,
          taxRateBps: input.taxRateBps ?? 0,
          trackExpiry: input.trackExpiry ?? false,
          isWeighted: input.isWeighted ?? false,
          lowStockThresholdQty: input.lowStockThresholdQty ?? 0,
          metadata: input.metadata ?? null,
          createdAt: now, updatedAt: now, deviceId: this.deps.deviceId,
        })
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'product_created', entityType: 'product', entityId: id, after: { id, name: input.name, sku: input.sku }, now, deviceId: this.deps.deviceId })
        this.faults.after('product.created_audited')
      })
      const row = getProduct(this.deps.database, id)
      if (row === undefined) return serviceErr('database_error')
      return serviceOk(row)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async updateProduct(actor: Actor, id: string, fields: Partial<Pick<ProductInput, 'name' | 'categoryId' | 'sku' | 'sellingPricePiasters' | 'costPricePiasters' | 'taxRateBps' | 'lowStockThresholdQty' | 'metadata'>>): Promise<ServiceResult<ProductRow>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      const existing = getProduct(this.deps.database, id)
      if (existing === undefined) return serviceErr('not_found')
      if (fields.sku && fields.sku !== existing.sku) {
        const dupe = getProductBySku(this.deps.database, fields.sku)
        if (dupe !== undefined && dupe.id !== id) return serviceErr('invalid_input', { field: 'sku', message: 'sku already exists' })
      }
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        updateProduct(tx, id, { ...fields, updatedAt: now })
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'product_updated', entityType: 'product', entityId: id, before: { name: existing.name, sellingPricePiasters: existing.sellingPricePiasters }, after: fields, now, deviceId: this.deps.deviceId })
        this.faults.after('product.updated_audited')
      })
      const row = getProduct(this.deps.database, id)
      if (row === undefined) return serviceErr('database_error')
      return serviceOk(row)
    } catch (e) { return serviceErr('database_error', e) }
  }

  async deleteProduct(actor: Actor, id: string): Promise<ServiceResult<true>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      if (getProduct(this.deps.database, id) === undefined) return serviceErr('not_found')
      const onHand = getOnHand(this.deps.database, id)
      if (onHand.qty !== 0) return serviceErr('product_has_stock', { productId: id, qty: onHand.qty })
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        softDeleteProduct(tx, id, now)
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'product_deleted', entityType: 'product', entityId: id, now, deviceId: this.deps.deviceId })
        this.faults.after('product.deleted_audited')
      })
      return serviceOk(true)
    } catch (e) { return serviceErr('database_error', e) }
  }

  // ─── Product Units ─────────────────────────────────────────────────────────

  async addProductUnit(actor: Actor, productId: string, unitName: string, baseQtyPerUnit: number, sellingPricePiasters: number): Promise<ServiceResult<ProductUnitRow[]>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      if (getProduct(this.deps.database, productId) === undefined) return serviceErr('not_found')
      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertProductUnit(tx, { id, productId, unitName, baseQtyPerUnit, sellingPricePiasters, createdAt: now, updatedAt: now, deviceId: this.deps.deviceId })
        this.faults.after('product_unit.created')
      })
      return serviceOk(listProductUnits(this.deps.database, productId))
    } catch (e) { return serviceErr('database_error', e) }
  }

  async listProductUnits(productId: string): Promise<ServiceResult<ProductUnitRow[]>> {
    try { return serviceOk(listProductUnits(this.deps.database, productId)) } catch (e) { return serviceErr('database_error', e) }
  }

  // ─── Barcodes ─────────────────────────────────────────────────────────────

  async addBarcode(actor: Actor, productId: string, barcode: string, isPrimary: boolean, productUnitId?: string): Promise<ServiceResult<BarcodeRow[]>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      if (getProduct(this.deps.database, productId) === undefined) return serviceErr('not_found')
      const existing = getBarcode(this.deps.database, barcode)
      if (existing !== undefined) return serviceErr('invalid_input', { field: 'barcode', message: 'barcode already assigned' })
      const now = this.deps.clock.now()
      const id = this.ids.next()
      runInTransaction(this.deps.database, (tx) => {
        insertBarcode(tx, { id, barcode, productId, productUnitId: productUnitId ?? null, isPrimary, createdAt: now, updatedAt: now, deviceId: this.deps.deviceId })
        this.faults.after('barcode.created')
      })
      return serviceOk(listBarcodes(this.deps.database, productId))
    } catch (e) { return serviceErr('database_error', e) }
  }

  async listBarcodes(productId: string): Promise<ServiceResult<BarcodeRow[]>> {
    try { return serviceOk(listBarcodes(this.deps.database, productId)) } catch (e) { return serviceErr('database_error', e) }
  }

  async lookupBarcode(barcode: string): Promise<ServiceResult<{ product: ProductRow; barcode: BarcodeRow }>> {
    try {
      const barcodeRow = getBarcode(this.deps.database, barcode)
      if (barcodeRow === undefined) return serviceErr('not_found')
      const product = getProduct(this.deps.database, barcodeRow.productId)
      if (product === undefined) return serviceErr('not_found')
      return serviceOk({ product, barcode: barcodeRow })
    } catch (e) { return serviceErr('database_error', e) }
  }

  // ─── Renderer-facing summaries ─────────────────────────────────────────────

  // The POS screen needs on-hand stock, units and barcodes next to the product
  // row. Composing them here (and not in `ipc/`) keeps the layering rule:
  // ipc -> services -> repositories.

  private summarize(rows: ProductRow[]): ProductSummary[] {
    return rows.map((row) => {
      const onHand = getOnHand(this.deps.database, row.id)
      return {
        ...row,
        onHandQty: onHand.qty,
        onHandValuePiasters: onHand.valuePiasters,
        units: listProductUnits(this.deps.database, row.id),
        barcodes: listBarcodes(this.deps.database, row.id).map((barcode) => barcode.barcode),
      }
    })
  }

  async listProductSummaries(): Promise<ServiceResult<ProductSummary[]>> {
    try { return serviceOk(this.summarize(listProducts(this.deps.database))) } catch (e) { return serviceErr('database_error', e) }
  }

  async getProductSummary(id: string): Promise<ServiceResult<ProductSummary>> {
    try {
      const row = getProduct(this.deps.database, id)
      if (row === undefined) return serviceErr('not_found', { productId: id })
      return serviceOk(this.summarize([row])[0])
    } catch (e) { return serviceErr('database_error', e) }
  }

  async lookupBarcodeSummary(barcode: string): Promise<ServiceResult<ProductSummary>> {
    try {
      const barcodeRow = getBarcode(this.deps.database, barcode)
      if (barcodeRow === undefined) return serviceErr('not_found', { barcode })
      return this.getProductSummary(barcodeRow.productId)
    } catch (e) { return serviceErr('database_error', e) }
  }
}
