import ExcelJS from 'exceljs'
import type { DatabaseHandle } from '../database/repositories/common'
import { runInTransaction } from '../database/repositories/common'
import {
  listCategories,
  insertCategory,
  getProduct,
  listProducts,
  insertProduct,
  updateProduct,
  insertBarcode,
  listBarcodes,
  getBarcode,
} from '../database/repositories/catalog'
import { getOnHand, listStockMovements } from '../database/repositories/stock'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import { noFaults } from './fault-injector'
import type { IdGenerator } from './ids'
import { createUlidGenerator } from './ids'
import type { Actor } from './permissions'
import { assertPermission, roleHasPermission } from './permissions'
import { serviceErr, serviceOk, type ServiceResult } from './result'
import { writeAudit } from './audit'
import { applyMovement } from './stockEngine'
import {
  detectScientificNotation,
  normalizeText,
  parseBarcodesList,
  parseBooleanFlag,
  parsePiasters,
  parseProductType,
  parseQuantity,
} from '../../domain/importNormalize'
import type {
  ExportFileResult,
  ImportMode,
  ParsedProductRow,
  ProductsImportPreview,
  ProductsImportResult,
} from '../../shared/importExport'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const MAX_ROW_LIMIT = 20000

export type ImportExportDeps = {
  database: DatabaseHandle
  clock: Clock
  ids?: IdGenerator
  deviceId: string
  faults?: FaultInjector
}

type RawRow = string[]

function parseCsv(buffer: Buffer): RawRow[] {
  let text = buffer.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  const semicolonCount = (firstLine.match(/;/g) ?? []).length
  const commaCount = (firstLine.match(/,/g) ?? []).length
  const tabCount = (firstLine.match(/\t/g) ?? []).length
  const sep = tabCount > semicolonCount && tabCount > commaCount ? '\t' : semicolonCount >= commaCount ? ';' : ','

  const rows: RawRow[] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === sep) {
        currentRow.push(currentField)
        currentField = ''
      } else if (char === '\r') {
        // Skip CR
      } else if (char === '\n') {
        currentRow.push(currentField)
        currentField = ''
        if (currentRow.some((c) => c.trim().length > 0)) {
          rows.push(currentRow)
        }
        currentRow = []
      } else {
        currentField += char
      }
    }
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    if (currentRow.some((c) => c.trim().length > 0)) {
      rows.push(currentRow)
    }
  }
  return rows
}

async function parseXlsx(buffer: Buffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return []

  const rows: RawRow[] = []
  worksheet.eachRow((row) => {
    const rowValues: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (rowValues.length < colNumber - 1) {
        rowValues.push('')
      }
      const val = cell.value
      if (val === null || val === undefined) {
        rowValues.push('')
      } else if (typeof val === 'object') {
        if ('result' in val && val.result !== undefined && val.result !== null) {
          rowValues.push(String(val.result))
        } else if ('text' in val && typeof val.text === 'string') {
          rowValues.push(val.text)
        } else if ('richText' in val && Array.isArray(val.richText)) {
          rowValues.push(val.richText.map((t: { text: string }) => t.text).join(''))
        } else {
          rowValues.push(String(val))
        }
      } else {
        rowValues.push(String(val))
      }
    })
    if (rowValues.some((v) => v.trim().length > 0)) {
      rows.push(rowValues)
    }
  })
  return rows
}

type ColumnMapping = {
  barcodeIndex: number
  nameIndex: number
  categoryIndex: number
  skuIndex: number
  unitIndex: number
  sellingPriceIndex: number
  costPriceIndex: number
  lowStockIndex: number
  productTypeIndex: number
  trackExpiryIndex: number
  openingStockIndex: number
}

