import { contextBridge, ipcRenderer } from 'electron'
import type {
  CompleteSaleInput,
  CustomerInput,
  IpcApi,
  IpcChannel,
  IpcResult,
  ProductInput,
  ReverseEntryInput,
  SupplierPaymentInput,
  ReceiptInput,
  UserCreateInput,
  UserUpdateInput,
} from '../shared/ipc'
import type { SettingsKey } from '../shared/settings'

/**
 * Thin, sandboxed bridge. It exposes exactly the channels listed in
 * `IPC_CHANNELS` (the rest of `ipcRenderer` stays private to the preload),
 * always resolves to an `IpcResult`, and never forwards a channel the renderer
 * invents.
 */
function invoke<T>(channel: IpcChannel, payload?: unknown): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>
}

const api: IpcApi = {
  app: {
    getInfo: () => invoke('app:get-info'),
  },

  auth: {
    login: (username: string, password: string) => invoke('auth:login', { username, password }),
    setup: (input: { username: string; displayName: string; password: string }) => invoke('auth:setup', input),
    logout: () => invoke('auth:logout'),
    current: () => invoke('auth:current'),
  },

  users: {
    list: () => invoke('users:list'),
    create: (input: UserCreateInput) => invoke('users:create', input),
    update: (userId: string, fields: UserUpdateInput) => invoke('users:update', { userId, ...fields }),
    deactivate: (userId: string) => invoke('users:deactivate', { userId }),
    changePassword: (userId: string, password: string) => invoke('users:change-password', { userId, password }),
  },

  catalog: {
    listProducts: () => invoke('catalog:list-products'),
    listCategories: () => invoke('catalog:list-categories'),
    getProduct: (productId: string) => invoke('catalog:get-product', { productId }),
    lookupBarcode: (barcode: string) => invoke('catalog:lookup-barcode', { barcode }),
    createProduct: (input: ProductInput) => invoke('catalog:create-product', input),
    updateProduct: (productId: string, fields: Record<string, unknown>) => invoke('catalog:update-product', { productId, ...fields }),
    deleteProduct: (productId: string) => invoke('catalog:delete-product', { productId }),
    createCategory: (name: string) => invoke('catalog:create-category', { name }),
    updateCategory: (categoryId: string, name: string) => invoke('catalog:update-category', { categoryId, name }),
    deleteCategory: (categoryId: string) => invoke('catalog:delete-category', { categoryId }),
    addProductUnit: (productId: string, unitName: string, baseQtyPerUnit: number, sellingPricePiasters: number) =>
      invoke('catalog:add-product-unit', { productId, unitName, baseQtyPerUnit, sellingPricePiasters }),
    addBarcode: (productId: string, barcode: string, isPrimary: boolean) =>
      invoke('catalog:add-barcode', { productId, barcode, isPrimary }),
  },

  customers: {
    list: () => invoke('customers:list'),
    get: (customerId: string) => invoke('customers:get', { customerId }),
    create: (input: CustomerInput) => invoke('customers:create', input),
    update: (customerId: string, input: Partial<CustomerInput>) => invoke('customers:update', { customerId, ...input }),
  },

  sales: {
    complete: (input: CompleteSaleInput) => invoke('sales:complete', input),
    get: (saleId: string) => invoke('sales:get', { saleId }),
    hold: (input: CompleteSaleInput & { label?: string | null }) => invoke('sales:hold', input),
    held: () => invoke('sales:held'),
    recallHeld: (heldSaleId: string) => invoke('sales:recall-held', { heldSaleId }),
    dropHeld: (heldSaleId: string) => invoke('sales:drop-held', { heldSaleId }),
  },

  shifts: {
    current: () => invoke('shifts:current'),
    open: (input: { openingCashPiasters: number }) => invoke('shifts:open', input),
    close: (input: { shiftId: string; countedCashPiasters: number; closingNotes?: string | null }) => invoke('shifts:close', input),
  },

  payments: {
    receipt: (input: ReceiptInput) => invoke('payments:receipt', input),
    reverseReceipt: (input: ReverseEntryInput) => invoke('payments:reverse-receipt', input),
    supplierPayment: (input: SupplierPaymentInput) => invoke('payments:supplier-payment', input),
    reverseSupplierPayment: (input: ReverseEntryInput) => invoke('payments:reverse-supplier-payment', input),
    customerBalance: (customerId: string) => invoke('payments:customer-balance', { customerId }),
    supplierBalance: (supplierId: string) => invoke('payments:supplier-balance', { supplierId }),
  },

  inventory: {
    onHand: (productId: string) => invoke('inventory:on-hand', { productId }),
    listMovements: (productId?: string) => invoke('inventory:list-movements', { productId }),
  },

  settings: {
    get: () => invoke('settings:get'),
    set: (key: SettingsKey, value: unknown) => invoke('settings:set', { key, value }),
    applyPreset: (preset: 'frozen_food' | 'grocery' | 'sweets') => invoke('settings:apply-preset', { preset }),
  },

  printing: {
    listPrinters: () => invoke('printing:list-printers'),
    printTestReceipt: (printerName: string) => invoke('printing:print-test-receipt', { printerName }),
    printSaleReceipt: (printerName: string, saleId: string) => invoke('printing:print-sale-receipt', { printerName, saleId }),
  },

  backup: {
    list: () => invoke('backup:list'),
    create: () => invoke('backup:create'),
    restore: (fileName: string) => invoke('backup:restore', { fileName }),
  },

  license: {
    getStatus: () => invoke('license:get-status'),
    activate: (key: string) => invoke('license:activate', { key }),
  },
}

contextBridge.exposeInMainWorld('api', api)
