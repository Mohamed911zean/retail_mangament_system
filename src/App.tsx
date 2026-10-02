import { useEffect, useState } from 'react'
import type { PrinterInfo } from './shared/printing'
import messages from './renderer/i18n/ar.json'
import './App.css'

function App() {
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [status, setStatus] = useState(messages.printing.loading)

  useEffect(() => {
    void window.api.listPrinters()
      .then((availablePrinters) => {
        setPrinters(availablePrinters)
        setSelectedPrinter(availablePrinters.find((printer) => printer.isDefault)?.name ?? availablePrinters[0]?.name ?? '')
        setStatus(availablePrinters.length > 0 ? messages.printing.ready : messages.printing.noPrinters)
      })
      .catch(() => setStatus(messages.printing.loadError))
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
      </section>
    </main>
  )
}

export default App
