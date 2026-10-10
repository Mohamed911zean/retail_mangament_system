import { app, BrowserWindow, dialog, session } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  closeDatabase,
  createDatabaseBackup,
  listDatabaseBackups,
  openDatabase,
  restoreDatabaseBackup,
  type DatabaseBackup,
  type DatabaseContext,
} from './database/database'
import type { BackupInfo } from '../shared/backup'
import type { SaleReceiptData } from '../shared/printing'
import { listPrinters, printSaleReceipt, printTestReceipt } from './printing/printing'
import { isLicenseWriteAllowed, LicenseService } from './license/license-service'
import { registerIpcHandlers } from './ipc/register'
import { SessionStore } from './ipc/session'
import type { Platform } from './ipc/platform'

const rendererUrl = process.env.SMALL_ERP_RENDERER_URL
let databaseContext: DatabaseContext | undefined
let mainWindow: BrowserWindow | undefined
let licenseService: LicenseService | undefined
let licenseCheckTimer: NodeJS.Timeout | undefined

function requireDatabase(): DatabaseContext {
  if (databaseContext === undefined) throw new Error('The database is not available.')
  return databaseContext
}

function requireWindow(): BrowserWindow {
  if (mainWindow === undefined || mainWindow.isDestroyed()) throw new Error('The main window is not available.')
  return mainWindow
}

/** Backup rows are trimmed before they cross IPC: the file path stays in main. */
function toBackupInfo(backup: DatabaseBackup): BackupInfo {
  return { fileName: backup.fileName, createdAt: backup.createdAt, sizeBytes: backup.sizeBytes }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)
}

function logAndShowError(context: string, error: unknown): void {
  const message = `[${new Date().toISOString()}] ${context}\n${errorMessage(error)}\n`

  try {
    const logDirectory = join(app.getPath('userData'), 'logs')
    mkdirSync(logDirectory, { recursive: true })
    appendFileSync(join(logDirectory, 'main.log'), message, 'utf8')
  } catch (logError) {
    console.error('Unable to write main-process error log:', logError)
    console.error(message)
  }

  if (app.isReady()) {
    dialog.showErrorBox('Small Shop POS', `${context}\n\n${errorMessage(error)}`)
  }
}

async function createWindow(): Promise<void> {
  try {
    const window = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 720,
      minHeight: 520,
      show: false,
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    mainWindow = window

    window.once('ready-to-show', () => window.show())
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      logAndShowError(
        `Renderer failed to load (${errorCode}): ${errorDescription}\nURL: ${validatedURL}`,
        new Error(errorDescription),
      )
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      logAndShowError(
        `Renderer process exited (${details.reason}, code ${details.exitCode})`,
        new Error('The renderer process stopped unexpectedly.'),
      )
    })

    if (rendererUrl) {
      await window.loadURL(rendererUrl)
      return
    }

    await window.loadFile(join(__dirname, '..', '..', 'dist', 'index.html'))
  } catch (error) {
    logAndShowError('Window creation failed.', error)
  }
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const isLocalRequest =
        details.url.startsWith('file://') ||
        details.url.startsWith('devtools://') ||
        (rendererUrl !== undefined && details.url.startsWith(rendererUrl))

      callback({ cancel: !isLocalRequest })
    },
  )

  databaseContext = await openDatabase(app.getPath('userData'), join(__dirname, '..', '..', 'migrations'))
  licenseService = new LicenseService({
    userDataPath: app.getPath('userData'),
    publicKeyPath: join(__dirname, 'license', 'public-key.pem'),
  })
  await licenseService.getStatus()
  licenseCheckTimer = setInterval(() => {
    void licenseService?.getStatus()
  }, 60_000)

  // Everything the IPC layer needs from the Electron shell. Keeping it behind
  // one interface means the whole IPC surface can be unit tested with a fake.
  const platform: Platform = {
    version: app.getVersion(),
    listPrinters: async () => {
      try {
        return await listPrinters(requireWindow())
      } catch (error) {
        logAndShowError('Printer enumeration failed.', error)
        throw error
      }
    },
    printTestReceipt: async (printerName: string) => {
      try {
        return await printTestReceipt(requireWindow(), app.getPath('userData'), printerName)
      } catch (error) {
        logAndShowError('Test receipt printing failed.', error)
        throw error
      }
    },
    printSaleReceipt: async (printerName: string, saleId: string, receipt: SaleReceiptData) => {
      try {
        return await printSaleReceipt(requireWindow(), app.getPath('userData'), printerName, saleId, receipt)
      } catch (error) {
        logAndShowError('Receipt printing failed.', error)
        throw error
      }
    },
    listBackups: () => listDatabaseBackups(requireDatabase()).map(toBackupInfo),
    createBackup: async () => {
      try {
        return toBackupInfo(await createDatabaseBackup(requireDatabase()))
      } catch (error) {
        logAndShowError('Database backup failed.', error)
        throw error
      }
    },
    restoreBackup: async (fileName: string) => {
      try {
        databaseContext = await restoreDatabaseBackup(requireDatabase(), fileName)
        return listDatabaseBackups(databaseContext).map(toBackupInfo)
      } catch (error) {
        logAndShowError('Database restore failed.', error)
        throw error
      }
    },
    licenseStatus: async () => {
      if (licenseService === undefined) throw new Error('The license service is not available.')
      return licenseService.getStatus()
    },
    activateLicense: async (key: string) => {
      if (licenseService === undefined) throw new Error('The license service is not available.')
      return licenseService.activate(key)
    },
    isWriteAllowed: async () => {
      if (licenseService === undefined) return true
      return isLicenseWriteAllowed(await licenseService.getStatus())
    },
    reportUnexpectedError: (context, error) => logAndShowError(context, error),
  }

  registerIpcHandlers({
    getDatabase: () => requireDatabase().database,
    session: new SessionStore(),
    platform,
  })

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
}).catch((error: unknown) => {
  logAndShowError('Electron startup failed.', error)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  if (licenseCheckTimer) {
    clearInterval(licenseCheckTimer)
  }
  if (databaseContext) {
    closeDatabase(databaseContext)
  }
})
