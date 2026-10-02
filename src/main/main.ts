import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  closeDatabase,
  createDatabaseBackup,
  listDatabaseBackups,
  openDatabase,
  restoreDatabaseBackup,
  type DatabaseContext,
} from './database/database'
import { listPrinters, printTestReceipt } from './printing/printing'

const rendererUrl = process.env.SMALL_ERP_RENDERER_URL
let databaseContext: DatabaseContext | undefined
let mainWindow: BrowserWindow | undefined

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
  ipcMain.handle('printing:list-printers', async () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('The main window is not available.')
      }
      return await listPrinters(mainWindow)
    } catch (error) {
      logAndShowError('Printer enumeration failed.', error)
      throw error
    }
  })
  ipcMain.handle('printing:print-test-receipt', async (_event, printerName: unknown) => {
    try {
      if (typeof printerName !== 'string' || printerName.length === 0) {
        throw new Error('A printer must be selected.')
      }
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('The main window is not available.')
      }
      return await printTestReceipt(mainWindow, app.getPath('userData'), printerName)
    } catch (error) {
      logAndShowError('Test receipt printing failed.', error)
      throw error
    }
  })
  ipcMain.handle('backup:list', () => {
    if (!databaseContext) {
      throw new Error('The database is not available.')
    }
    return listDatabaseBackups(databaseContext).map(({ fileName, createdAt, sizeBytes }) => ({
      fileName,
      createdAt,
      sizeBytes,
    }))
  })
  ipcMain.handle('backup:create', async () => {
    try {
      if (!databaseContext) {
        throw new Error('The database is not available.')
      }
      const backup = await createDatabaseBackup(databaseContext)
      return { fileName: backup.fileName, createdAt: backup.createdAt, sizeBytes: backup.sizeBytes }
    } catch (error) {
      logAndShowError('Database backup failed.', error)
      throw error
    }
  })
  ipcMain.handle('backup:restore', async (_event, fileName: unknown) => {
    try {
      if (typeof fileName !== 'string' || fileName.length === 0) {
        throw new Error('A backup must be selected.')
      }
      if (!databaseContext) {
        throw new Error('The database is not available.')
      }
      databaseContext = await restoreDatabaseBackup(databaseContext, fileName)
      return listDatabaseBackups(databaseContext).map(({ fileName: name, createdAt, sizeBytes }) => ({
        fileName: name,
        createdAt,
        sizeBytes,
      }))
    } catch (error) {
      logAndShowError('Database restore failed.', error)
      throw error
    }
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
  if (databaseContext) {
    closeDatabase(databaseContext)
  }
})
