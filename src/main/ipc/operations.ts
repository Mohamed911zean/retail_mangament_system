import type { DatabaseHandle } from '../database/repositories/common'
import type { IpcChannel, IpcErrorInfo, IpcResult } from '../../shared/ipc'
import type { SettingsKey } from '../../shared/settings'
import type { Actor } from '../../shared/permissions'
import { serviceErr, serviceOk, ServiceTransactionError, type ServiceResult } from '../services/result'
import { createServices, type Services } from './services'
import { ValidationError, v, type Discount as WireDiscount } from './validate'
import type { Platform } from './platform'
import { buildSaleReceiptData } from '../printing/receipt-data'
import type { Discount as DomainDiscount } from '../../domain/discount'
import { SessionStore } from './session'
import { systemClock, type Clock } from '../services/clock'
import type { IdGenerator } from '../services/ids'

// ─── Context ────────────────────────────────────────────────────────────────

export type OperationContext = {
  /**
   * Resolved per call rather than captured once: restoring a backup closes and
   * reopens the database, so a long-lived handle would be stale.
   */
  getDatabase: () => DatabaseHandle
  session: SessionStore
  platform: Platform
  clock?: Clock
  ids?: IdGenerator
}

type HandlerContext = OperationContext & { services: Services; actor: Actor | null }

export type OperationSpec = {
  /** Requires a logged-in session. */
  auth: boolean
  /** Writes data; refused in licence read-only mode. */
  mutating: boolean
  handle: (context: HandlerContext, payload: unknown) => Promise<ServiceResult<unknown>>
}

function requireActor(context: HandlerContext): Actor {
  if (context.actor === null) throw new ValidationError('session', 'not authenticated')
  return context.actor
}

// ─── Payload parsers ────────────────────────────────────────────────────────

function parseLine(item: unknown, index: number) {
  const line = v.payload(item)
  const at = (field: string): string => `lines[${index}].${field}`
  return {
    productId: v.id(line.productId, at('productId')),
    unitNameSnapshot: v.string(line.unitNameSnapshot, at('unitNameSnapshot'), { max: 64 }),
    pricedUnitQtyBase: line.pricedUnitQtyBase === undefined ? 1 : v.integer(line.pricedUnitQtyBase, at('pricedUnitQtyBase'), { min: 1 }),
    qtyBase: v.integer(line.qtyBase, at('qtyBase'), { min: 1 }),
    unitPricePiasters: v.money(line.unitPricePiasters, at('unitPricePiasters')),
    lineDiscount: v.discount(line.lineDiscount, at('lineDiscount')),
  }
}

function parseTender(item: unknown, index: number) {
  const tender = v.payload(item)
  return {
    method: v.paymentMethod(tender.method, `tenders[${index}].method`),
    amountPiasters: v.money(tender.amountPiasters, `tenders[${index}].amountPiasters`, { min: 1 }),
  }
}

function parseSaleInput(payload: unknown) {
  const input = v.payload(payload)
  return {
    customerId: v.optionalId(input.customerId, 'customerId') ?? null,
    shiftId: v.optionalId(input.shiftId, 'shiftId') ?? null,
    lines: v.array(input.lines, 'lines', parseLine, { min: 1, max: 200 }),
    invoiceDiscount: v.discount(input.invoiceDiscount, 'invoiceDiscount'),
    tenders: v.array(input.tenders ?? [], 'tenders', parseTender, { max: 8 }),
    notes: v.optionalText(input.notes, 'notes') ?? null,
    taxEnabled: v.boolean(input.taxEnabled, 'taxEnabled', false),
    cashRoundingStep: v.integer(input.cashRoundingStep ?? 0, 'cashRoundingStep', { min: 0, max: 1000 }),
  }
}

type SalePayload = ReturnType<typeof parseSaleInput>

/**
 * The wire format calls a percentage discount `percent`/`basisPoints`; the domain
 * calls the same thing `percentage`/`rateBps`. Translating in one place keeps the
 * validator a faithful description of what travels over IPC, while the services
 * see exactly the shape they were written against.
 *
 * This mapping is also why a held sale can be stored as the wire payload as-is:
 * the renderer gets back what it sent, which is what `cartFromSaleLines` expects.
 */
