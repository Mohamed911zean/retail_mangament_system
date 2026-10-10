/**
 * The held-invoices dialog (design system §4.5, F5): the sales the cashier parked
 * while a customer went back for something else.
 *
 * Resuming is not done here — the page owns the cart, so it decides what happens
 * to an unfinished invoice. This dialog only lists, and asks before destroying.
 */
import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, IconButton, Spinner, TD, TH, THead, TRow, Table } from '../../components/ui'
import { ReceiptIcon, TrashIcon } from '../../components/icons'
import { messages } from '../../i18n'
import { unwrap } from '../../lib/ipc'
import { formatDateTime, type DigitStyle } from '../../lib/format'
import type { HeldSaleSummary } from '../../../shared/ipc'

export type HeldSalesDialogProps = {
  open: boolean
  /** Bumped by the page after a hold is created or dropped, so this list reloads. */
  reloadToken: number
  digitStyle: DigitStyle
  onClose: () => void
  onResume: (heldSaleId: string) => void
  onDrop: (heldSaleId: string) => void
}

export function HeldSalesDialog({ open, reloadToken, digitStyle, onClose, onResume, onDrop }: HeldSalesDialogProps) {
  const [held, setHeld] = useState<HeldSaleSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const [confirmDropId, setConfirmDropId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    setHeld(null)
    setFailed(false)

    async function load(): Promise<void> {
      try {
        const list = await unwrap(window.api.sales.held())
        if (alive) setHeld(list)
      } catch {
        if (alive) setFailed(true)
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [open, reloadToken, reloadTick])

  function renderBody() {
    if (failed) {
      return (
        <div className="flex flex-col items-start gap-3">
          <Alert tone="error">{messages.pos.heldLoadError}</Alert>
          <Button variant="outline" onClick={() => setReloadTick((tick) => tick + 1)}>
            {messages.common.retry}
          </Button>
        </div>
      )
    }
    if (held === null) {
      return (
        <div className="flex items-center justify-center gap-2 p-8 text-muted">
          <Spinner />
          <span>{messages.pos.heldLoading}</span>
        </div>
      )
    }
    if (held.length === 0) {
      return <EmptyState icon={<ReceiptIcon size={24} />} title={messages.pos.heldEmpty} />
    }
    return (
      <Table>
        <THead>
          <TRow>
            <TH>{messages.pos.holdLabel}</TH>
            <TH>
              <span className="sr-only">{messages.pos.shiftStartedAt}</span>
            </TH>
            <TH>
              <span className="sr-only">{messages.pos.resume}</span>
            </TH>
          </TRow>
        </THead>
        <tbody>
          {held.map((heldSale) => (
            <TRow key={heldSale.id}>
              <TD>
                {heldSale.label === null || heldSale.label.length === 0 ? (
                  <span className="text-muted">{messages.pos.holdNoLabel}</span>
                ) : (
                  heldSale.label
                )}
              </TD>
              <TD numeric>{formatDateTime(heldSale.heldAt, digitStyle)}</TD>
              <TD>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="primary" size="sm" onClick={() => onResume(heldSale.id)}>
                    {messages.pos.resume}
                  </Button>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label={messages.pos.holdDiscard}
                    onClick={() => setConfirmDropId(heldSale.id)}
                  >
                    <TrashIcon size={16} />
                  </IconButton>
                </div>
              </TD>
            </TRow>
          ))}
        </tbody>
      </Table>
    )
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} title={messages.pos.heldTitle} size="md">
        {renderBody()}
      </Dialog>

      {/* Discarding a held invoice cannot be undone, so it names its object and
          waits for a second, deliberate click. */}
      <Dialog
        open={confirmDropId !== null}
        onClose={() => setConfirmDropId(null)}
        title={messages.pos.holdDiscardConfirm}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDropId(null)}>
              {messages.common.no}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                // Read the id before clearing it: the state update is async and
                // the callback must not observe the already-cleared value.
                const id = confirmDropId
                setConfirmDropId(null)
                if (id !== null) onDrop(id)
              }}
            >
              {messages.pos.holdDiscard}
            </Button>
          </>
        }
      />
    </>
  )
}
