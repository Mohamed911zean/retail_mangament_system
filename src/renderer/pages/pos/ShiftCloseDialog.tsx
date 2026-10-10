/**
 * Closing the shift (design system §4.6): count the drawer, and compare it with
 * what the ledger says should be there.
 *
 * Once the shift is closed the form is replaced by the reconciliation and cannot
 * be edited. Re-opening a counted amount would make the discrepancy meaningless,
 * so the only action left is to acknowledge it.
 */
import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Dialog, Field, MoneyInput, TextInput } from '../../components/ui'
import { messages } from '../../i18n'
import { formatMoney, type DigitStyle } from '../../lib/format'
import type { CloseShiftResult } from '../../../shared/ipc'
import type { BadgeTone } from '../../components/ui'

const RECONCILIATION: Record<CloseShiftResult['reconciliation'], { tone: BadgeTone; label: string }> = {
  balanced: { tone: 'success', label: messages.pos.shiftReconciliationBalanced },
  over: { tone: 'warning', label: messages.pos.shiftReconciliationOver },
  short: { tone: 'error', label: messages.pos.shiftReconciliationShort },
}

export type ShiftCloseDialogProps = {
  open: boolean
  busy: boolean
  /** Already-translated Arabic from a failed close, or null. */
  errorText: string | null
  /** Set once the shift closed: the reconciliation replaces the form. */
  result: CloseShiftResult | null
  digitStyle: DigitStyle
  onClose: () => void
  onConfirm: (countedCashPiasters: number, notes: string | null) => void
}

export function ShiftCloseDialog({ open, busy, errorText, result, digitStyle, onClose, onConfirm }: ShiftCloseDialogProps) {
  const [countedCashPiasters, setCountedCashPiasters] = useState(0)
  const [notes, setNotes] = useState('')

  // A fresh closing starts from an empty drawer count, never from the last one.
  useEffect(() => {
    if (open) {
      setCountedCashPiasters(0)
      setNotes('')
    }
  }, [open])

  function row(label: string, value: string) {
    return (
      <div className="flex items-center justify-between gap-4 py-0.5">
        <span className="text-secondary">{label}</span>
        <span className="numeric text-ink">{value}</span>
      </div>
    )
  }

  if (result !== null) {
    const counted = result.shift.countedCashPiasters ?? countedCashPiasters
    const reconciliation = RECONCILIATION[result.reconciliation]
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={messages.pos.shiftCloseTitle}
        size="sm"
        footer={
          <Button variant="primary" onClick={onClose}>
            {messages.common.close}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {row(messages.pos.shiftExpected, formatMoney(result.expectedCashPiasters, digitStyle))}
          {row(messages.pos.shiftCounted, formatMoney(counted, digitStyle))}
          {row(messages.pos.shiftDifference, formatMoney(result.differencePiasters, digitStyle))}
          <div className="flex items-center gap-2">
            <span className="text-secondary">{messages.pos.shift}</span>
            <Badge tone={reconciliation.tone}>{reconciliation.label}</Badge>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={messages.pos.shiftCloseTitle}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {messages.common.cancel}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={busy}
            onClick={() => onConfirm(countedCashPiasters, notes.trim() === '' ? null : notes.trim())}
          >
            {messages.pos.shiftClose}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{messages.pos.shiftCloseHint}</p>

        <Field label={messages.pos.shiftCounted} htmlFor="pos-shift-counted">
          <MoneyInput
            id="pos-shift-counted"
            value={countedCashPiasters}
            onChange={setCountedCashPiasters}
            size="lg"
            autoFocus
            digitStyle={digitStyle}
          />
        </Field>

        <Field label={messages.pos.shiftNotes} htmlFor="pos-shift-notes">
          <TextInput id="pos-shift-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={200} />
        </Field>

        {errorText !== null && <Alert tone="error">{errorText}</Alert>}
      </div>
    </Dialog>
  )
}
