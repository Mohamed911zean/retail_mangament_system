export type ImportMode = 'create_only' | 'update_only' | 'both' | 'price_update_only'

export type RowValidationStatus = 'valid' | 'warning' | 'error'

export type ParsedProductRow = {
  rowNumber: number
  rawBarcode?: string
  barcodes: string[]
  name: string
  categoryName?: string
  sku?: string
  baseUnitName: string
  sellingPricePiasters: number
  costPricePiasters: number
  lowStockThresholdQty: number
  isWeighted: boolean
  qtyScale: 0 | 3
  priceUnitQtyBase: number
  trackExpiry: boolean
  openingStockQty: number
  status: RowValidationStatus
  action: 'create' | 'update' | 'skip'
  matchedProductId?: string
  matchedBy?: 'barcode' | 'sku'
  messages: string[]
}

export type ProductsImportPreview = {
  fileName: string
  totalRows: number
  validCount: number
  warningCount: number
  errorCount: number
  toCreateCount: number
  toUpdateCount: number
  toSkipCount: number
  newCategories: string[]
  rows: ParsedProductRow[]
  canProceed: boolean
}

export type ProductsImportResult = {
  totalRows: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  failedCount: number
  categoriesCreatedCount: number
  openingStockAppliedCount: number
  errorFileBase64?: string
  errorFileName?: string
}

export type ExportFileResult = {
  fileName: string
  fileBase64: string
  mimeType: string
}
