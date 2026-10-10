/**
 * The single typed contract between the renderer and the main process.
 *
 * Rules (see AGENTS.md §4):
 * - The renderer never imports main-process code; it only sees this file.
 * - Every call resolves to `IpcResult<T>` — the main process never rejects, so
 *   the Arabic error code/message key survive Electron's error serialization.
 * - The actor (who is acting) is derived in the main process from the session,
 *   never passed by the renderer.
 */
import type { Settings, SettingsKey, PaymentMethod } from './settings'
import type { PermissionCode, Role } from './permissions'
import type { BackupInfo } from './backup'
import type { PrinterInfo, PrintSaleReceiptResult } from './printing'
import type { LicenseStatus } from './license/api'
import type {
  CategoryRow,
  CustomerRow,
  MoneyLedgerRow,
  ProductRow,
  ProductUnitRow,
  SaleItemRow,
  SaleRow,
  ShiftRow,
  StockMovementRow,
} from './rows'

// ─── Result envelope ────────────────────────────────────────────────────────

export type IpcErrorInfo = {
  /** Stable machine code, e.g. `insufficient_stock`. */
  code: string
  /** i18n key for the Arabic message, e.g. `errors.insufficient_stock`. */
  messageKey: string
  /** Optional structured context (never a stack trace). */
  details?: unknown
}

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: IpcErrorInfo }

// ─── Session / app ──────────────────────────────────────────────────────────

export type CurrentUser = {
  id: string
  username: string
  displayName: string
  role: Role
  permissions: readonly PermissionCode[]
}

/** User shape safe to hand to the renderer: never contains a password hash. */
export type PublicUser = {
  id: string
  username: string
  displayName: string
  role: Role
  isActive: boolean
  lastLoginAt: number | null
}

export type AppInfo = {
  version: string
  deviceId: string
  settings: Settings
}

export type AuthStatus = {
  user: CurrentUser | null
  /** True on a brand-new device: the UI must create the owner before login. */
  needsSetup: boolean
}

export type SetupInput = {
  username: string
  displayName: string
  password: string
}

// ─── Payloads ───────────────────────────────────────────────────────────────

export type ProductSummary = ProductRow & {
  /** On-hand quantity in base units, from the stock ledger. */
  onHandQty: number
  /** Value of the on-hand stock in piasters (weighted average cost basis). */
  onHandValuePiasters: number
  units: ProductUnitRow[]
  /** Barcodes for fast scanner lookup in the POS grid. */
  barcodes: string[]
}

export type ProductInput = {
  name: string
  sku?: string | null
  categoryId?: string | null
  baseUnitName: string
  qtyScale?: 0 | 3
  priceUnitQtyBase?: number
  costPricePiasters?: number
  sellingPricePiasters?: number
  taxRateBps?: number
  /** Turns on the batch/expiry fields for this product (`features.expiry_batches`). */
  trackExpiry?: boolean
  isWeighted?: boolean
  lowStockThresholdQty?: number
}

/**
 * An absent field keeps its stored value. The packaging fields (`baseUnitName`,
 * `qtyScale`, `priceUnitQtyBase`) are accepted here but the service refuses a
 * *change* to them once the product has stock movements, because the ledger
 * stores quantities in the base unit and a new scale would reinterpret them.
 */
export type ProductUpdateInput = Partial<{
  name: string
  categoryId: string | null
  sku: string | null
  baseUnitName: string
  qtyScale: 0 | 3
  priceUnitQtyBase: number
  sellingPricePiasters: number
  costPricePiasters: number
  taxRateBps: number
  trackExpiry: boolean
  isWeighted: boolean
  lowStockThresholdQty: number
}>

export type CustomerInput = {
  name: string
  phone?: string | null
  address?: string | null
  creditLimitPiasters?: number | null
}

export type CustomerSummary = CustomerRow & { balancePiasters: number }

export type SaleTender = { method: PaymentMethod; amountPiasters: number }

export type SaleLine = {
  productId: string
  unitNameSnapshot: string
  /** Base-unit quantity covered by one priced unit (1 for counted goods). */
  pricedUnitQtyBase: number
  qtyBase: number
  unitPricePiasters: number
  lineDiscount?: { kind: 'fixed'; amountPiasters: number } | { kind: 'percent'; basisPoints: number }
}

