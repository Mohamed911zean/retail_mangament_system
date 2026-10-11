import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, Field, MoneyInput, Select, TextInput } from '../../components/ui'
import { messages } from '../../i18n'
import type { DigitStyle } from '../../lib/format'
import type { ExpenseInput } from '../../../shared/ipc'
import type { PaymentMethod } from '../../../shared/settings'

/**
 * A new shop expense. It always posts into the current open shift — that is a
 * service rule, not a choice — so without one the dialog says so instead of
 * offering a form that can only fail.
 */
export type ExpenseDialogProps = {
  open: boolean
  /** Null when no shift is open: the form is replaced by the hint. */
  shiftId: string | null
  paymentMethods: readonly PaymentMethod[]
  digitStyle: DigitStyle
  saving: boolean
  /** Already-translated server error from the last attempt. */
  errorText: string | null
  onClose: () => void
  onSave: (input: ExpenseInput) => void
}

export function ExpenseDialog({ open, shiftId, paymentMethods, digitStyle, saving, errorText, onClose, onSave }: ExpenseDialogProps) {
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [triedSave, setTriedSave] = useState(false)

  // Opening starts from an empty form, never from the last expense.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setCategory('')
      setDescription('')
      setAmount(0)
      setTriedSave(false)
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  const categoryInvalid = triedSave && category.trim().length === 0
  const descriptionInvalid = triedSave && description.trim().length === 0

  function save(): void {
    setTriedSave(true)
    if (shiftId === null || category.trim().length === 0 || description.trim().length === 0 || amount <= 0) return
    onSave({
      shiftId,
      category: category.trim(),
      description: description.trim(),
      amountPiasters: amount,
      paymentMethod: paymentMethods.includes(method) ? method : 'cash',
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title={messages.treasury.addExpense} size="sm">
      <div className="flex flex-col gap-4">
        {errorText !== null && <Alert tone="error">{errorText}</Alert>}

        {shiftId === null ? (
          <Alert tone="info">{messages.treasury.noOpenShift}</Alert>
        ) : (
          <>
            <Field label={messages.treasury.category} htmlFor="expense-category" required error={categoryInvalid ? messages.treasury.categoryRequired : undefined}>
              <TextInput
                id="expense-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                maxLength={120}
                autoFocus
                error={categoryInvalid}
              />
            </Field>

            <Field label={messages.treasury.description} htmlFor="expense-description" required error={descriptionInvalid ? messages.treasury.descriptionRequired : undefined}>
              <TextInput
                id="expense-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={300}
                error={descriptionInvalid}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label={messages.treasury.amount} htmlFor="expense-amount">
                <MoneyInput id="expense-amount" value={amount} onChange={setAmount} digitStyle={digitStyle} />
              </Field>
              <Field label={messages.treasury.method} htmlFor="expense-method">
                <Select
                  id="expense-method"
                  value={method}
                  onChange={(value) => setMethod(value === 'card' ? 'card' : value === 'wallet' ? 'wallet' : 'cash')}
                  options={paymentMethods.map((entry) => ({ value: entry, label: messages.paymentMethods[entry] }))}
                />
              </Field>
            </div>

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
