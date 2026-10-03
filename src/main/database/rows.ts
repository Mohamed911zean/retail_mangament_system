export interface CommonRow {
  createdAt: number
  updatedAt: number
  deviceId: string
}

export interface SettingRow extends CommonRow {
  key: string
  value: string
  valueType: 'string' | 'integer' | 'boolean' | 'json'
  description: string | null
}
export interface UserRow extends CommonRow {
  id: string
  username: string
  displayName: string
  passwordHash: string
  role: 'owner' | 'manager' | 'cashier'
  isActive: boolean
  lastLoginAt: number | null
  deletedAt: number | null
}
export interface CategoryRow extends CommonRow { id: string; name: string; sortOrder: number; deletedAt: number | null }
export interface CustomerRow extends CommonRow { id: string; name: string; phone: string | null; address: string | null; creditLimitPiasters: number | null; metadata: string | null; deletedAt: number | null }
export interface SupplierRow extends CommonRow { id: string; name: string; phone: string | null; address: string | null; metadata: string | null; deletedAt: number | null }
export interface ProductRow extends CommonRow {
  id: string; sku: string | null; name: string; categoryId: string | null; baseUnitName: string
  qtyScale: 0 | 3; priceUnitQtyBase: number; costPricePiasters: number; sellingPricePiasters: number
  taxRateBps: number; trackExpiry: boolean; isWeighted: boolean; lowStockThresholdQty: number
  metadata: string | null; deletedAt: number | null
}
export interface ProductUnitRow extends CommonRow { id: string; productId: string; unitName: string; baseQtyPerUnit: number; sellingPricePiasters: number; deletedAt: number | null }
export interface BarcodeRow extends CommonRow { id: string; barcode: string; productId: string; productUnitId: string | null; isPrimary: boolean; deletedAt: number | null }
export interface StockBatchRow extends CommonRow { id: string; productId: string; batchCode: string | null; expiryAt: number | null; receivedAt: number; initialQtyBase: number; deletedAt: number | null }
export interface StockMovementRow extends CommonRow { id: string; productId: string; batchId: string | null; qtyDelta: number; valueDeltaPiasters: number; movementType: string; reversesMovementId: string | null; referenceType: string | null; referenceId: string | null; occurredAt: number; reason: string | null; createdByUserId: string }
export interface SaleRow extends CommonRow { id: string; invoiceNumber: string; customerId: string | null; userId: string; shiftId: string | null; subtotalPiasters: number; lineDiscountPiasters: number; invoiceDiscountPiasters: number; taxPiasters: number; roundingAdjustmentPiasters: number; totalPiasters: number; paidPiasters: number; duePiasters: number; paymentStatus: string; status: string; voidedAt: number | null; voidedByUserId: string | null; voidReason: string | null; notes: string | null }
export interface SaleItemRow extends CommonRow { id: string; saleId: string; productId: string; unitNameSnapshot: string; pricedUnitQtyBase: number; qtyBase: number; unitPricePiasters: number; lineSubtotalPiasters: number; lineDiscountPiasters: number; invoiceDiscountAllocatedPiasters: number; taxRateBpsSnapshot: number; taxPiasters: number; finalLineTotalPiasters: number; lineCostPiasters: number; productNameSnapshot: string }
export interface MoneyLedgerRow extends CommonRow { id: string; entryType: string; direction: 'in' | 'out'; amountPiasters: number; paymentMethod: string | null; customerId: string | null; supplierId: string | null; saleId: string | null; referenceType: string | null; referenceId: string | null; reversesEntryId: string | null; shiftId: string | null; referenceText: string | null; tenderedPiasters: number | null; changePiasters: number | null; occurredAt: number; userId: string }
export interface ShiftRow extends CommonRow { id: string; userId: string; openedAt: number; closedAt: number | null; openingCashPiasters: number; expectedCashPiasters: number | null; countedCashPiasters: number | null; differencePiasters: number | null; status: string; closingNotes: string | null }
export interface HeldSaleRow extends CommonRow { id: string; label: string | null; userId: string; shiftId: string | null; customerId: string | null; payloadJson: string; heldAt: number; deletedAt: number | null }
export interface AuditLogRow extends CommonRow { id: string; occurredAt: number; userId: string | null; action: string; entityType: string; entityId: string | null; changedFieldsJson: string | null; beforeJson: string | null; afterJson: string | null; reason: string | null }
export interface PurchaseRow extends CommonRow { id: string; purchaseNumber: string; supplierId: string | null; userId: string; totalPiasters: number; paidPiasters: number; duePiasters: number; paymentStatus: string; status: string; voidedAt: number | null; voidedByUserId: string | null; voidReason: string | null }
export interface PurchaseItemRow extends CommonRow { id: string; purchaseId: string; productId: string; unitNameSnapshot: string; pricedUnitQtyBase: number; qtyBase: number; unitCostPiasters: number; lineSubtotalPiasters: number; taxRateBpsSnapshot: number; taxPiasters: number; lineTotalPiasters: number; batchCodeSnapshot: string | null; expiryAtSnapshot: number | null }
export interface SaleReturnRow extends CommonRow { id: string; returnNumber: string; originalSaleId: string; customerId: string | null; userId: string; shiftId: string | null; totalPiasters: number; cashRefundedPiasters: number; creditedToAccountPiasters: number; status: string; reason: string | null; voidedAt: number | null; voidedByUserId: string | null; voidReason: string | null }
export interface SaleReturnItemRow extends CommonRow { id: string; saleReturnId: string; saleItemId: string; productId: string; qtyBase: number; refundPiasters: number; condition: 'resalable' | 'damaged' }
export interface StockCountRow extends CommonRow { id: string; status: string; startedAt: number; postedAt: number | null; userId: string; notes: string | null; voidedAt: number | null; voidedByUserId: string | null; voidReason: string | null }
export interface StockCountItemRow extends CommonRow { id: string; stockCountId: string; productId: string; expectedQtyBase: number; countedQtyBase: number; differenceQtyBase: number }
export interface ExpenseRow extends CommonRow { id: string; category: string; description: string; amountPiasters: number; paymentMethod: string; expenseAt: number; userId: string; shiftId: string | null; status: string; voidedAt: number | null; voidedByUserId: string | null; voidReason: string | null }
