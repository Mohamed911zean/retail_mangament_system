import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, openDatabase } from '../database'
import { mapRow, runInTransaction } from './common'
import { getSetting, insertSetting, listSettings } from './settings'
import { getUser, insertUser, listUsers, updateUser, deactivateUser } from './users'
import { getProduct, insertProduct, listProducts, updateProduct, softDeleteProduct, insertCategory, getCategory, listCategories, insertProductUnit, listProductUnits, insertBarcode, listBarcodes } from './catalog'
import { getCustomer, insertCustomer, listCustomers, updateCustomer, softDeleteCustomer } from './customers'
import { getSupplier, insertSupplier, listSuppliers, updateSupplier, softDeleteSupplier } from './suppliers'
import { getOnHand, getStockMovement, insertStockBatch, insertStockMovement, listStockBatches, listStockMovements } from './stock'
import { getSale, insertSale, insertSaleItem, listSaleItems, listSales, updateSaleVoidMetadata } from './sales'
import { getMoneyLedgerEntry, insertMoneyLedgerEntry, listMoneyLedger, listMoneyLedgerByReference } from './money-ledger'
import { closeShift, getOpenShift, getShift, insertShift, listShifts } from './shifts'
import { getHeldSale, insertHeldSale, listHeldSales, softDeleteHeldSale } from './held-sales'
import { insertAuditLog, listAuditLog } from './audit-log'
import { nextSequenceNumber } from './sequences'
import { getPurchase, insertPurchase, insertPurchaseItem, listPurchaseItems, listPurchases, updatePurchaseVoidMetadata } from './purchases'
import { getSaleReturn, insertSaleReturn, insertSaleReturnItem, listSaleReturnItems, listSaleReturns, listSaleReturnsBySale, updateSaleReturnVoidMetadata } from './sale-returns'
import { getStockCount, insertStockCount, insertStockCountItem, listStockCountItems, listStockCounts, updateStockCount } from './stock-counts'
import { getExpense, insertExpense, listExpenses, updateExpenseVoidMetadata } from './expenses'

function fixtureValues(now: number) {
  return { createdAt: now, updatedAt: now, deviceId: 'd1' }
}