function resolveHeaders(headers: string[]): ColumnMapping {
  const norm = headers.map((h) => normalizeText(h).toLowerCase())
  const find = (keywords: string[]) => norm.findIndex((h) => keywords.some((k) => h === k || h.includes(k)))

  return {
    barcodeIndex: find(['الباركود', 'باركود', 'barcode', 'barcodes']),
    nameIndex: find(['اسم المنتج', 'اسم الصنف', 'الاسم', 'name', 'product_name']),
    categoryIndex: find(['القسم', 'التصنيف', 'المجموعة', 'category']),
    skuIndex: find(['كود الصنف', 'sku', 'كود']),
    unitIndex: find(['الوحدة الأساسية', 'الوحدة', 'وحدة القياس', 'unit']),
    sellingPriceIndex: find(['سعر البيع', 'السعر', 'سعر المستهلك', 'price', 'selling_price']),
    costPriceIndex: find(['سعر الشراء / التكلفة', 'سعر الشراء', 'التكلفة', 'سعر التكلفة', 'cost', 'cost_price']),
    lowStockIndex: find(['حد الطلب', 'الحد الأدنى', 'low_stock']),
    productTypeIndex: find(['نوع المنتج', 'النوع', 'type', 'is_weighted']),
    trackExpiryIndex: find(['تتبع الصلاحية', 'صلاحية', 'expiry', 'track_expiry']),
    openingStockIndex: find(['الرصيد الافتتاحي', 'رصيد افتتاحي', 'الكمية الافتتاحية', 'الرصيد الحالي', 'opening_stock', 'stock']),
  }
}