export type CompleteSaleInput = {
  customerId?: string | null
  shiftId?: string | null
  lines: SaleLine[]
  invoiceDiscount?: { kind: 'fixed'; amountPiasters: number } | { kind: 'percent'; basisPoints: number }
  tenders: SaleTender[]
  notes?: string | null
  taxEnabled: boolean
  cashRoundingStep: number
}

export type HeldSaleSummary = { id: string; label: string | null; heldAt: number }

/**
 * A held sale is stored as the exact payload the renderer sent, so recalling it
 * hands back a `CompleteSaleInput` the cart can rebuild itself from without any
 * conversion. `label` is the only extra field.
 */
export type HeldSalePayload = CompleteSaleInput & { label?: string | null }

export type OpenShiftInput = { openingCashPiasters: number }
export type CloseShiftInput = { shiftId: string; countedCashPiasters: number; closingNotes?: string | null }

export type CloseShiftResult = {
  shift: ShiftRow
  expectedCashPiasters: number
  differencePiasters: number
  reconciliation: 'balanced' | 'over' | 'short'
}

export type ReceiptInput = { customerId: string; amountPiasters: number; method: PaymentMethod; referenceText?: string | null }
export type SupplierPaymentInput = { supplierId: string; amountPiasters: number; method: PaymentMethod; referenceText?: string | null }
export type ReverseEntryInput = { entryId: string; reason?: string | null }

export type UserCreateInput = { username: string; displayName: string; role: Role; password: string }
export type UserUpdateInput = Partial<{ displayName: string; role: Role; isActive: boolean }>

// ─── Channels ───────────────────────────────────────────────────────────────

/** Every channel the preload is allowed to invoke. Nothing else is exposed. */
export const IPC_CHANNELS = [
  'app:get-info',

  'auth:login',
  'auth:setup',
  'auth:logout',
  'auth:current',

  'users:list',
  'users:create',
  'users:update',
  'users:deactivate',
  'users:change-password',

  'catalog:list-products',
  'catalog:list-categories',
  'catalog:lookup-barcode',
  'catalog:get-product',
  'catalog:create-product',
  'catalog:update-product',
  'catalog:delete-product',
  'catalog:create-category',
  'catalog:update-category',
  'catalog:delete-category',
  'catalog:add-product-unit',
  'catalog:remove-product-unit',
  'catalog:add-barcode',
  'catalog:remove-barcode',

  'customers:list',
  'customers:get',
  'customers:create',
  'customers:update',

  'sales:complete',
  'sales:get',
  'sales:hold',
  'sales:held',
  'sales:recall-held',
  'sales:drop-held',

  'shifts:current',
  'shifts:open',
  'shifts:close',

  'payments:receipt',
  'payments:reverse-receipt',
  'payments:supplier-payment',
  'payments:reverse-supplier-payment',
  'payments:customer-balance',
  'payments:supplier-balance',

  'inventory:on-hand',
  'inventory:list-movements',

  'settings:get',
  'settings:set',
  'settings:apply-preset',

  'printing:list-printers',
  'printing:print-test-receipt',
  'printing:print-sale-receipt',

  'backup:list',
  'backup:create',
  'backup:restore',

  'license:get-status',
  'license:activate',
] as const

export type IpcChannel = (typeof IPC_CHANNELS)[number]

// ─── Renderer-facing API ────────────────────────────────────────────────────

