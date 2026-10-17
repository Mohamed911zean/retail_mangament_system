import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Select,
  Table,
  TableEmpty,
  TD,
  TH,
  THead,
  TRow,
} from '../../components/ui'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { downloadBase64File, readFileAsBase64 } from '../../lib/download'
import type { ImportMode, ProductsImportPreview, ProductsImportResult } from '../../../shared/importExport'
import { formatMoney } from '../../lib/format'
import type { DigitStyle } from '../../lib/format'

export type ImportExportDialogProps = {
  open: boolean
  initialMode?: ImportMode
  digitStyle?: DigitStyle
  onClose: () => void
  onSuccess: () => void
}

type Step = 'select' | 'preview' | 'result'

export function ImportExportDialog({
  open,
  initialMode = 'both',
  digitStyle = 'western',
  onClose,
  onSuccess,
}: ImportExportDialogProps) {
  const [step, setStep] = useState<Step>('select')
  const [mode, setMode] = useState<ImportMode>(initialMode)
  const [file, setFile] = useState<File | null>(null)
  const [fileBase64, setFileBase64] = useState<string | null>(null)
  const [autoCreateCategories, setAutoCreateCategories] = useState(true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [preview, setPreview] = useState<ProductsImportPreview | null>(null)
  const [result, setResult] = useState<ProductsImportResult | null>(null)

  function resetState() {
    setStep('select')
    setFile(null)
    setFileBase64(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setLoading(false)
  }

  function handleClose() {
    resetState()
    onClose()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const selected = e.target.files?.[0]
    if (!selected) {
      setFile(null)
      setFileBase64(null)
      return
    }
    setFile(selected)
    try {
      const b64 = await readFileAsBase64(selected)
      setFileBase64(b64)
    } catch {
      setError(messages.importExport.noFileSelected)
    }
  }

  async function handleDownloadTemplate() {
    setLoading(true)
    setError(null)
    try {
      const res = await unwrap(window.api.importExport.getTemplate({ entity: 'products' }))
      downloadBase64File(res.fileBase64, res.fileName, res.mimeType)
    } catch (err) {
      setError(translate(errorKey(err)))
    } finally {
      setLoading(false)
    }
  }

  async function handlePreview() {
    if (!file || !fileBase64) {
      setError(messages.importExport.noFileSelected)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const prev = await unwrap(
        window.api.importExport.previewProducts({
          fileName: file.name,
          fileBase64,
          mode,
        }),
      )
      setPreview(prev)
      setStep('preview')
    } catch (err) {
      setError(translate(errorKey(err)))
    } finally {
      setLoading(false)
    }
  }

  async function handleExecute() {
    if (!file || !fileBase64) return
    setLoading(true)
    setError(null)
    try {
      const res = await unwrap(
        window.api.importExport.executeProductsImport({
          fileName: file.name,
          fileBase64,
          mode,
          autoCreateCategories,
        }),
      )
      setResult(res)
      setStep('result')
      onSuccess()
    } catch (err) {
      setError(translate(errorKey(err)))
    } finally {
      setLoading(false)
    }
  }

  const isPriceMode = mode === 'price_update_only'
  const title = isPriceMode
    ? messages.importExport.dialogPriceTitle
    : messages.importExport.dialogTitle

  return (
    <Dialog open={open} onClose={handleClose} title={title} size="md">
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}

        {/* Step 1: Select Mode & File */}
        {step === 'select' && (
          <div className="flex flex-col gap-5 py-2">
            {!isPriceMode && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-strong">
                  {messages.importExport.mode}
                </label>
                <Select
                  value={mode}
                  onChange={(val) => setMode(val as ImportMode)}
                  options={[
                    { value: 'both', label: messages.importExport.modeBoth },
                    { value: 'create_only', label: messages.importExport.modeCreateOnly },
                    { value: 'update_only', label: messages.importExport.modeUpdateOnly },
                  ]}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-strong">
                {messages.importExport.fileLabel}
              </label>
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => void handleFileChange(e)}
                className="block w-full text-sm text-secondary file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-on-primary hover:file:opacity-90"
              />
              <span className="text-xs text-muted">
                يدعم ملفات إكسل (.xlsx) وملفات CSV بفاصلة منقوطة (;)
              </span>
            </div>

            {!isPriceMode && (
              <label className="flex items-center gap-2 cursor-pointer text-sm text-strong">
                <input
                  type="checkbox"
                  checked={autoCreateCategories}
                  onChange={(e) => setAutoCreateCategories(e.target.checked)}
                  className="rounded border-line"
                />
                {messages.importExport.autoCreateCategories}
              </label>
            )}

            <div className="flex items-center justify-between border-t border-line pt-4">
              <Button
                variant="outline"
                loading={loading}
                onClick={() => void handleDownloadTemplate()}
              >
                {messages.importExport.downloadTemplate}
              </Button>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleClose}>
                  {messages.common.cancel}
                </Button>
                <Button
                  variant="primary"
                  loading={loading}
                  disabled={!fileBase64}
                  onClick={() => void handlePreview()}
                >
                  {messages.common.yes}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && preview && (
          <div className="flex flex-col gap-4">
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-center">
              <div className="rounded-lg bg-surface p-3 border border-line">
                <div className="text-xs text-secondary">{messages.importExport.totalRows}</div>
                <div className="text-lg font-bold text-strong">{preview.totalRows}</div>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-200">
                <div className="text-xs text-emerald-800">{messages.importExport.toCreate}</div>
                <div className="text-lg font-bold text-emerald-900">{preview.toCreateCount}</div>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
                <div className="text-xs text-blue-800">{messages.importExport.toUpdate}</div>
                <div className="text-lg font-bold text-blue-900">{preview.toUpdateCount}</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 border border-gray-200">
                <div className="text-xs text-gray-700">{messages.importExport.toSkip}</div>
                <div className="text-lg font-bold text-gray-900">{preview.toSkipCount}</div>
              </div>
              <div
                className={`rounded-lg p-3 border ${
                  preview.errorCount > 0
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-surface border-line text-secondary'
                }`}
              >
                <div className="text-xs">{messages.importExport.error}</div>
                <div className="text-lg font-bold">{preview.errorCount}</div>
              </div>
            </div>

            {preview.newCategories.length > 0 && (
              <Alert tone="info">
                أقسام جديدة سيتم إنشاؤها ({preview.newCategories.length}):{' '}
                {preview.newCategories.join('، ')}
              </Alert>
            )}

            {preview.errorCount > 0 && (
              <Alert tone="error">
                يوجد {preview.errorCount} صف يحتوي على أخطاء تمنع الحفظ. يرجى تصحيح الملف والمحاولة مرة أخرى.
              </Alert>
            )}

            {/* Preview table */}
            <div className="max-h-72 overflow-y-auto border border-line rounded-md">
              <Table>
                <THead>
                  <TRow>
                    <TH>#</TH>
                    <TH>{messages.importExport.productName}</TH>
                    <TH>{messages.importExport.barcode}</TH>
                    <TH numeric>{messages.importExport.price}</TH>
                    <TH numeric>{messages.importExport.cost}</TH>
                    <TH>{messages.importExport.action}</TH>
                    <TH>{messages.importExport.status}</TH>
                    <TH>{messages.importExport.notes}</TH>
                  </TRow>
                </THead>
                <tbody>
                  {preview.rows.slice(0, 100).map((r) => (
                    <TRow key={r.rowNumber}>
                      <TD>{r.rowNumber}</TD>
                      <TD className="font-medium text-strong">{r.name || '—'}</TD>
                      <TD className="font-mono text-xs">{r.barcodes.join('; ') || '—'}</TD>
                      <TD numeric>{formatMoney(r.sellingPricePiasters, digitStyle)}</TD>
                      <TD numeric>{formatMoney(r.costPricePiasters, digitStyle)}</TD>
                      <TD>
                        {r.action === 'create' && <Badge tone="success">{messages.importExport.create}</Badge>}
                        {r.action === 'update' && <Badge tone="info">{messages.importExport.update}</Badge>}
                        {r.action === 'skip' && <Badge tone="neutral">{messages.importExport.skip}</Badge>}
                      </TD>
                      <TD>
                        {r.status === 'valid' && <span className="text-emerald-600 text-xs font-semibold">✓ سليم</span>}
                        {r.status === 'warning' && <span className="text-amber-600 text-xs font-semibold">تنبيه</span>}
                        {r.status === 'error' && <span className="text-rose-600 text-xs font-semibold">خطأ</span>}
                      </TD>
                      <TD>
                        <span className="text-xs text-secondary max-w-xs truncate block" title={r.messages.join(' | ')}>
                          {r.messages.join(' | ') || '—'}
                        </span>
                      </TD>
                    </TRow>
                  ))}
                  {preview.rows.length === 0 && (
                    <TableEmpty colSpan={8}>لا توجد صفوف بيانات</TableEmpty>
                  )}
                </tbody>
              </Table>
            </div>

            {preview.rows.length > 100 && (
              <span className="text-xs text-muted text-center">
                يتم عرض أول ١٠٠ صف من أصل {preview.rows.length} صفاً
              </span>
            )}

            <div className="flex items-center justify-between border-t border-line pt-4">
              <Button variant="ghost" onClick={() => setStep('select')}>
                {messages.importExport.back}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  {messages.common.cancel}
                </Button>
                <Button
                  variant="primary"
                  loading={loading}
                  disabled={!preview.canProceed}
                  onClick={() => void handleExecute()}
                >
                  {messages.importExport.confirmImport}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 'result' && result && (
          <div className="flex flex-col gap-4 py-2">
            <Alert tone={result.failedCount === 0 ? 'success' : 'warning'}>
              {result.failedCount === 0
                ? messages.importExport.importSuccess
                : 'تم الانتهاء مع وجود صفوف بها أخطاء'}
            </Alert>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-surface p-3 border border-line text-center">
                <div className="text-xs text-secondary">{messages.importExport.createdCount}</div>
                <div className="text-lg font-bold text-emerald-600">{result.createdCount}</div>
              </div>
              <div className="rounded-lg bg-surface p-3 border border-line text-center">
                <div className="text-xs text-secondary">{messages.importExport.updatedCount}</div>
                <div className="text-lg font-bold text-blue-600">{result.updatedCount}</div>
              </div>
              <div className="rounded-lg bg-surface p-3 border border-line text-center">
                <div className="text-xs text-secondary">{messages.importExport.skippedCount}</div>
                <div className="text-lg font-bold text-gray-600">{result.skippedCount}</div>
              </div>
              <div className="rounded-lg bg-surface p-3 border border-line text-center">
                <div className="text-xs text-secondary">{messages.importExport.categoriesCreated}</div>
                <div className="text-lg font-bold text-strong">{result.categoriesCreatedCount}</div>
              </div>
              <div className="rounded-lg bg-surface p-3 border border-line text-center">
                <div className="text-xs text-secondary">{messages.importExport.openingStockApplied}</div>
                <div className="text-lg font-bold text-strong">{result.openingStockAppliedCount}</div>
              </div>
              <div className="rounded-lg bg-surface p-3 border border-line text-center">
                <div className="text-xs text-secondary">{messages.importExport.failedCount}</div>
                <div className="text-lg font-bold text-rose-600">{result.failedCount}</div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-line pt-4">
              {result.errorFileBase64 ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (result.errorFileBase64 && result.errorFileName) {
                      downloadBase64File(
                        result.errorFileBase64,
                        result.errorFileName,
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      )
                    }
                  }}
                >
                  {messages.importExport.downloadErrors}
                </Button>
              ) : (
                <div />
              )}
              <Button variant="primary" onClick={handleClose}>
                {messages.common.close}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