export class ImportExportService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector

  constructor(private readonly deps: ImportExportDeps) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
  }

  // ─── Template Generation ──────────────────────────────────────────────────

  async getProductsTemplate(): Promise<ServiceResult<ExportFileResult>> {
    try {
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Small ERP'

      // Sheet 1: Products
      const sheet = workbook.addWorksheet('المنتجات', { views: [{ rightToLeft: true }] })
      sheet.columns = [
        { header: 'الباركود', key: 'barcode', width: 20 },
        { header: 'اسم المنتج', key: 'name', width: 30 },
        { header: 'القسم', key: 'category', width: 20 },
        { header: 'كود الصنف (SKU)', key: 'sku', width: 18 },
        { header: 'الوحدة الأساسية', key: 'unit', width: 15 },
        { header: 'سعر البيع', key: 'sellingPrice', width: 15 },
        { header: 'سعر الشراء / التكلفة', key: 'costPrice', width: 20 },
        { header: 'حد الطلب', key: 'lowStock', width: 14 },
        { header: 'نوع المنتج (عادي / بالوزن)', key: 'type', width: 25 },
        { header: 'تتبع الصلاحية (نعم / لا)', key: 'trackExpiry', width: 22 },
        { header: 'الرصيد الافتتاحي', key: 'openingStock', width: 18 },
      ]

      // Format headers
      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' },
      }

      // Format barcode column explicitly as text to prevent scientific notation in Excel
      sheet.getColumn('barcode').numFmt = '@'
      sheet.getColumn('sku').numFmt = '@'

      // Sample data row
      sheet.addRow({
        barcode: '6221234567890',
        name: 'جبنة بيضاء دومتي 500 جم',
        category: 'ألبان وجبن',
        sku: 'DOMTI-500',
        unit: 'علبة',
        sellingPrice: '35.00',
        costPrice: '28.50',
        lowStock: '10',
        type: 'عادي',
        trackExpiry: 'نعم',
        openingStock: '24',
      })

      // Sheet 2: Instructions
      const notesSheet = workbook.addWorksheet('تعليمات وإرشادات', { views: [{ rightToLeft: true }] })
      notesSheet.columns = [
        { header: 'العمود', key: 'col', width: 25 },
        { header: 'الوصف والتعليمات', key: 'desc', width: 60 },
      ]
      const notesHeader = notesSheet.getRow(1)
      notesHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      notesHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }

      notesSheet.addRows([
        { col: 'الباركود', desc: 'كود الباركود الدولي أو المحلي. يمكن إدخال أكثر من باركود مفصولاً بفاصلة منقوطة (;). تأكد من جعل العمود بتنسيق نص (Text) في إكسل لمنع ضياع الأصفار.' },
        { col: 'اسم المنتج', desc: 'حقل إلزامي. اسم الصنف المعروض للكاشير وفي الإيصال.' },
        { col: 'القسم', desc: 'تصنيف الصنف (مثل: بقالة، منظفات، ألبان). إذا لم يكن القسم مسجلاً سيتم إنشاؤه تلقائياً.' },
        { col: 'كود الصنف (SKU)', desc: 'كود داخلي مميز للصنف (اختياري). يُستخدم لمطابقة الأصناف وتحديثها.' },
        { col: 'الوحدة الأساسية', desc: 'وحدة البيع (مثال: قطعة، علبة، كجم).' },
        { col: 'سعر البيع', desc: 'سعر بيع المستهلك بالجنيه المصري (مثال: 12.50).' },
        { col: 'سعر الشراء / التكلفة', desc: 'سعر التكلفة للوحدة بالجنيه المصري.' },
        { col: 'حد الطلب', desc: 'الحد الأدنى للكمية للتنبيه عند انخفاض المخزون.' },
        { col: 'نوع المنتج', desc: 'اكتب "عادي" للأصناف المباعة بالعدد، أو "بالوزن" للأصناف الوزنية المربوطة بميزان.' },
        { col: 'تتبع الصلاحية', desc: 'اكتب "نعم" لتتبع تواريخ انتهاء الصلاحية أو "لا" للأصناف العادية.' },
        { col: 'الرصيد الافتتاحي', desc: 'الكمية الموجودة حالياً بالمحل. تطبق فقط عند إضافة الصنف لأول مرة وبلا رصيد مسبق.' },
      ])

      const buffer = await workbook.xlsx.writeBuffer()
      return serviceOk({
        fileName: 'products_template.xlsx',
        fileBase64: Buffer.from(buffer).toString('base64'),
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    } catch (e) {
      return serviceErr('database_error', e)
    }
  }

  // ─── Export Products ──────────────────────────────────────────────────────

  async exportProducts(
    actor: Actor,
    options: { format: 'xlsx' | 'csv'; categoryId?: string | null; search?: string | null },
  ): Promise<ServiceResult<ExportFileResult>> {
    const auth = assertPermission(actor, 'data.export')
    if (!auth.ok) return auth

    try {
      const products = listProducts(this.deps.database)
      const categories = listCategories(this.deps.database)
      const catMap = new Map(categories.map((c) => [c.id, c.name]))

      // Filter
      const filtered = products.filter((p) => {
        if (options.categoryId && p.categoryId !== options.categoryId) return false
        if (options.search) {
          const q = options.search.trim().toLowerCase()
          const nameMatch = p.name.toLowerCase().includes(q)
          const skuMatch = p.sku ? p.sku.toLowerCase().includes(q) : false
          if (!nameMatch && !skuMatch) return false
        }
        return true
      })

      const headers = [
        'الباركود',
        'اسم المنتج',
        'القسم',
        'كود الصنف (SKU)',
        'الوحدة الأساسية',
        'سعر البيع',
        'سعر الشراء / التكلفة',
        'حد الطلب',
        'نوع المنتج (عادي / بالوزن)',
        'تتبع الصلاحية (نعم / لا)',
        'الرصيد الحالي',
        'قيمة المخزون',
      ]

      const dataRows = filtered.map((p) => {
        const barcodes = listBarcodes(this.deps.database, p.id).map((b) => b.barcode).join('; ')
        const onHand = getOnHand(this.deps.database, p.id)
        const categoryName = p.categoryId ? catMap.get(p.categoryId) ?? '' : ''
        const sellingPriceEgp = (p.sellingPricePiasters / 100).toFixed(2)
        const costPriceEgp = (p.costPricePiasters / 100).toFixed(2)
        const onHandQty = p.qtyScale === 3 ? (onHand.qty / 1000).toFixed(3) : String(onHand.qty)
        const stockValueEgp = (onHand.valuePiasters / 100).toFixed(2)

        return [
          barcodes,
          p.name,
          categoryName,
          p.sku ?? '',
          p.baseUnitName,
          sellingPriceEgp,
          costPriceEgp,
          String(p.lowStockThresholdQty),
          p.isWeighted ? 'بالوزن' : 'عادي',
          p.trackExpiry ? 'نعم' : 'لا',
          onHandQty,
          stockValueEgp,
        ]
      })

      if (options.format === 'csv') {
        const lines: string[] = []
        lines.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(';'))
        for (const row of dataRows) {
          lines.push(row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';'))
        }
        const csvContent = '\uFEFF' + lines.join('\r\n')
        return serviceOk({
          fileName: `products_export_${this.deps.clock.now()}.csv`,
          fileBase64: Buffer.from(csvContent, 'utf8').toString('base64'),
          mimeType: 'text/csv;charset=utf-8;',
        })
      }

      // XLSX format
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('المنتجات', { views: [{ rightToLeft: true }] })
      sheet.addRow(headers)
      const headerRow = sheet.getRow(1)
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }

      sheet.getColumn(1).numFmt = '@'
      sheet.getColumn(4).numFmt = '@'

      for (const row of dataRows) {
        sheet.addRow(row)
      }

      // Auto-fit widths
      sheet.columns.forEach((col) => {
        let maxLen = 12
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const len = cell.value ? String(cell.value).length : 0
          if (len > maxLen) maxLen = Math.min(len + 2, 40)
        })
        col.width = maxLen
      })

      const buffer = await workbook.xlsx.writeBuffer()
      return serviceOk({
        fileName: `products_export_${this.deps.clock.now()}.xlsx`,
        fileBase64: Buffer.from(buffer).toString('base64'),
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    } catch (e) {
      return serviceErr('database_error', e)
    }
  }

  // ─── Preview Products Import ──────────────────────────────────────────────

  async previewProductsImport(
    actor: Actor,
    options: { fileName: string; fileBase64: string; mode: ImportMode },
  ): Promise<ServiceResult<ProductsImportPreview>> {
    const auth = assertPermission(actor, 'data.import')
    if (!auth.ok) return auth

    try {
      const buffer = Buffer.from(options.fileBase64, 'base64')
      if (buffer.length > MAX_FILE_SIZE) {
        return serviceErr('file_too_large')
      }

      let rawRows: RawRow[] = []
      const isCsv = options.fileName.toLowerCase().endsWith('.csv')
      if (isCsv) {
        rawRows = parseCsv(buffer)
      } else {
        try {
          rawRows = await parseXlsx(buffer)
        } catch {
          return serviceErr('invalid_file_format')
        }
      }

      if (rawRows.length < 2) {
        return serviceErr('empty_file')
      }

      if (rawRows.length - 1 > MAX_ROW_LIMIT) {
        return serviceErr('row_limit_exceeded')
      }

      const headers = rawRows[0] ?? []
      const mapping = resolveHeaders(headers)
      const dataRows = rawRows.slice(1)

      const categories = listCategories(this.deps.database)
      const catMap = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]))

      const allProducts = listProducts(this.deps.database)
      const skuMap = new Map(allProducts.filter((p) => p.sku).map((p) => [p.sku!.trim().toLowerCase(), p]))
      const nameMap = new Map(allProducts.map((p) => [p.name.trim().toLowerCase(), p]))

      const parsedRows: ParsedProductRow[] = []
      const newCategoriesSet = new Set<string>()

      let validCount = 0
      let warningCount = 0
      let errorCount = 0
      let toCreateCount = 0
      let toUpdateCount = 0
      let toSkipCount = 0

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i] ?? []
        const rowNumber = i + 2
        const messages: string[] = []
        let status: 'valid' | 'warning' | 'error' = 'valid'

        const rawBarcode = mapping.barcodeIndex >= 0 ? row[mapping.barcodeIndex] : ''
        const rawName = mapping.nameIndex >= 0 ? row[mapping.nameIndex] : ''
        const rawCategory = mapping.categoryIndex >= 0 ? row[mapping.categoryIndex] : ''
        const rawSku = mapping.skuIndex >= 0 ? row[mapping.skuIndex] : ''
        const rawUnit = mapping.unitIndex >= 0 ? row[mapping.unitIndex] : ''
        const rawSellingPrice = mapping.sellingPriceIndex >= 0 ? row[mapping.sellingPriceIndex] : ''
        const rawCostPrice = mapping.costPriceIndex >= 0 ? row[mapping.costPriceIndex] : ''
        const rawLowStock = mapping.lowStockIndex >= 0 ? row[mapping.lowStockIndex] : ''
        const rawType = mapping.productTypeIndex >= 0 ? row[mapping.productTypeIndex] : ''
        const rawExpiry = mapping.trackExpiryIndex >= 0 ? row[mapping.trackExpiryIndex] : ''
        const rawOpeningStock = mapping.openingStockIndex >= 0 ? row[mapping.openingStockIndex] : ''

        // 1. Name check
        const name = normalizeText(rawName)
        if (name.length === 0) {
          status = 'error'
          messages.push('اسم المنتج مطلوب')
        }

        // 2. Barcode check
        let barcodes: string[] = []
        if (rawBarcode) {
          if (detectScientificNotation(rawBarcode)) {
            status = 'error'
            messages.push('الباركود تحوّل لرقم علمي في إكسل، اجعل العمود نص')
          } else {
            const bRes = parseBarcodesList(rawBarcode)
            if (!bRes.ok) {
              status = 'error'
              messages.push(bRes.error)
            } else {
              barcodes = bRes.value
            }
          }
        }

        // 3. Category
        const categoryName = normalizeText(rawCategory)
        if (categoryName.length > 0 && !catMap.has(categoryName.toLowerCase())) {
          newCategoriesSet.add(categoryName)
        }

        // 4. SKU
        const sku = normalizeText(rawSku)
        if (rawSku && detectScientificNotation(rawSku)) {
          status = 'error'
          messages.push('كود الصنف (SKU) تحوّل لرقم علمي في إكسل')
        }

        // 5. Type & Unit
        const typeInfo = parseProductType(rawType)
        const baseUnitName = normalizeText(rawUnit) || typeInfo.defaultUnitName

        // 6. Prices
        const priceRes = parsePiasters(rawSellingPrice, { allowEmptyZero: true })
        let sellingPricePiasters = 0
        if (!priceRes.ok) {
          status = 'error'
          messages.push(`سعر البيع: ${priceRes.error}`)
        } else {
          sellingPricePiasters = priceRes.value
        }

        const costRes = parsePiasters(rawCostPrice, { allowEmptyZero: true })
        let costPricePiasters = 0
        if (!costRes.ok) {
          status = 'error'
          messages.push(`سعر الشراء: ${costRes.error}`)
        } else {
          costPricePiasters = costRes.value
        }

        if (priceRes.ok && costRes.ok && sellingPricePiasters > 0 && costPricePiasters > sellingPricePiasters) {
          if (status !== 'error') status = 'warning'
          messages.push('سعر البيع أقل من سعر الشراء')
        }

        // 7. Low stock & Expiry
        const lowStockRes = parseQuantity(rawLowStock, 0)
        const lowStockThresholdQty = lowStockRes.ok ? lowStockRes.value : 0
        const trackExpiry = parseBooleanFlag(rawExpiry)

        // 8. Opening stock
        const openingStockRes = parseQuantity(rawOpeningStock, typeInfo.qtyScale)
        const openingStockQty = openingStockRes.ok ? openingStockRes.value : 0

        // Match with existing product: by barcode first, then by SKU
        let matchedProduct = null
        let matchedBy: 'barcode' | 'sku' | undefined

        for (const b of barcodes) {
          const bRow = getBarcode(this.deps.database, b)
          if (bRow) {
            const p = getProduct(this.deps.database, bRow.productId)
            if (p) {
              matchedProduct = p
              matchedBy = 'barcode'
              break
            }
          }
        }

        if (!matchedProduct && sku.length > 0) {
          const p = skuMap.get(sku.toLowerCase())
          if (p) {
            matchedProduct = p
            matchedBy = 'sku'
          }
        }

        // Name duplicate warning if not matched
        if (!matchedProduct && name.length > 0) {
          const p = nameMap.get(name.toLowerCase())
          if (p) {
            if (status !== 'error') status = 'warning'
            messages.push('يوجد منتج بنفس الاسم ولكن بكود مختلف')
          }
        }

        // Action decision based on mode and matching
        let action: 'create' | 'update' | 'skip' = 'create'
        if (options.mode === 'price_update_only') {
          if (!matchedProduct) {
            action = 'skip'
            messages.push('تم التخطي لأن الصنف غير موجود لتحديث سعره')
            if (status !== 'error') status = 'warning'
          } else {
            action = 'update'
          }
        } else if (options.mode === 'create_only') {
          if (matchedProduct) {
            action = 'skip'
            messages.push('تم التخطي لأن الصنف مسجل مسبقاً')
          } else {
            action = 'create'
          }
        } else if (options.mode === 'update_only') {
          if (!matchedProduct) {
            action = 'skip'
            messages.push('تم التخطي لأن الصنف غير مسجل مسبقاً')
          } else {
            action = 'update'
          }
        } else {
          // 'both'
          action = matchedProduct ? 'update' : 'create'
        }

        // Check opening stock feasibility
        if (action === 'update' && matchedProduct && openingStockQty > 0) {
          const onHand = getOnHand(this.deps.database, matchedProduct.id)
          const movements = listStockMovements(this.deps.database, matchedProduct.id)
          if (onHand.qty > 0 || movements.length > 0) {
            if (status !== 'error') status = 'warning'
            messages.push('سيتم تخطي الرصيد الافتتاحي لوجود رصيد أو حركات سابقة على الصنف')
          }
        }

        // Check price update permissions
        if (action === 'update' && matchedProduct) {
          if (
            sellingPricePiasters !== matchedProduct.sellingPricePiasters &&
            !roleHasPermission(actor.role, 'product.price_change')
          ) {
            if (status !== 'error') status = 'warning'
            messages.push('تم تجاهل تعديل سعر البيع لعدم وجود صلاحية')
          }
          if (
            costPricePiasters !== matchedProduct.costPricePiasters &&
            !roleHasPermission(actor.role, 'product.cost_change')
          ) {
            if (status !== 'error') status = 'warning'
            messages.push('تم تجاهل تعديل سعر الشراء لعدم وجود صلاحية')
          }
        }

        if (status === 'error') errorCount++
        else if (status === 'warning') warningCount++
        else validCount++

        if (action === 'create') toCreateCount++
        else if (action === 'update') toUpdateCount++
        else toSkipCount++

        parsedRows.push({
          rowNumber,
          rawBarcode: rawBarcode ? String(rawBarcode) : undefined,
          barcodes,
          name,
          categoryName: categoryName || undefined,
          sku: sku || undefined,
          baseUnitName,
          sellingPricePiasters,
          costPricePiasters,
          lowStockThresholdQty,
          isWeighted: typeInfo.isWeighted,
          qtyScale: typeInfo.qtyScale,
          priceUnitQtyBase: typeInfo.priceUnitQtyBase,
          trackExpiry,
          openingStockQty,
          status,
          action,
          matchedProductId: matchedProduct?.id,
          matchedBy,
          messages,
        })
      }

      return serviceOk({
        fileName: options.fileName,
        totalRows: dataRows.length,
        validCount,
        warningCount,
        errorCount,
        toCreateCount,
        toUpdateCount,
        toSkipCount,
        newCategories: Array.from(newCategoriesSet),
        rows: parsedRows,
        canProceed: errorCount === 0 && (toCreateCount > 0 || toUpdateCount > 0),
      })
    } catch (e) {
      return serviceErr('database_error', e)
    }
  }

  // ─── Execute Products Import ──────────────────────────────────────────────

  async executeProductsImport(
    actor: Actor,
    options: { fileName: string; fileBase64: string; mode: ImportMode; autoCreateCategories?: boolean },
  ): Promise<ServiceResult<ProductsImportResult>> {
    const auth = assertPermission(actor, 'data.import')
    if (!auth.ok) return auth

    try {
      // 1. Dry-run preview first!
      const previewRes = await this.previewProductsImport(actor, options)
      if (!previewRes.ok) return previewRes

      const preview = previewRes.value
      if (preview.errorCount > 0) {
        // Build error report file
        const errorWorkbook = new ExcelJS.Workbook()
        const errorSheet = errorWorkbook.addWorksheet('الأخطاء', { views: [{ rightToLeft: true }] })
        errorSheet.columns = [
          { header: 'رقم الصف', key: 'row', width: 10 },
          { header: 'اسم المنتج', key: 'name', width: 30 },
          { header: 'الباركود', key: 'barcode', width: 20 },
          { header: 'الحالة', key: 'status', width: 12 },
          { header: 'أسباب الخطأ والملاحظات', key: 'msg', width: 50 },
        ]
        const errHeader = errorSheet.getRow(1)
        errHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        errHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } }

        for (const r of preview.rows) {
          if (r.status === 'error' || r.status === 'warning') {
            errorSheet.addRow({
              row: r.rowNumber,
              name: r.name,
              barcode: r.barcodes.join('; '),
              status: r.status === 'error' ? 'خطأ' : 'تنبيه',
              msg: r.messages.join(' | '),
            })
          }
        }
        const errBuf = await errorWorkbook.xlsx.writeBuffer()

        return serviceOk({
          totalRows: preview.totalRows,
          createdCount: 0,
          updatedCount: 0,
          skippedCount: preview.totalRows,
          failedCount: preview.errorCount,
          categoriesCreatedCount: 0,
          openingStockAppliedCount: 0,
          errorFileBase64: Buffer.from(errBuf).toString('base64'),
          errorFileName: `errors_${options.fileName}.xlsx`,
        })
      }

      // 2. Commit all-or-nothing in ONE transaction
      let createdCount = 0
      let updatedCount = 0
      let skippedCount = 0
      let categoriesCreatedCount = 0
      let openingStockAppliedCount = 0
      const now = this.deps.clock.now()

      runInTransaction(this.deps.database, (tx) => {
        // Cache categories
        const catMap = new Map(listCategories(tx).map((c) => [c.name.trim().toLowerCase(), c.id]))

        for (const row of preview.rows) {
          if (row.action === 'skip') {
            skippedCount++
            continue
          }

          // Category resolution
          let categoryId: string | null = null
          if (row.categoryName) {
            const key = row.categoryName.trim().toLowerCase()
            if (catMap.has(key)) {
              categoryId = catMap.get(key)!
            } else if (options.autoCreateCategories !== false) {
              const newCatId = this.ids.next()
              insertCategory(tx, {
                id: newCatId,
                name: row.categoryName.trim(),
                sortOrder: 0,
                createdAt: now,
                updatedAt: now,
                deviceId: this.deps.deviceId,
              })
              catMap.set(key, newCatId)
              categoryId = newCatId
              categoriesCreatedCount++
            }
          }

          if (row.action === 'create') {
            const productId = this.ids.next()
            insertProduct(tx, {
              id: productId,
              sku: row.sku ?? null,
              name: row.name,
              categoryId,
              baseUnitName: row.baseUnitName,
              qtyScale: row.qtyScale,
              priceUnitQtyBase: row.priceUnitQtyBase,
              costPricePiasters: row.costPricePiasters,
              sellingPricePiasters: row.sellingPricePiasters,
              taxRateBps: 0,
              trackExpiry: row.trackExpiry,
              isWeighted: row.isWeighted,
              lowStockThresholdQty: row.lowStockThresholdQty,
              metadata: null,
              createdAt: now,
              updatedAt: now,
              deviceId: this.deps.deviceId,
            })

            // Add barcodes
            for (let bIdx = 0; bIdx < row.barcodes.length; bIdx++) {
              const code = row.barcodes[bIdx]!
              const bId = this.ids.next()
              insertBarcode(tx, {
                id: bId,
                barcode: code,
                productId,
                productUnitId: null,
                isPrimary: bIdx === 0,
                createdAt: now,
                updatedAt: now,
                deviceId: this.deps.deviceId,
              })
            }

            // Apply opening stock if specified and > 0
            if (row.openingStockQty > 0) {
              const mRes = applyMovement(
                tx,
                {
                  ids: this.ids,
                  clock: this.deps.clock,
                  faults: this.faults,
                  allowNegativeStock: false,
                },
                {
                  productId,
                  qtyDelta: row.openingStockQty,
                  movementType: 'adjustment',
                  reason: 'opening_balance',
                  referenceType: 'opening_balance',
                  userId: actor.userId,
                  deviceId: this.deps.deviceId,
                },
              )
              if (mRes.ok) {
                openingStockAppliedCount++
              }
            }

            writeAudit(tx, this.ids, {
              userId: actor.userId,
              action: 'product_created',
              entityType: 'product',
              entityId: productId,
              after: { id: productId, name: row.name, sku: row.sku },
              now,
              deviceId: this.deps.deviceId,
            })

            createdCount++
          } else if (row.action === 'update' && row.matchedProductId) {
            const existing = getProduct(tx, row.matchedProductId)
            if (existing) {
              const fieldsToUpdate: Record<string, unknown> = { updatedAt: now }

              if (options.mode !== 'price_update_only') {
                if (row.name) fieldsToUpdate.name = row.name
                if (categoryId !== null) fieldsToUpdate.categoryId = categoryId
                if (row.lowStockThresholdQty !== undefined) fieldsToUpdate.lowStockThresholdQty = row.lowStockThresholdQty
              }

              // Guard prices by actor permissions
              if (roleHasPermission(actor.role, 'product.price_change')) {
                fieldsToUpdate.sellingPricePiasters = row.sellingPricePiasters
              }
              if (roleHasPermission(actor.role, 'product.cost_change')) {
                fieldsToUpdate.costPricePiasters = row.costPricePiasters
              }

              updateProduct(tx, existing.id, fieldsToUpdate)

              // Add any missing barcodes
              const existingBarcodes = new Set(listBarcodes(tx, existing.id).map((b) => b.barcode))
              for (const code of row.barcodes) {
                if (!existingBarcodes.has(code) && !getBarcode(tx, code)) {
                  insertBarcode(tx, {
                    id: this.ids.next(),
                    barcode: code,
                    productId: existing.id,
                    productUnitId: null,
                    isPrimary: existingBarcodes.size === 0,
                    createdAt: now,
                    updatedAt: now,
                    deviceId: this.deps.deviceId,
                  })
                  existingBarcodes.add(code)
                }
              }

              // Opening stock if on-hand is 0 and no movements
              if (row.openingStockQty > 0) {
                const onHand = getOnHand(tx, existing.id)
                const movements = listStockMovements(tx, existing.id)
                if (onHand.qty === 0 && movements.length === 0) {
                  const mRes = applyMovement(
                    tx,
                    {
                      ids: this.ids,
                      clock: this.deps.clock,
                      faults: this.faults,
                      allowNegativeStock: false,
                    },
                    {
                      productId: existing.id,
                      qtyDelta: row.openingStockQty,
                      movementType: 'adjustment',
                      reason: 'opening_balance',
                      referenceType: 'opening_balance',
                      userId: actor.userId,
                      deviceId: this.deps.deviceId,
                    },
                  )
                  if (mRes.ok) {
                    openingStockAppliedCount++
                  }
                }
              }

              writeAudit(tx, this.ids, {
                userId: actor.userId,
                action: 'product_updated',
                entityType: 'product',
                entityId: existing.id,
                before: { name: existing.name, sellingPricePiasters: existing.sellingPricePiasters },
                after: fieldsToUpdate,
                now,
                deviceId: this.deps.deviceId,
              })

              updatedCount++
            }
          }
        }

        // Summary audit row
        writeAudit(tx, this.ids, {
          userId: actor.userId,
          action: 'products_imported',
          entityType: 'catalog',
          entityId: null,
          after: {
            fileName: options.fileName,
            mode: options.mode,
            createdCount,
            updatedCount,
            skippedCount,
            categoriesCreatedCount,
            openingStockAppliedCount,
          },
          now,
          deviceId: this.deps.deviceId,
        })
      })

      return serviceOk({
        totalRows: preview.totalRows,
        createdCount,
        updatedCount,
        skippedCount,
        failedCount: 0,
        categoriesCreatedCount,
        openingStockAppliedCount,
      })
    } catch (e) {
      return serviceErr('database_error', e)
    }
  }
}