describe('database repositories', () => {
  it('maps rows, rolls back transactions, and maintains atomic sequences', () => {
    expect(mapRow({ id: 'x', is_active: 1, nullable: null, display_name: 'Name' })).toEqual({
      id: 'x',
      isActive: true,
      nullable: null,
      displayName: 'Name',
    })
  })

  it('supports aggregate round trips and typed constraint errors', async () => {
    const root = join(tmpdir(), `small-shop-pos-repositories-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
    const now = Date.now()
    const common = fixtureValues(now)

    expect(() => runInTransaction(context.database, (transaction) => {
      insertSetting(transaction, { key: 'locale', value: 'ar', valueType: 'string', description: null, ...common })
      throw new Error('rollback')
    })).toThrow('rollback')
    expect(context.database.prepare('SELECT COUNT(*) AS count FROM settings').get()).toEqual({ count: 0 })

    insertSetting(context.database, { key: 'locale', value: 'ar', valueType: 'string', description: null, ...common })
    expect(getSetting(context.database, 'locale')).toMatchObject({ key: 'locale', value: 'ar', valueType: 'string' })
    expect(listSettings(context.database).length).toBe(1)

    insertUser(context.database, { id: 'u1', username: 'cashier', displayName: 'Cashier', passwordHash: 'hash', role: 'cashier', isActive: true, ...common })
    expect(getUser(context.database, 'u1')).toMatchObject({ id: 'u1', isActive: true })
    expect(listUsers(context.database).length).toBe(1)
    updateUser(context.database, 'u1', { displayName: 'Senior Cashier', updatedAt: now + 1 })
    expect(getUser(context.database, 'u1')?.displayName).toBe('Senior Cashier')
    deactivateUser(context.database, 'u1', now + 2)
    expect(getUser(context.database, 'u1')?.isActive).toBe(false)
    expect(() => insertUser(context.database, { id: 'u2', username: 'cashier', displayName: 'Duplicate', passwordHash: 'hash', role: 'cashier', isActive: true, ...common })).toThrowError(
      expect.objectContaining({ code: 'constraint_unique' }),
    )

    insertCategory(context.database, { id: 'cat1', name: 'Dairy', sortOrder: 1, ...common })
    expect(getCategory(context.database, 'cat1')?.name).toBe('Dairy')
    expect(listCategories(context.database).length).toBe(1)

    insertProduct(context.database, {
      id: 'p1', sku: 'SKU-1', name: 'Product', categoryId: 'cat1', baseUnitName: 'piece', qtyScale: 0,
      priceUnitQtyBase: 1, costPricePiasters: 100, sellingPricePiasters: 150, taxRateBps: 0,
      trackExpiry: false, isWeighted: false, lowStockThresholdQty: 0, metadata: null, ...common,
    })
    expect(getProduct(context.database, 'p1')).toMatchObject({ id: 'p1', trackExpiry: false, isWeighted: false })
    expect(listProducts(context.database).length).toBe(1)
    updateProduct(context.database, 'p1', { sellingPricePiasters: 175, updatedAt: now + 2 })
    expect(getProduct(context.database, 'p1')?.sellingPricePiasters).toBe(175)
    softDeleteProduct(context.database, 'p1', now + 3)
    expect(listProducts(context.database).length).toBe(0)

    insertProductUnit(context.database, { id: 'pu1', productId: 'p1', unitName: 'box', baseQtyPerUnit: 12, sellingPricePiasters: 1800, ...common })
    expect(listProductUnits(context.database, 'p1').length).toBe(1)

    insertBarcode(context.database, { id: 'b1', barcode: '1234567890123', productId: 'p1', productUnitId: null, isPrimary: true, ...common })
    expect(listBarcodes(context.database, 'p1').length).toBe(1)

    insertCustomer(context.database, { id: 'c1', name: 'Customer', phone: null, address: null, creditLimitPiasters: null, metadata: null, ...common })
    expect(getCustomer(context.database, 'c1')?.name).toBe('Customer')
    expect(listCustomers(context.database).length).toBe(1)
    updateCustomer(context.database, 'c1', { phone: '01000000000', updatedAt: now + 3 })
    expect(getCustomer(context.database, 'c1')?.phone).toBe('01000000000')
    softDeleteCustomer(context.database, 'c1', now + 4)
    expect(listCustomers(context.database).length).toBe(0)

    insertSupplier(context.database, { id: 's1', name: 'Supplier', phone: null, address: null, metadata: null, ...common })
    expect(getSupplier(context.database, 's1')?.name).toBe('Supplier')
    expect(listSuppliers(context.database).length).toBe(1)
    updateSupplier(context.database, 's1', { phone: '01111111111', updatedAt: now + 5 })
    expect(getSupplier(context.database, 's1')?.phone).toBe('01111111111')
    softDeleteSupplier(context.database, 's1', now + 6)
    expect(listSuppliers(context.database).length).toBe(0)

    insertShift(context.database, { id: 'sh1', userId: 'u1', openedAt: now, openingCashPiasters: 0, expectedCashPiasters: 0, countedCashPiasters: null, differencePiasters: null, status: 'open', closingNotes: null, ...common })
    expect(getOpenShift(context.database, 'd1')).toMatchObject({ id: 'sh1' })
    expect(getShift(context.database, 'sh1')?.status).toBe('open')
    expect(listShifts(context.database).length).toBe(1)
    closeShift(context.database, 'sh1', { closedAt: now + 7, expectedCashPiasters: 0, countedCashPiasters: 0, differencePiasters: 0, closingNotes: 'Done', updatedAt: now + 7 })
    expect(getShift(context.database, 'sh1')?.status).toBe('closed')

    insertStockBatch(context.database, { id: 'batch1', productId: 'p1', batchCode: 'B1', expiryAt: now + 86400000, receivedAt: now, initialQtyBase: 10, ...common })
    expect(listStockBatches(context.database, 'p1').length).toBe(1)

    insertStockMovement(context.database, { id: 'm1', productId: 'p1', batchId: 'batch1', qtyDelta: 2, valueDeltaPiasters: 200, movementType: 'purchase', reversesMovementId: null, referenceType: null, referenceId: null, occurredAt: now, reason: null, createdByUserId: 'u1', ...common })
    expect(getOnHand(context.database, 'p1')).toEqual({ qty: 2, valuePiasters: 200 })
    expect(getStockMovement(context.database, 'm1')?.id).toBe('m1')
    expect(listStockMovements(context.database, 'p1').length).toBe(1)

    insertSale(context.database, { id: 'sale1', invoiceNumber: '1', customerId: null, userId: 'u1', shiftId: 'sh1', subtotalPiasters: 150, lineDiscountPiasters: 0, invoiceDiscountPiasters: 0, taxPiasters: 0, roundingAdjustmentPiasters: 0, totalPiasters: 150, paidPiasters: 150, duePiasters: 0, paymentStatus: 'paid', status: 'completed', voidedAt: null, voidedByUserId: null, voidReason: null, notes: null, ...common })
    expect(getSale(context.database, 'sale1')?.totalPiasters).toBe(150)
    expect(listSales(context.database).length).toBe(1)
    updateSaleVoidMetadata(context.database, 'sale1', now + 8, now + 8, 'u1', 'Voided sale')
    expect(getSale(context.database, 'sale1')?.status).toBe('voided')

    insertSaleItem(context.database, { id: 'si1', saleId: 'sale1', productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 1, unitPricePiasters: 150, lineSubtotalPiasters: 150, lineDiscountPiasters: 0, invoiceDiscountAllocatedPiasters: 0, taxRateBpsSnapshot: 0, taxPiasters: 0, finalLineTotalPiasters: 150, lineCostPiasters: 100, productNameSnapshot: 'Product', ...common })
    expect(listSaleItems(context.database, 'sale1').length).toBe(1)

    insertMoneyLedgerEntry(context.database, { id: 'l1', entryType: 'sale_payment', direction: 'in', amountPiasters: 150, paymentMethod: 'cash', customerId: null, supplierId: null, saleId: 'sale1', referenceType: 'sale', referenceId: 'sale1', reversesEntryId: null, shiftId: 'sh1', referenceText: null, tenderedPiasters: 200, changePiasters: 50, occurredAt: now, userId: 'u1', ...common })
    expect(getMoneyLedgerEntry(context.database, 'l1')?.amountPiasters).toBe(150)
    expect(listMoneyLedger(context.database, 'sh1').length).toBe(1)
    expect(listMoneyLedgerByReference(context.database, 'sale', 'sale1').length).toBe(1)

    insertHeldSale(context.database, { id: 'h1', label: 'VIP', userId: 'u1', shiftId: 'sh1', customerId: null, payloadJson: '{"items":[]}', heldAt: now, ...common })
    expect(getHeldSale(context.database, 'h1')?.label).toBe('VIP')
    expect(listHeldSales(context.database, 'u1').length).toBe(1)
    softDeleteHeldSale(context.database, 'h1', now + 9)
    expect(listHeldSales(context.database, 'u1').length).toBe(0)

    insertAuditLog(context.database, { id: 'a1', occurredAt: now, userId: 'u1', action: 'test', entityType: 'product', entityId: 'p1', changedFieldsJson: null, beforeJson: null, afterJson: null, reason: null, ...common })
    expect(listAuditLog(context.database, 'product', 'p1').length).toBe(1)

    insertPurchase(context.database, { id: 'pur1', purchaseNumber: '1', supplierId: null, userId: 'u1', totalPiasters: 100, paidPiasters: 100, duePiasters: 0, paymentStatus: 'paid', status: 'completed', voidedAt: null, voidedByUserId: null, voidReason: null, ...common })
    expect(getPurchase(context.database, 'pur1')?.totalPiasters).toBe(100)
    expect(listPurchases(context.database).length).toBe(1)
    updatePurchaseVoidMetadata(context.database, 'pur1', now + 10, now + 10, 'u1', 'Voided purchase')
    expect(getPurchase(context.database, 'pur1')?.status).toBe('voided')

    insertPurchaseItem(context.database, { id: 'pi1', purchaseId: 'pur1', productId: 'p1', unitNameSnapshot: 'piece', pricedUnitQtyBase: 1, qtyBase: 1, unitCostPiasters: 100, lineSubtotalPiasters: 100, taxRateBpsSnapshot: 0, taxPiasters: 0, lineTotalPiasters: 100, batchCodeSnapshot: null, expiryAtSnapshot: null, ...common })
    expect(listPurchaseItems(context.database, 'pur1').length).toBe(1)

    insertSaleReturn(context.database, { id: 'ret1', returnNumber: '1', originalSaleId: 'sale1', customerId: null, userId: 'u1', shiftId: 'sh1', totalPiasters: 150, cashRefundedPiasters: 150, creditedToAccountPiasters: 0, status: 'completed', reason: 'Defective', voidedAt: null, voidedByUserId: null, voidReason: null, ...common })
    expect(getSaleReturn(context.database, 'ret1')?.totalPiasters).toBe(150)
    expect(listSaleReturns(context.database).length).toBe(1)
    expect(listSaleReturnsBySale(context.database, 'sale1').length).toBe(1)
    updateSaleReturnVoidMetadata(context.database, 'ret1', now + 11, now + 11, 'u1', 'Voided return')
    expect(getSaleReturn(context.database, 'ret1')?.status).toBe('voided')

    insertSaleReturnItem(context.database, { id: 'ri1', saleReturnId: 'ret1', saleItemId: 'si1', productId: 'p1', qtyBase: 1, refundPiasters: 150, condition: 'damaged', ...common })
    expect(listSaleReturnItems(context.database, 'ret1').length).toBe(1)

    insertStockCount(context.database, { id: 'count1', status: 'draft', startedAt: now, postedAt: null, userId: 'u1', notes: null, voidedAt: null, voidedByUserId: null, voidReason: null, ...common })
    expect(getStockCount(context.database, 'count1')?.status).toBe('draft')
    expect(listStockCounts(context.database).length).toBe(1)
    updateStockCount(context.database, 'count1', { status: 'posted', postedAt: now + 12, notes: 'Count complete', updatedAt: now + 12 })
    expect(getStockCount(context.database, 'count1')?.status).toBe('posted')

    insertStockCountItem(context.database, { id: 'sci1', stockCountId: 'count1', productId: 'p1', expectedQtyBase: 2, countedQtyBase: 2, differenceQtyBase: 0, ...common })
    expect(listStockCountItems(context.database, 'count1').length).toBe(1)

    insertExpense(context.database, { id: 'exp1', category: 'cleaning', description: 'Soap', amountPiasters: 50, paymentMethod: 'cash', expenseAt: now, userId: 'u1', shiftId: 'sh1', status: 'posted', voidedAt: null, voidedByUserId: null, voidReason: null, ...common })
    expect(getExpense(context.database, 'exp1')?.category).toBe('cleaning')
    expect(listExpenses(context.database, 'sh1').length).toBe(1)
    updateExpenseVoidMetadata(context.database, 'exp1', now + 13, now + 13, 'u1', 'Voided expense')
    expect(getExpense(context.database, 'exp1')?.status).toBe('voided')

    expect(nextSequenceNumber(context.database, 'd1', 'sale_invoice', now)).toBe(1)
    expect(nextSequenceNumber(context.database, 'd1', 'sale_invoice', now + 1)).toBe(2)
    expect(() => runInTransaction(context.database, () => Promise.resolve())).toThrow(
      'runInTransaction does not accept asynchronous callbacks',
    )

    closeDatabase(context)
    rmSync(root, { recursive: true, force: true })
  })
})
