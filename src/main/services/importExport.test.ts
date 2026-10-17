import { describe, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import ExcelJS from 'exceljs'
import { closeDatabase, openDatabase } from '../database/database'
import { ImportExportService } from './importExport'
import type { Clock } from './clock'
import type { IdGenerator } from './ids'
import type { Actor } from './permissions'
import { getOnHand } from '../database/repositories/stock'
import { listBarcodes, listProducts } from '../database/repositories/catalog'

const fixedClock: Clock = { now: () => 1700000000000 }
function testIds(): IdGenerator {
  let counter = 0
  return { next: () => `01IMP${String(++counter).padStart(21, '0')}` }
}

const ownerActor: Actor = { userId: 'u1', role: 'owner' }
const cashierActor: Actor = { userId: 'u2', role: 'cashier' }

let rootCounter = 0
async function makeService() {
  const root = join(tmpdir(), `small-shop-pos-impexp-${Date.now()}-${rootCounter++}`)
  mkdirSync(root, { recursive: true })
  const context = await openDatabase(join(root, 'user-data'), join(process.cwd(), 'migrations'))
  const now = fixedClock.now()
  context.database.exec(`
    INSERT INTO users (id,username,display_name,password_hash,role,is_active,created_at,updated_at,device_id)
    VALUES ('u1','owner','Owner','hash','owner',1,${now},${now},'d1'),
           ('u2','cashier','Cashier','hash','cashier',1,${now},${now},'d1');

    INSERT INTO categories (id,name,sort_order,created_at,updated_at,device_id)
    VALUES ('cat1','ألبان',0,${now},${now},'d1');
  `)
  const service = new ImportExportService({
    database: context.database,
    clock: fixedClock,
    ids: testIds(),
    deviceId: 'd1',
  })
  return { service, context, database: context.database, root }
}

describe('ImportExportService', () => {
  it('generates a valid products template with instructions sheet', async () => {
    const { service, context } = await makeService()
    try {
      const res = await service.getProductsTemplate()
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.value.fileName).toBe('products_template.xlsx')
        const buf = Buffer.from(res.value.fileBase64, 'base64')
        const workbook = new ExcelJS.Workbook()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await workbook.xlsx.load(buf as any)
        expect(workbook.worksheets.length).toBe(2)
        expect(workbook.worksheets[0].name).toBe('المنتجات')
        expect(workbook.worksheets[1].name).toBe('تعليمات وإرشادات')
      }
    } finally {
      closeDatabase(context)
    }
  })

  it('enforces permissions: cashier is refused import and export', async () => {
    const { service, context } = await makeService()
    try {
      const expRes = await service.exportProducts(cashierActor, { format: 'csv' })
      expect(expRes.ok).toBe(false)
      if (!expRes.ok) expect(expRes.error.code).toBe('permission_denied')

      const prevRes = await service.previewProductsImport(cashierActor, {
        fileName: 'test.csv',
        fileBase64: Buffer.from('a;b').toString('base64'),
        mode: 'both',
      })
      expect(prevRes.ok).toBe(false)
      if (!prevRes.ok) expect(prevRes.error.code).toBe('permission_denied')
    } finally {
      closeDatabase(context)
    }
  })

  it('imports products from CSV and creates categories and opening stock', async () => {
    const { service, context, database } = await makeService()
    try {
      // CSV with Arabic headers and BOM
      const csv =
        '\uFEFFالباركود;اسم المنتج;القسم;كود الصنف (SKU);الوحدة الأساسية;سعر البيع;سعر الشراء / التكلفة;حد الطلب;نوع المنتج (عادي / بالوزن);تتبع الصلاحية (نعم / لا);الرصيد الافتتاحي\r\n' +
        '6221111111111;لبن جهينة 1 لتر;ألبان;JOHYNA-1L;علبة;40.00;32.50;5;عادي;نعم;12\r\n' +
        '6222222222222;جبنة موتزاريلا 1 كجم;أجبان;MOZZ-1K;كجم;150.00;120.00;2;بالوزن;لا;5.500\r\n'

      const fileBase64 = Buffer.from(csv, 'utf8').toString('base64')
      const preview = await service.previewProductsImport(ownerActor, {
        fileName: 'products.csv',
        fileBase64,
        mode: 'both',
      })

      expect(preview.ok).toBe(true)
      if (!preview.ok) return
      expect(preview.value.totalRows).toBe(2)
      expect(preview.value.toCreateCount).toBe(2)
      expect(preview.value.errorCount).toBe(0)
      expect(preview.value.newCategories).toEqual(['أجبان'])

      // Execute import
      const imported = await service.executeProductsImport(ownerActor, {
        fileName: 'products.csv',
        fileBase64,
        mode: 'both',
        autoCreateCategories: true,
      })

      expect(imported.ok).toBe(true)
      if (!imported.ok) return
      expect(imported.value.createdCount).toBe(2)
      expect(imported.value.categoriesCreatedCount).toBe(1)
      expect(imported.value.openingStockAppliedCount).toBe(2)

      // Verify products in database
      const products = listProducts(database)
      expect(products.length).toBe(2)

      const milk = products.find((p) => p.name === 'لبن جهينة 1 لتر')
      expect(milk).toBeDefined()
      expect(milk?.sellingPricePiasters).toBe(4000)
      expect(milk?.costPricePiasters).toBe(3250)
      expect(milk?.trackExpiry).toBe(true)

      const milkBarcodes = listBarcodes(database, milk!.id)
      expect(milkBarcodes.map((b) => b.barcode)).toEqual(['6221111111111'])

      const milkStock = getOnHand(database, milk!.id)
      expect(milkStock.qty).toBe(12)
      expect(milkStock.valuePiasters).toBe(12 * 3250) // 39000

      const cheese = products.find((p) => p.name === 'جبنة موتزاريلا 1 كجم')
      expect(cheese).toBeDefined()
      expect(cheese?.isWeighted).toBe(true)
      expect(cheese?.qtyScale).toBe(3)
      expect(cheese?.priceUnitQtyBase).toBe(1000)

      const cheeseStock = getOnHand(database, cheese!.id)
      // 5.5 kg = 5500 g
      expect(cheeseStock.qty).toBe(5500)

      // Re-importing same sheet must NOT duplicate opening stock!
      const reimport = await service.executeProductsImport(ownerActor, {
        fileName: 'products.csv',
        fileBase64,
        mode: 'both',
      })
      expect(reimport.ok).toBe(true)
      if (reimport.ok) {
        expect(reimport.value.updatedCount).toBe(2)
        expect(reimport.value.openingStockAppliedCount).toBe(0) // Skipped!
      }
      expect(getOnHand(database, milk!.id).qty).toBe(12) // Unchanged
    } finally {
      closeDatabase(context)
    }
  })

  it('detects scientific notation in barcodes and flags error without importing garbage', async () => {
    const { service, context } = await makeService()
    try {
      const csv =
        'الباركود;اسم المنتج\r\n' +
        '6.22E+12;منتج فاسد الباركود\r\n'

      const fileBase64 = Buffer.from(csv, 'utf8').toString('base64')
      const preview = await service.previewProductsImport(ownerActor, {
        fileName: 'bad_barcode.csv',
        fileBase64,
        mode: 'create_only',
      })

      expect(preview.ok).toBe(true)
      if (preview.ok) {
        expect(preview.value.errorCount).toBe(1)
        expect(preview.value.canProceed).toBe(false)
        expect(preview.value.rows[0].status).toBe('error')
        expect(preview.value.rows[0].messages[0]).toBe('الباركود تحوّل لرقم علمي في إكسل، اجعل العمود نص')
      }

      // Execute import must fail and create 0 products
      const executed = await service.executeProductsImport(ownerActor, {
        fileName: 'bad_barcode.csv',
        fileBase64,
        mode: 'create_only',
      })
      expect(executed.ok).toBe(true)
      if (executed.ok) {
        expect(executed.value.createdCount).toBe(0)
        expect(executed.value.failedCount).toBe(1)
        expect(executed.value.errorFileBase64).toBeDefined()
      }
    } finally {
      closeDatabase(context)
    }
  })

  it('supports price update only mode without altering product names', async () => {
    const { service, context, database } = await makeService()
    try {
      // First import initial product
      const initialCsv =
        'الباركود;اسم المنتج;سعر البيع;سعر الشراء / التكلفة\r\n' +
        '6223333333333;زيت عافية 800 مل;60.00;50.00\r\n'

      await service.executeProductsImport(ownerActor, {
        fileName: 'init.csv',
        fileBase64: Buffer.from(initialCsv, 'utf8').toString('base64'),
        mode: 'create_only',
      })

      // Now price update with new prices and a changed name (name should NOT be altered)
      const updateCsv =
        'الباركود;اسم المنتج;سعر البيع;سعر الشراء / التكلفة\r\n' +
        '6223333333333;اسم مختلف تماما;75.50;62.00\r\n'

      const updateRes = await service.executeProductsImport(ownerActor, {
        fileName: 'prices.csv',
        fileBase64: Buffer.from(updateCsv, 'utf8').toString('base64'),
        mode: 'price_update_only',
      })

      expect(updateRes.ok).toBe(true)
      if (updateRes.ok) {
        expect(updateRes.value.updatedCount).toBe(1)
      }

      const product = listProducts(database)[0]
      expect(product.name).toBe('زيت عافية 800 مل') // Preserved!
      expect(product.sellingPricePiasters).toBe(7550) // Updated
      expect(product.costPricePiasters).toBe(6200) // Updated
    } finally {
      closeDatabase(context)
    }
  })

  it('exports products in XLSX and CSV formats', async () => {
    const { service, context } = await makeService()
    try {
      // Seed a product first
      const csv =
        'الباركود;اسم المنتج;سعر البيع;سعر الشراء / التكلفة\r\n' +
        '6224444444444;مكرونة حواء 400 جم;12.00;9.50\r\n'
      await service.executeProductsImport(ownerActor, {
        fileName: 'p.csv',
        fileBase64: Buffer.from(csv, 'utf8').toString('base64'),
        mode: 'create_only',
      })

      const csvExport = await service.exportProducts(ownerActor, { format: 'csv' })
      expect(csvExport.ok).toBe(true)
      if (csvExport.ok) {
        const content = Buffer.from(csvExport.value.fileBase64, 'base64').toString('utf8')
        expect(content).toContain('مكرونة حواء 400 جم')
        expect(content).toContain('6224444444444')
      }

      const xlsxExport = await service.exportProducts(ownerActor, { format: 'xlsx' })
      expect(xlsxExport.ok).toBe(true)
      if (xlsxExport.ok) {
        const buf = Buffer.from(xlsxExport.value.fileBase64, 'base64')
        const wb = new ExcelJS.Workbook()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await wb.xlsx.load(buf as any)
        expect(wb.worksheets[0].name).toBe('المنتجات')
      }
    } finally {
      closeDatabase(context)
    }
  })
})