export type IpcApi = {
  app: {
    getInfo: () => Promise<IpcResult<AppInfo>>
  }
  auth: {
    login: (username: string, password: string) => Promise<IpcResult<CurrentUser>>
    /** First-run only: creates the shop owner. Refused once any user exists. */
    setup: (input: SetupInput) => Promise<IpcResult<CurrentUser>>
    logout: () => Promise<IpcResult<true>>
    current: () => Promise<IpcResult<AuthStatus>>
  }
  users: {
    list: () => Promise<IpcResult<PublicUser[]>>
    create: (input: UserCreateInput) => Promise<IpcResult<PublicUser>>
    update: (userId: string, fields: UserUpdateInput) => Promise<IpcResult<PublicUser>>
    deactivate: (userId: string) => Promise<IpcResult<true>>
    changePassword: (userId: string, password: string) => Promise<IpcResult<true>>
  }
  catalog: {
    listProducts: () => Promise<IpcResult<ProductSummary[]>>
    listCategories: () => Promise<IpcResult<CategoryRow[]>>
    lookupBarcode: (barcode: string) => Promise<IpcResult<ProductSummary>>
    getProduct: (productId: string) => Promise<IpcResult<ProductSummary>>
    createProduct: (input: ProductInput) => Promise<IpcResult<ProductSummary>>
    updateProduct: (productId: string, fields: ProductUpdateInput) => Promise<IpcResult<ProductSummary>>
    deleteProduct: (productId: string) => Promise<IpcResult<true>>
    createCategory: (name: string) => Promise<IpcResult<CategoryRow>>
    updateCategory: (categoryId: string, name: string) => Promise<IpcResult<CategoryRow>>
    deleteCategory: (categoryId: string) => Promise<IpcResult<true>>
    addProductUnit: (productId: string, unitName: string, baseQtyPerUnit: number, sellingPricePiasters: number) => Promise<IpcResult<ProductSummary>>
    removeProductUnit: (productId: string, unitId: string) => Promise<IpcResult<ProductSummary>>
    addBarcode: (productId: string, barcode: string, isPrimary: boolean) => Promise<IpcResult<ProductSummary>>
    removeBarcode: (productId: string, barcode: string) => Promise<IpcResult<ProductSummary>>
  }
  customers: {
    list: () => Promise<IpcResult<CustomerSummary[]>>
    get: (customerId: string) => Promise<IpcResult<CustomerSummary>>
    create: (input: CustomerInput) => Promise<IpcResult<CustomerSummary>>
    update: (customerId: string, input: Partial<CustomerInput>) => Promise<IpcResult<CustomerSummary>>
  }
  sales: {
    complete: (input: CompleteSaleInput) => Promise<IpcResult<{ sale: SaleRow; items: SaleItemRow[] }>>
    get: (saleId: string) => Promise<IpcResult<{ sale: SaleRow; items: SaleItemRow[] }>>
    hold: (input: CompleteSaleInput & { label?: string | null }) => Promise<IpcResult<{ id: string }>>
    held: () => Promise<IpcResult<HeldSaleSummary[]>>
    recallHeld: (id: string) => Promise<IpcResult<HeldSalePayload>>
    dropHeld: (id: string) => Promise<IpcResult<true>>
  }
  shifts: {
    current: () => Promise<IpcResult<ShiftRow | null>>
    open: (input: OpenShiftInput) => Promise<IpcResult<{ id: string }>>
    close: (input: CloseShiftInput) => Promise<IpcResult<CloseShiftResult>>
  }
  payments: {
    receipt: (input: ReceiptInput) => Promise<IpcResult<{ id: string }>>
    reverseReceipt: (input: ReverseEntryInput) => Promise<IpcResult<{ id: string }>>
    supplierPayment: (input: SupplierPaymentInput) => Promise<IpcResult<{ id: string }>>
    reverseSupplierPayment: (input: ReverseEntryInput) => Promise<IpcResult<{ id: string }>>
    customerBalance: (customerId: string) => Promise<IpcResult<{ balancePiasters: number; status: string }>>
    supplierBalance: (supplierId: string) => Promise<IpcResult<{ balancePiasters: number; status: string }>>
  }
  inventory: {
    onHand: (productId: string) => Promise<IpcResult<{ qty: number; valuePiasters: number }>>
    listMovements: (productId?: string) => Promise<IpcResult<StockMovementRow[]>>
  }
  settings: {
    get: () => Promise<IpcResult<Settings>>
    set: (key: SettingsKey, value: Settings[SettingsKey]) => Promise<IpcResult<Settings>>
    applyPreset: (preset: 'frozen_food' | 'grocery' | 'sweets') => Promise<IpcResult<Settings>>
  }
  printing: {
    listPrinters: () => Promise<IpcResult<PrinterInfo[]>>
    printTestReceipt: (printerName: string) => Promise<IpcResult<unknown>>
    /**
     * Prints a sale that is already saved. The receipt is built in main from the
     * stored sale (the renderer cannot invent amounts), so a failed print can be
     * retried from the selling screen without touching the invoice.
     */
    printSaleReceipt: (printerName: string, saleId: string) => Promise<IpcResult<PrintSaleReceiptResult>>
  }
  backup: {
    list: () => Promise<IpcResult<BackupInfo[]>>
    create: () => Promise<IpcResult<BackupInfo>>
    restore: (fileName: string) => Promise<IpcResult<BackupInfo[]>>
  }
  license: {
    getStatus: () => Promise<IpcResult<LicenseStatus>>
    activate: (key: string) => Promise<IpcResult<LicenseStatus>>
  }
}

export type { Settings, PaymentMethod, MoneyLedgerRow }
