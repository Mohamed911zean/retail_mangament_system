/**
 * The shift gate (design system §4.5, §4.6): shown instead of the selling screen
 * when shifts are enabled and none is open.
 *
 * It refuses to sell before the service has to. Every sale is written against an
 * open shift, so letting a cashier ring up a whole cart and *then* be rejected
 * with `invalid_shift_state` would waste the queue's time for no reason.
 *
 * Opening cash is asked for here because it is the one number that cannot be
 * derived: the drawer's contents at the start of the day.
 */
import { useState } from 'react'
import { Alert, Button, Card, Field, MoneyInput } from '../../components/ui'
import { messages } from '../../i18n'
import type { DigitStyle } from '../../lib/format'

export type ShiftGateProps = {
  saving: boolean
  /** Already-translated Arabic from a failed shift open, or null. */
  errorText: string | null
  digitStyle: DigitStyle
  onOpen: (openingCashPiasters: number) => void
}

export function ShiftGate({ saving, errorText, digitStyle, onOpen }: ShiftGateProps) {
  const [openingCashPiasters, setOpeningCashPiasters] = useState(0)

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-[520px]">
        <div className="flex flex-col gap-4">
          <Alert tone="warning">{messages.pos.shiftRequired}</Alert>

          <div>
            <h2 className="text-h3 font-semibold text-ink">{messages.pos.shiftOpenTitle}</h2>
            <p className="mt-1 text-sm text-muted">{messages.pos.shiftOpenHint}</p>
          </div>

          <Field label={messages.pos.shiftOpeningCash} htmlFor="pos-shift-opening-cash">
            <MoneyInput
              id="pos-shift-opening-cash"
              value={openingCashPiasters}
              onChange={setOpeningCashPiasters}
              size="lg"
              autoFocus
              digitStyle={digitStyle}
            />
          </Field>

          <Button size="pos" loading={saving} disabled={saving} onClick={() => onOpen(openingCashPiasters)}>
            {messages.pos.shiftOpen}
          </Button>

          {/* The error sits under the button so a retry never moves the field the
              cashier is looking at. */}
          {errorText !== null && <Alert tone="error">{errorText}</Alert>}
        </div>
      </Card>
    </div>
  )
}