function toDomainDiscount(discount: WireDiscount | undefined): DomainDiscount | undefined {
  if (discount === undefined) return undefined
  if (discount.kind === 'fixed') return { kind: 'fixed', amountPiasters: discount.amountPiasters }
  return { kind: 'percentage', rateBps: discount.basisPoints }
}

function toServiceSaleInput(sale: SalePayload) {
  return {
    ...sale,
    lines: sale.lines.map((line) => ({ ...line, lineDiscount: toDomainDiscount(line.lineDiscount) })),
    invoiceDiscount: toDomainDiscount(sale.invoiceDiscount),
  }
}

// ─── Operations ─────────────────────────────────────────────────────────────

const ok = <T>(value: T): ServiceResult<unknown> => serviceOk(value)

export const operations: Record<IpcChannel, OperationSpec> = {
  // ── App ───────────────────────────────────────────────────────────────────
  'app:get-info': {
    auth: false,
    mutating: false,
    handle: async (context) => {
      const settings = await context.services.settings.get()
      if (!settings.ok) return settings
      return ok({ version: context.platform.version, deviceId: settings.value.device_id, settings: settings.value })
    },
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  'auth:login': {
    auth: false,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const username = v.string(input.username, 'username', { max: 64 })
      const password = v.string(input.password, 'password', { min: 1, max: 200 })
      const result = await context.services.users.login(username, password)
      if (!result.ok) return result
      return ok(context.session.start(result.value.user, (context.clock ?? systemClock).now()))
    },
  },
  'auth:setup': {
    auth: false,
    // Not gated on licence writes: a fresh device may still be unlicensed, and
    // the shop owner must be able to create the first account to get in at all.
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const created = await context.services.users.bootstrapOwner({
        username: v.string(input.username, 'username', { max: 64 }),
        displayName: v.string(input.displayName, 'displayName', { max: 128 }),
        password: v.string(input.password, 'password', { min: 4, max: 200 }),
      })
      if (!created.ok) return created
      return ok(context.session.start(created.value, (context.clock ?? systemClock).now()))
    },
  },
  'auth:logout': {
    auth: false,
    mutating: false,
    handle: async (context) => {
      context.session.end()
      return ok(true)
    },
  },
  'auth:current': {
    auth: false,
    mutating: false,
    handle: async (context) => {
      const users = await context.services.users.listUsers()
      if (!users.ok) return users
      return ok({ user: context.session.currentUser(), needsSetup: users.value.length === 0 })
    },
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  'users:list': {
    auth: true,
    mutating: false,
    handle: async (context) => context.services.users.listUsers(),
  },
  'users:create': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.users.createUser(requireActor(context), {
        username: v.string(input.username, 'username', { max: 64 }),
        displayName: v.string(input.displayName, 'displayName', { max: 128 }),
        role: v.role(input.role, 'role'),
        password: v.string(input.password, 'password', { min: 4, max: 200 }),
      })
    },
  },
  'users:update': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const fields: { displayName?: string; role?: Actor['role']; isActive?: boolean } = {}
      if (input.displayName !== undefined) fields.displayName = v.string(input.displayName, 'displayName', { max: 128 })
      if (input.role !== undefined) fields.role = v.role(input.role, 'role')
      if (input.isActive !== undefined) fields.isActive = v.boolean(input.isActive, 'isActive')
      return context.services.users.updateUser(requireActor(context), v.id(input.userId, 'userId'), fields)
    },
  },
  'users:deactivate': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.users.deactivateUser(requireActor(context), v.id(input.userId, 'userId'))
    },
  },
  'users:change-password': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.users.changePassword(
        requireActor(context),
        v.id(input.userId, 'userId'),
        v.string(input.password, 'password', { min: 4, max: 200 }),
      )
    },
  },

  // ── Catalog ───────────────────────────────────────────────────────────────
  'catalog:list-products': {
    auth: true,
    mutating: false,
    handle: async (context) => context.services.catalog.listProductSummaries(),
  },
  'catalog:list-categories': {
    auth: true,
    mutating: false,
    handle: async (context) => context.services.catalog.listCategories(),
  },
  'catalog:get-product': {
    auth: true,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.catalog.getProductSummary(v.id(input.productId, 'productId'))
    },
  },
  'catalog:lookup-barcode': {
    auth: true,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.catalog.lookupBarcodeSummary(v.barcode(input.barcode, 'barcode'))
    },
  },
  'catalog:create-product': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const created = await context.services.catalog.createProduct(requireActor(context), {
        name: v.string(input.name, 'name', { max: 200 }),
        sku: v.optionalText(input.sku, 'sku', { max: 64 }) ?? null,
        categoryId: v.optionalId(input.categoryId, 'categoryId') ?? null,
        baseUnitName: v.string(input.baseUnitName, 'baseUnitName', { max: 32 }),
        qtyScale: v.oneOf(input.qtyScale ?? 0, 'qtyScale', [0, 3] as const),
        priceUnitQtyBase: v.integer(input.priceUnitQtyBase ?? 1, 'priceUnitQtyBase', { min: 1 }),
        costPricePiasters: v.money(input.costPricePiasters ?? 0, 'costPricePiasters'),
        sellingPricePiasters: v.money(input.sellingPricePiasters ?? 0, 'sellingPricePiasters'),
        taxRateBps: v.integer(input.taxRateBps ?? 0, 'taxRateBps', { min: 0, max: 100_000 }),
        trackExpiry: v.boolean(input.trackExpiry, 'trackExpiry', false),
        isWeighted: v.boolean(input.isWeighted, 'isWeighted', false),
        lowStockThresholdQty: v.integer(input.lowStockThresholdQty ?? 0, 'lowStockThresholdQty', { min: 0 }),
      })
      if (!created.ok) return created
      return context.services.catalog.getProductSummary(created.value.id)
    },
  },
  'catalog:update-product': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const fields: Record<string, unknown> = {}
      if (input.name !== undefined) fields.name = v.string(input.name, 'name', { max: 200 })
      if (input.categoryId !== undefined) fields.categoryId = v.optionalId(input.categoryId, 'categoryId') ?? null
      if (input.sku !== undefined) fields.sku = v.optionalText(input.sku, 'sku', { max: 64 }) ?? null
      if (input.baseUnitName !== undefined) fields.baseUnitName = v.string(input.baseUnitName, 'baseUnitName', { max: 32 })
      if (input.qtyScale !== undefined) fields.qtyScale = v.oneOf(input.qtyScale, 'qtyScale', [0, 3] as const)
      if (input.priceUnitQtyBase !== undefined) fields.priceUnitQtyBase = v.integer(input.priceUnitQtyBase, 'priceUnitQtyBase', { min: 1 })
      if (input.sellingPricePiasters !== undefined) fields.sellingPricePiasters = v.money(input.sellingPricePiasters, 'sellingPricePiasters')
      if (input.costPricePiasters !== undefined) fields.costPricePiasters = v.money(input.costPricePiasters, 'costPricePiasters')
      if (input.taxRateBps !== undefined) fields.taxRateBps = v.integer(input.taxRateBps, 'taxRateBps', { min: 0, max: 100_000 })
      if (input.trackExpiry !== undefined) fields.trackExpiry = v.boolean(input.trackExpiry, 'trackExpiry')
      if (input.isWeighted !== undefined) fields.isWeighted = v.boolean(input.isWeighted, 'isWeighted')
      if (input.lowStockThresholdQty !== undefined) fields.lowStockThresholdQty = v.integer(input.lowStockThresholdQty, 'lowStockThresholdQty', { min: 0 })
      const updated = await context.services.catalog.updateProduct(requireActor(context), v.id(input.productId, 'productId'), fields)
      if (!updated.ok) return updated
      return context.services.catalog.getProductSummary(updated.value.id)
    },
  },
  'catalog:delete-product': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.catalog.deleteProduct(requireActor(context), v.id(input.productId, 'productId'))
    },
  },
  'catalog:create-category': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.catalog.createCategory(requireActor(context), { name: v.string(input.name, 'name', { max: 120 }) })
    },
  },
  'catalog:update-category': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.catalog.updateCategory(requireActor(context), v.id(input.categoryId, 'categoryId'), { name: v.string(input.name, 'name', { max: 120 }) })
    },
  },
  'catalog:delete-category': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.catalog.deleteCategory(requireActor(context), v.id(input.categoryId, 'categoryId'))
    },
  },
  'catalog:add-product-unit': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const productId = v.id(input.productId, 'productId')
      const units = await context.services.catalog.addProductUnit(
        requireActor(context),
        productId,
        v.string(input.unitName, 'unitName', { max: 32 }),
        v.integer(input.baseQtyPerUnit, 'baseQtyPerUnit', { min: 1 }),
        v.money(input.sellingPricePiasters, 'sellingPricePiasters'),
      )
      if (!units.ok) return units
      return context.services.catalog.getProductSummary(productId)
    },
  },
  'catalog:remove-product-unit': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const productId = v.id(input.productId, 'productId')
      const units = await context.services.catalog.removeProductUnit(
        requireActor(context),
        productId,
        v.id(input.unitId, 'unitId'),
      )
      if (!units.ok) return units
      return context.services.catalog.getProductSummary(productId)
    },
  },
  'catalog:add-barcode': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const productId = v.id(input.productId, 'productId')
      const barcodes = await context.services.catalog.addBarcode(
        requireActor(context),
        productId,
        v.barcode(input.barcode, 'barcode'),
        v.boolean(input.isPrimary, 'isPrimary', false),
      )
      if (!barcodes.ok) return barcodes
      return context.services.catalog.getProductSummary(productId)
    },
  },
  'catalog:remove-barcode': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const productId = v.id(input.productId, 'productId')
      const barcodes = await context.services.catalog.removeBarcode(
        requireActor(context),
        productId,
        v.barcode(input.barcode, 'barcode'),
      )
      if (!barcodes.ok) return barcodes
      return context.services.catalog.getProductSummary(productId)
    },
  },

  // ── Customers ─────────────────────────────────────────────────────────────
  'customers:list': {
    auth: true,
    mutating: false,
    handle: async (context) => context.services.customers.list(),
  },
  'customers:get': {
    auth: true,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.customers.get(v.id(input.customerId, 'customerId'))
    },
  },
  'customers:create': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.customers.create(requireActor(context), {
        name: v.string(input.name, 'name', { max: 200 }),
        phone: v.optionalText(input.phone, 'phone', { max: 32 }) ?? null,
        address: v.optionalText(input.address, 'address', { max: 300 }) ?? null,
        creditLimitPiasters: input.creditLimitPiasters === undefined || input.creditLimitPiasters === null
          ? null
          : v.money(input.creditLimitPiasters, 'creditLimitPiasters'),
      })
    },
  },
  'customers:update': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const fields: { name?: string; phone?: string | null; address?: string | null; creditLimitPiasters?: number | null } = {}
      if (input.name !== undefined) fields.name = v.string(input.name, 'name', { max: 200 })
      if (input.phone !== undefined) fields.phone = v.optionalText(input.phone, 'phone', { max: 32 }) ?? null
      if (input.address !== undefined) fields.address = v.optionalText(input.address, 'address', { max: 300 }) ?? null
      if (input.creditLimitPiasters !== undefined) {
        fields.creditLimitPiasters = input.creditLimitPiasters === null ? null : v.money(input.creditLimitPiasters, 'creditLimitPiasters')
      }
      return context.services.customers.update(requireActor(context), v.id(input.customerId, 'customerId'), fields)
    },
  },

  // ── Sales ─────────────────────────────────────────────────────────────────
  'sales:complete': {
    auth: true,
    mutating: true,
    handle: async (context, payload) =>
      context.services.sales.completeSale(requireActor(context), toServiceSaleInput(parseSaleInput(payload))),
  },
  'sales:get': {
    auth: true,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.sales.getSale(v.id(input.saleId, 'saleId'))
    },
  },
  'sales:hold': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const sale = parseSaleInput(payload)
      return context.services.sales.holdSale(
        requireActor(context),
        sale as unknown as object,
        v.optionalText(input.label, 'label', { max: 80 }) ?? null,
        sale.shiftId,
        sale.customerId,
      )
    },
  },
  'sales:held': {
    auth: true,
    mutating: false,
    handle: async (context) => context.services.sales.listHeldSales(context.actor?.userId),
  },
  'sales:recall-held': {
    auth: true,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.sales.recallHeldSale(v.id(input.heldSaleId, 'heldSaleId'))
    },
  },
  'sales:drop-held': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.sales.deleteHeldSale(v.id(input.heldSaleId, 'heldSaleId'))
    },
  },

  // ── Shifts ────────────────────────────────────────────────────────────────
  'shifts:current': {
    auth: true,
    mutating: false,
    handle: async (context) => context.services.shifts.getOpenShift(),
  },
  'shifts:open': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.shifts.openShift(requireActor(context), {
        openingCashPiasters: v.money(input.openingCashPiasters, 'openingCashPiasters'),
      })
    },
  },
  'shifts:close': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.shifts.closeShift(requireActor(context), {
        shiftId: v.id(input.shiftId, 'shiftId'),
        countedCashPiasters: v.money(input.countedCashPiasters, 'countedCashPiasters'),
        closingNotes: v.optionalText(input.closingNotes, 'closingNotes', { max: 300 }) ?? null,
      })
    },
  },

  // ── Payments ──────────────────────────────────────────────────────────────
  'payments:receipt': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.payments.recordCustomerReceipt(requireActor(context), {
        customerId: v.id(input.customerId, 'customerId'),
        amountPiasters: v.money(input.amountPiasters, 'amountPiasters', { min: 1 }),
        method: v.paymentMethod(input.method, 'method'),
        referenceText: v.optionalText(input.referenceText, 'referenceText', { max: 300 }) ?? null,
      })
    },
  },
  'payments:reverse-receipt': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.payments.reverseCustomerReceipt(requireActor(context), {
        entryId: v.id(input.entryId, 'entryId'),
        reason: v.optionalText(input.reason, 'reason', { max: 300 }) ?? null,
      })
    },
  },
  'payments:supplier-payment': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.payments.recordSupplierPayment(requireActor(context), {
        supplierId: v.id(input.supplierId, 'supplierId'),
        amountPiasters: v.money(input.amountPiasters, 'amountPiasters', { min: 1 }),
        method: v.paymentMethod(input.method, 'method'),
        referenceText: v.optionalText(input.referenceText, 'referenceText', { max: 300 }) ?? null,
      })
    },
  },
  'payments:reverse-supplier-payment': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.payments.reverseSupplierPayment(requireActor(context), {
        entryId: v.id(input.entryId, 'entryId'),
        reason: v.optionalText(input.reason, 'reason', { max: 300 }) ?? null,
      })
    },
  },
  'payments:customer-balance': {
    auth: true,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.payments.getCustomerBalance(v.id(input.customerId, 'customerId'))
    },
  },
  'payments:supplier-balance': {
    auth: true,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.payments.getSupplierBalance(v.id(input.supplierId, 'supplierId'))
    },
  },

  // ── Inventory ─────────────────────────────────────────────────────────────
  'inventory:on-hand': {
    auth: true,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.inventory.getOnHand(v.id(input.productId, 'productId'))
    },
  },
  'inventory:list-movements': {
    auth: true,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return context.services.inventory.listMovements(v.optionalId(input.productId, 'productId') ?? undefined)
    },
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  'settings:get': {
    auth: false,
    mutating: false,
    handle: async (context) => context.services.settings.get(),
  },
  'settings:set': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const key = v.oneOf(input.key, 'key', [
        'shop_name', 'shifts', 'expiry_batches', 'weighted_items', 'customer_credit', 'tax',
        'allow_negative_stock', 'payment_methods', 'cash_rounding_step_piasters',
      ] as const) as SettingsKey
      const value = parseSettingValue(key, input.value)
      return context.services.settings.set(requireActor(context), key, value as never)
    },
  },
  'settings:apply-preset': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const preset = v.oneOf(input.preset, 'preset', ['frozen_food', 'grocery', 'sweets'] as const)
      const actor = requireActor(context)
      if (preset === 'frozen_food') return context.services.settings.applyFrozenFoodPreset(actor)
      if (preset === 'grocery') return context.services.settings.applyGroceryPreset(actor)
      return context.services.settings.applySweetsPreset(actor)
    },
  },

  // ── Printing ──────────────────────────────────────────────────────────────
  'printing:list-printers': {
    auth: false,
    mutating: false,
    handle: async (context) => ok(await context.platform.listPrinters()),
  },
  'printing:print-test-receipt': {
    auth: true,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return ok(await context.platform.printTestReceipt(v.string(input.printerName, 'printerName', { max: 300 })))
    },
  },
  'printing:print-sale-receipt': {
    auth: true,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      const printerName = v.string(input.printerName, 'printerName', { max: 300 })
      const saleId = v.id(input.saleId, 'saleId')

      // The receipt is rebuilt from the stored sale, never from what the screen
      // sent: a reprinted invoice must show the same numbers as the original,
      // even if the cashier has since changed a price in the catalog.
      const sale = await context.services.sales.getSale(saleId)
      if (!sale.ok) return sale
      const payments = await context.services.sales.listPayments(saleId)
      if (!payments.ok) return payments
      const settings = await context.services.settings.get()
      if (!settings.ok) return settings

      // A missing customer record must not stop the print: the receipt simply
      // omits the name.
      let customerName: string | null = null
      if (sale.value.sale.customerId !== null) {
        const customer = await context.services.customers.get(sale.value.sale.customerId)
        if (customer.ok) customerName = customer.value.name
      }

      const receipt = buildSaleReceiptData({
        sale: sale.value.sale,
        items: sale.value.items,
        payments: payments.value,
        shopName: settings.value.shop_name,
        customerName,
      })
      return ok(await context.platform.printSaleReceipt(printerName, saleId, receipt))
    },
  },

  // ── Backup ────────────────────────────────────────────────────────────────
  'backup:list': {
    auth: false,
    mutating: false,
    handle: async (context) => ok(context.platform.listBackups()),
  },
  'backup:create': {
    auth: true,
    mutating: true,
    handle: async (context) => ok(await context.platform.createBackup()),
  },
  'backup:restore': {
    auth: true,
    mutating: true,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return ok(await context.platform.restoreBackup(v.string(input.fileName, 'fileName', { max: 300 })))
    },
  },

  // ── Licence ───────────────────────────────────────────────────────────────
  'license:get-status': {
    auth: false,
    mutating: false,
    handle: async (context) => ok(await context.platform.licenseStatus()),
  },
  'license:activate': {
    auth: false,
    mutating: false,
    handle: async (context, payload) => {
      const input = v.payload(payload)
      return ok(await context.platform.activateLicense(v.string(input.key, 'key', { min: 8, max: 4096 })))
    },
  },
}

