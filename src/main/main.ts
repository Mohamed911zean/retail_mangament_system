import { app, BrowserWindow, dialog, session } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const rendererUrl = process.env.SMALL_ERP_RENDERER_URL

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

    await window.loadFile(join(__dirname, '..', 'dist', 'index.html'))
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
