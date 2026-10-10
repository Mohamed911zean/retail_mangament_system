import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, Field, MoneyInput, QtyInput, Select, TextInput, Toggle } from '../../components/ui'
import { messages } from '../../i18n'
import { type DigitStyle } from '../../lib/format'
import type { ProductSummary } from '../../../shared/ipc'

/**
 * A stock correction for one product: an adjustment (up or down, optionally
 * re-valued) or a damage write-off (down only, valued at the average cost).
 *
 * The page owns the IPC call; this dialog owns the draft and reports the
 * signed intent. A zero quantity is refused here — the ledger rejects a
 * movement that moves nothing, and the cashier should hear that before saving.
 */
export type AdjustDialogProps = {
  open: boolean
  mode: 'adjust' | 'damage'
  product: ProductSummary | null
  digitStyle: DigitStyle
  saving: boolean
  /** Already-translated server error from the last attempt. */
  errorText: string | null
  onClose: () => void
  onAdjust: (productId: string, qtyDelta: number, valuePiasters: number | undefined, reason: string) => void
  onDamage: (productId: string, qtyBase: number, reason: string) => void
}

export function AdjustDialog({ open, mode, product, digitStyle, saving, errorText, onClose, onAdjust, onDamage }: AdjustDialogProps) {
  const [increase, setIncrease] = useState(true)
  const [qty, setQty] = useState(0)
  const [autoValue, setAutoValue] = useState(true)
  const [value, setValue] = useState(0)
  const [reason, setReason] = useState('')
  const [triedSave, setTriedSave] = useState(false)

  // Opening (another product, another mode) starts from an empty correction.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setIncrease(true)
      setQty(0)
      setAutoValue(true)
      setValue(0)
      setReason('')
      setTriedSave(false)
    }
  }, [open, mode, product?.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  const reasonInvalid = triedSave && reason.trim().length === 0
  const qtyInvalid = triedSave && qty <= 0

  function save(): void {
    setTriedSave(true)
    if (product === null || qty <= 0 || reason.trim().length === 0) return
    if (mode === 'damage') {
      onDamage(product.id, qty, reason.trim())
      return
    }
    onAdjust(product.id, increase ? qty : -qty, autoValue ? undefined : value, reason.trim())
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'damage' ? messages.inventory.damage : messages.inventory.adjust}
      description={product?.name}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {messages.common.cancel}
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {messages.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {errorText !== null && <Alert tone="error">{errorText}</Alert>}

        {mode === 'adjust' && (
          <Field label={messages.inventory.adjust} htmlFor="adjust-direction">
            <Select
              id="adjust-direction"
              value={increase ? 'increase' : 'decrease'}
              onChange={(value) => setIncrease(value !== 'decrease')}
              options={[
                { value: 'increase', label: messages.inventory.increase },
                { value: 'decrease', label: messages.inventory.decrease },
              ]}
            />
          </Field>
        )}

        <Field label={messages.inventory.adjustQty} htmlFor="adjust-qty" error={qtyInvalid ? messages.inventory.qtyRequired : undefined}>
          <QtyInput
            id="adjust-qty"
            value={qty}
            onChange={setQty}
            qtyScale={product?.qtyScale ?? 0}
            unitName={product?.baseUnitName ?? ''}
            showStepper={false}
            digitStyle={digitStyle}
            autoFocus
          />
        </Field>

        {mode === 'adjust' && (
          <>
            <Toggle id="adjust-auto-value" checked={autoValue} onChange={setAutoValue} label={messages.inventory.autoValue} />
            {!autoValue && (
              <Field label={messages.inventory.adjustValue} htmlFor="adjust-value">
                <MoneyInput id="adjust-value" value={value} onChange={setValue} digitStyle={digitStyle} />
              </Field>
            )}
          </>
        )}

        <Field label={messages.inventory.reason} htmlFor="adjust-reason" required error={reasonInvalid ? messages.inventory.reasonRequired : undefined}>
          <TextInput
            id="adjust-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            error={reasonInvalid}
          />
        </Field>
      </div>
    </Dialog>
  )
}