/** Only the settings the UI is allowed to write, typed per key. */
function parseSettingValue(key: SettingsKey, value: unknown): unknown {
  switch (key) {
    case 'shop_name':
      return v.string(value, 'value', { max: 120 })
    case 'shifts':
    case 'expiry_batches':
    case 'weighted_items':
    case 'customer_credit':
    case 'tax':
    case 'allow_negative_stock':
      return v.boolean(value, 'value')
    case 'cash_rounding_step_piasters':
      return v.integer(value, 'value', { min: 0, max: 1000 })
    case 'payment_methods':
      return v.array(value, 'value', (item, index) => v.paymentMethod(item, `value[${index}]`), { min: 1, max: 3 })
  }
}

// ─── Runner ─────────────────────────────────────────────────────────────────

function failure(error: IpcErrorInfo): IpcResult<never> {
  return { ok: false, error }
}

function fromService(error: { code: string; messageKey: string; details?: unknown }): IpcResult<never> {
  return failure({ code: error.code, messageKey: error.messageKey, details: error.details })
}

/**
 * Runs one IPC operation. Never throws: every failure becomes an `IpcResult`
 * error with a stable code and an Arabic `messageKey`, so the renderer can show
 * a clear message and the app keeps running (AGENTS.md §3 rule 7).
 */
