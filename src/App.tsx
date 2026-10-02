import { useEffect, useState } from 'react'
import type { BackupInfo } from './shared/backup'
import type { PrinterInfo } from './shared/printing'
import messages from './renderer/i18n/ar.json'
import './App.css'

function App() {
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [status, setStatus] = useState(messages.printing.loading)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [selectedBackup, setSelectedBackup] = useState('')
  const [backupStatus, setBackupStatus] = useState(messages.backup.loading)

  useEffect(() => {
    void window.api.listPrinters()
      .then((availablePrinters) => {
        setPrinters(availablePrinters)
        setSelectedPrinter(availablePrinters.find((printer) => printer.isDefault)?.name ?? availablePrinters[0]?.name ?? '')
        setStatus(availablePrinters.length > 0 ? messages.printing.ready : messages.printing.noPrinters)
      })
      .catch(() => setStatus(messages.printing.loadError))
  }, [])

  useEffect(() => {
    void window.api.listBackups()
      .then((availableBackups) => {
        setBackups(availableBackups)
        setSelectedBackup(availableBackups[0]?.fileName ?? '')
        setBackupStatus(availableBackups.length > 0 ? messages.backup.ready : messages.backup.none)
      })
      .catch(() => setBackupStatus(messages.backup.loadError))
  }, [])

  async function handleTestPrint(): Promise<void> {
    if (!selectedPrinter) {
      setStatus(messages.printing.selectPrinter)
      return
    }

    setStatus(messages.printing.printing)
    try {
      await window.api.printTestReceipt(selectedPrinter)
      setStatus(messages.printing.success)
    } catch {
      setStatus(messages.printing.printError)
    }
  }

  async function handleCreateBackup(): Promise<void> {
    setBackupStatus(messages.backup.creating)
    try {
      const backup = await window.api.createBackup()
      setBackups((current) => [backup, ...current])
      setSelectedBackup(backup.fileName)
      setBackupStatus(messages.backup.created)
    } catch {
      setBackupStatus(messages.backup.createError)
    }
  }

  async function handleRestoreBackup(): Promise<void> {
    if (!selectedBackup) {
      setBackupStatus(messages.backup.select)
      return
    }
    if (!window.confirm(messages.backup.confirm)) {
      return
    }

    setBackupStatus(messages.backup.restoring)
    try {
      const availableBackups = await window.api.restoreBackup(selectedBackup)
      setBackups(availableBackups)
      setBackupStatus(messages.backup.restored)
    } catch {
      setBackupStatus(messages.backup.restoreError)
    }
  }

  return (
    <main className="app-shell">
      <section className="welcome-card" aria-labelledby="welcome-title">
        <p className="eyebrow">{messages.app.phase}</p>
        <h1 id="welcome-title">{messages.app.title}</h1>
        <p className="description">{messages.app.description}</p>
        <div className="status" role="status">
          <span className="status-dot" aria-hidden="true" />
          {messages.app.status}
        </div>
        <div className="printing-demo">
          <h2>{messages.printing.title}</h2>
          <label htmlFor="printer-select">{messages.printing.label}</label>
          <select
            id="printer-select"
            value={selectedPrinter}
            onChange={(event) => setSelectedPrinter(event.target.value)}
            disabled={printers.length === 0}
          >
            <option value="">{messages.printing.choose}</option>
            {printers.map((printer) => (
              <option key={printer.name} value={printer.name}>
                {printer.displayName}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void handleTestPrint()} disabled={!selectedPrinter}>
            {messages.printing.testButton}
          </button>
          <p className="printing-status">{status}</p>
        </div>
        <div className="backup-demo">
          <h2>{messages.backup.title}</h2>
          <button type="button" onClick={() => void handleCreateBackup()}>
            {messages.backup.createButton}
          </button>
          <label htmlFor="backup-select">{messages.backup.label}</label>
          <select
            id="backup-select"
            value={selectedBackup}
            onChange={(event) => setSelectedBackup(event.target.value)}
            disabled={backups.length === 0}
          >
            <option value="">{messages.backup.choose}</option>
            {backups.map((backup) => (
              <option key={backup.fileName} value={backup.fileName}>
                {backup.fileName}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void handleRestoreBackup()} disabled={!selectedBackup}>
            {messages.backup.restoreButton}
          </button>
          <p className="printing-status">{backupStatus}</p>
        </div>
      </section>
    </main>
  )
}

export default App
