import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, Field, MoneyInput, TextInput } from '../../components/ui'
import { messages } from '../../i18n'
import type { DigitStyle } from '../../lib/format'

/**
 * A manual drawer move: cash in or cash out, with a mandatory written reason.
 * The reason is the audit trail — "why did the drawer move?" must never be
 * answered with "no one wrote it down".
 */
export type CashMoveDialogProps = {
  open: boolean
  direction: 'in' | 'out'
  /** Null when no shift is open: the form is replaced by the hint. */
  shiftId: string | null
  digitStyle: DigitStyle
  saving: boolean
  /** Already-translated server error from the last attempt. */
  errorText: string | null
  onClose: () => void
  onSave: (amountPiasters: number, referenceText: string) => void
}

export function CashMoveDialog({ open, direction, shiftId, digitStyle, saving, errorText, onClose, onSave }: CashMoveDialogProps) {
  const [amount, setAmount] = useState(0)
  const [reference, setReference] = useState('')
  const [triedSave, setTriedSave] = useState(false)

  // Opening starts from an empty move, never from the last one.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setAmount(0)
      setReference('')
      setTriedSave(false)
    }
  }, [open, direction])
  /* eslint-enable react-hooks/set-state-in-effect */

  const referenceInvalid = triedSave && reference.trim().length === 0

  function save(): void {
    setTriedSave(true)
    if (shiftId === null || amount <= 0 || reference.trim().length === 0) return
    onSave(amount, reference.trim())
  }

  return (
    <Dialog open={open} onClose={onClose} title={direction === 'in' ? messages.treasury.cashIn : messages.treasury.cashOut} size="sm">
      <div className="flex flex-col gap-4">
        {errorText !== null && <Alert tone="error">{errorText}</Alert>}

        {shiftId === null ? (
          <Alert tone="info">{messages.treasury.noOpenShift}</Alert>
        ) : (
          <>
            <Field label={messages.treasury.amount} htmlFor="cash-move-amount">
              <MoneyInput id="cash-move-amount" value={amount} onChange={setAmount} digitStyle={digitStyle} autoFocus />
            </Field>

            <Field label={messages.treasury.reference} htmlFor="cash-move-reference" required error={referenceInvalid ? messages.treasury.descriptionRequired : undefined}>
              <TextInput
                id="cash-move-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={300}
                error={referenceInvalid}
              />
            </Field>

            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {messages.common.cancel}
              </Button>
              <Button variant="primary" loading={saving} disabled={amount <= 0} onClick={save}>
                {messages.common.save}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
