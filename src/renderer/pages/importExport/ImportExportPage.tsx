import { useState } from 'react'
import { Alert, Button, Card } from '../../components/ui'
import { BoxIcon, DownloadIcon, UploadIcon, UsersIcon, StoreIcon, ClipboardIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import { downloadBase64File } from '../../lib/download'
import { ImportExportDialog } from '../products/ImportExportDialog'
import type { CurrentUser } from '../../../shared/ipc'
import type { Preferences } from '../../lib/preferences'
import type { ImportMode } from '../../../shared/importExport'
import { useToast } from '../../lib/toast'

export type ImportExportPageProps = {
  user: CurrentUser
  preferences: Preferences
}

export function ImportExportPage({ user, preferences }: ImportExportPageProps) {
  const toast = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<ImportMode>('both')
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const canImport = user.permissions.includes('data.import')
  const canExport = user.permissions.includes('data.export')

  async function handleDownloadTemplate() {
    setLoadingAction('template')
    setPageError(null)
    try {
      const res = await unwrap(window.api.importExport.getTemplate({ entity: 'products' }))
      downloadBase64File(res.fileBase64, res.fileName, res.mimeType)
      toast({ message: 'تم تحميل نموذج المنتجات', kind: 'success' })
    } catch (err) {
      setPageError(translate(errorKey(err)))
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleExport(format: 'xlsx' | 'csv') {
    setLoadingAction(`export_${format}`)
    setPageError(null)
    try {
      const res = await unwrap(window.api.importExport.exportProducts({ format }))
      downloadBase64File(res.fileBase64, res.fileName, res.mimeType)
      toast({ message: `تم تصدير المنتجات (${format.toUpperCase()}) بنجاح`, kind: 'success' })
    } catch (err) {
      setPageError(translate(errorKey(err)))
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-strong">{messages.importExport.title}</h1>
        <p className="text-sm text-secondary">{messages.importExport.subtitle}</p>
      </div>

      {pageError && <Alert tone="error">{pageError}</Alert>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Products Card */}
        <Card>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary">
                <BoxIcon size={24} />
              </div>
              <div>
                <h2 className="text-base font-bold text-strong">
                  {messages.importExport.productsCardTitle}
                </h2>
                <p className="text-xs text-secondary">{messages.importExport.productsCardDesc}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                variant="outline"
                loading={loadingAction === 'template'}
                onClick={() => void handleDownloadTemplate()}
              >
                <DownloadIcon size={16} />
                {messages.importExport.downloadTemplate}
              </Button>

              {canExport && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    loading={loadingAction === 'export_xlsx'}
                    onClick={() => void handleExport('xlsx')}
                  >
                    {messages.importExport.exportXlsx}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    loading={loadingAction === 'export_csv'}
                    onClick={() => void handleExport('csv')}
                  >
                    {messages.importExport.exportCsv}
                  </Button>
                </div>
              )}
            </div>

            {canImport && (
              <div className="flex flex-col gap-2 border-t border-line pt-4">
                <Button
                  variant="primary"
                  onClick={() => {
                    setDialogMode('both')
                    setDialogOpen(true)
                  }}
                >
                  <UploadIcon size={16} />
                  {messages.importExport.importProducts}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setDialogMode('price_update_only')
                    setDialogOpen(true)
                  }}
                >
                  {messages.importExport.bulkPriceUpdate}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Customers Card (Placeholder for Step G) */}
        <Card>
          <div className="flex flex-col gap-4 p-5 opacity-70">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-secondary">
                <UsersIcon size={24} />
              </div>
              <div>
                <h2 className="text-base font-bold text-strong">
                  {messages.importExport.customersTitle}
                </h2>
                <p className="text-xs text-secondary">{messages.importExport.customersDesc}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Suppliers Card (Placeholder for Step G) */}
        <Card>
          <div className="flex flex-col gap-4 p-5 opacity-70">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-secondary">
                <StoreIcon size={24} />
              </div>
              <div>
                <h2 className="text-base font-bold text-strong">
                  {messages.importExport.suppliersTitle}
                </h2>
                <p className="text-xs text-secondary">{messages.importExport.suppliersDesc}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Stock Count Card (Placeholder for Step G) */}
        <Card>
          <div className="flex flex-col gap-4 p-5 opacity-70">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-secondary">
                <ClipboardIcon size={24} />
              </div>
              <div>
                <h2 className="text-base font-bold text-strong">
                  {messages.importExport.stockCountTitle}
                </h2>
                <p className="text-xs text-secondary">{messages.importExport.stockCountDesc}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <ImportExportDialog
        open={dialogOpen}
        initialMode={dialogMode}
        digitStyle={preferences.digitStyle}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => {
          toast({ message: 'تم الانتهاء بنجاح', kind: 'success' })
        }}
      />
    </div>
  )
}