export async function runOperation(
  channel: IpcChannel,
  payload: unknown,
  context: OperationContext,
): Promise<IpcResult<unknown>> {
  const spec = operations[channel]
  if (spec === undefined) return failure({ code: 'unknown_channel', messageKey: 'errors.unknown_channel', details: { channel } })

  try {
    if (spec.auth && context.session.actor() === null) {
      return fromService(serviceErr('not_authenticated').error)
    }
    if (spec.mutating && !(await context.platform.isWriteAllowed())) {
      return fromService(serviceErr('read_only_mode').error)
    }

    const services = createServices(context.getDatabase(), { clock: context.clock, ids: context.ids })
    const result = await spec.handle(
      { ...context, services, actor: context.session.actor() },
      payload,
    )
    return result.ok ? { ok: true, value: result.value } : fromService(result.error)
  } catch (error) {
    if (error instanceof ValidationError) {
      return failure({ code: 'invalid_input', messageKey: 'errors.invalid_input', details: { field: error.field } })
    }
    if (error instanceof ServiceTransactionError) return fromService(error.result.error)
    // Never leak a stack trace to the renderer; the main process logs it.
    if (context.platform.reportUnexpectedError !== undefined) {
      context.platform.reportUnexpectedError(`${channel} failed`, error)
    }
    return failure({ code: 'internal_error', messageKey: 'errors.internal_error', details: { channel } })
  }
}
