import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Select, Toggle } from '../../components/ui'
import { messages, translate } from '../../i18n'
import { errorKey, unwrap } from '../../lib/ipc'
import type { PrinterInfo } from '../../../shared/printing'
import type { Preferences } from '../../lib/preferences'

type Status = { kind: 'info' | 'success' | 'warning' | 'error'; text: string }

export type PrintingSectionProps = {
  preferences: Preferences
  onPreferencesChange: (preferences: Preferences) => void
}

/**
 * Printer picker + test print (AGENTS.md §7, design system §4.6 in Settings).
 *
 * The list comes from the Windows driver through Electron, so the shop picks the
 * receipt printer by name once; a test button proves the choice before a real
 * sale depends on it. Failures are inline alerts, never toasts — a printer that
 * did not print is exactly the kind of thing a cashier must acknowledge.
 *
 * The choice is persisted in the renderer's preferences, not in the database:
 * it names a driver on *this* PC, and the selling screen needs it without a
 * round trip or a migration.
 */
export function PrintingSection({ preferences, onPreferencesChange }: PrintingSectionProps) {
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [status, setStatus] = useState<Status>({ kind: 'info', text: messages.printing.loading })
  const [busy, setBusy] = useState(false)

  // Read the latest props from inside the load effect without re-running it:
  // re-listing the printers when the printer choice changes would wipe the alert
  // the shop is reading.
  const latest = useRef({ preferences, onPreferencesChange })
  useEffect(() => {
    latest.current = { preferences, onPreferencesChange }
  })

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const available = await unwrap(window.api.printing.listPrinters())
        if (!alive) return
        setPrinters(available)
        setStatus(
          available.length > 0
            ? { kind: 'info', text: messages.printing.ready }
            : { kind: 'warning', text: messages.printing.noPrinters },
        )

        // First run only: the Windows default is the best guess there is, and
        // storing it means a sale has somewhere to print the moment one is made.
        const current = latest.current
        if (current.preferences.receiptPrinter === '') {
          const fallback = available.find((printer) => printer.isDefault)?.name ?? available[0]?.name ?? ''
          if (fallback !== '') current.onPreferencesChange({ ...current.preferences, receiptPrinter: fallback })
        }
      } catch (error) {
        if (!alive) return
        setStatus({ kind: 'error', text: translate(errorKey(error)) })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  async function handleTestPrint(): Promise<void> {
    if (preferences.receiptPrinter === '') {
      setStatus({ kind: 'warning', text: messages.printing.selectPrinter })
      return
    }
    setBusy(true)
    setStatus({ kind: 'info', text: messages.printing.printing })
    try {
      await unwrap(window.api.printing.printTestReceipt(preferences.receiptPrinter))
      setStatus({ kind: 'success', text: messages.printing.success })
    } catch (error) {
      setStatus({ kind: 'error', text: translate(errorKey(error)) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-h3 font-semibold text-ink">{messages.printing.title}</h2>

      <label htmlFor="settings-printer" className="text-sm font-semibold text-strong">
        {messages.printing.label}
      </label>
      <div className="max-w-[420px]">
        <Select
          id="settings-printer"
          value={preferences.receiptPrinter}
          options={printers.map((printer) => ({ value: printer.name, label: printer.displayName }))}
          onChange={(receiptPrinter) => onPreferencesChange({ ...preferences, receiptPrinter })}
          placeholder={messages.printing.choose}
          disabled={printers.length === 0}
        />
      </div>

      <div>
        <Button variant="outline" onClick={() => void handleTestPrint()} loading={busy} disabled={preferences.receiptPrinter === ''}>
          {messages.printing.testButton}
        </Button>
      </div>

      <Toggle
        id="settings-auto-print"
        checked={preferences.autoPrintReceipt}
        onChange={(autoPrintReceipt) => onPreferencesChange({ ...preferences, autoPrintReceipt })}
        label={
          <span>
            {messages.printing.autoPrint}
            <span className="block text-sm font-normal text-muted">{messages.printing.autoPrintHint}</span>
          </span>
        }
      />

      <Alert tone={status.kind}>{status.text}</Alert>
    </section>
  )
}
