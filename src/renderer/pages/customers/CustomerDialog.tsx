import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, Field, MoneyInput, Select, TextInput } from '../../components/ui'
import { messages } from '../../i18n'
import type { DigitStyle } from '../../lib/format'
import type { CustomerInput, CustomerSummary } from '../../../shared/ipc'

/**
 * The customer form: one dialog for creating and editing. The page owns every
 * IPC call; this dialog owns the draft and reports the filled input.
 *
 * The credit limit is tri-state, exactly like the schema stores it: unlimited
 * (`null`), no credit at all (`0`), or a custom positive amount. The three are
 * never collapsed — a shop that confuses "no limit" with "no credit" loses
 * money either way.
 */
export type CustomerDialogProps = {
  open: boolean
  /** Null means "create"; a summary means "edit this customer". */
  customer: CustomerSummary | null
  digitStyle: DigitStyle
  saving: boolean
  /** Already-translated server error from the last save attempt. */
  errorText: string | null
  onClose: () => void
  onSave: (input: CustomerInput) => void
}

type LimitMode = 'unlimited' | 'none' | 'custom'

export function CustomerDialog({ open, customer, digitStyle, saving, errorText, onClose, onSave }: CustomerDialogProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [limitMode, setLimitMode] = useState<LimitMode>('unlimited')
  const [limitAmount, setLimitAmount] = useState(0)
  const [triedSave, setTriedSave] = useState(false)

  // Opening reseeds the draft; typing never does.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    setTriedSave(false)
    setName(customer?.name ?? '')
    setPhone(customer?.phone ?? '')
    setAddress(customer?.address ?? '')
    const limit = customer?.creditLimitPiasters ?? null
    setLimitMode(limit === null ? 'unlimited' : limit === 0 ? 'none' : 'custom')
    setLimitAmount(typeof limit === 'number' && limit > 0 ? limit : 0)
  }, [open, customer])
  /* eslint-enable react-hooks/set-state-in-effect */

  const nameInvalid = triedSave && name.trim().length === 0

  function save(): void {
    setTriedSave(true)
    if (name.trim().length === 0) return
    onSave({
      name: name.trim(),
      phone: phone.trim().length === 0 ? null : phone.trim(),
      address: address.trim().length === 0 ? null : address.trim(),
      creditLimitPiasters: limitMode === 'unlimited' ? null : limitMode === 'none' ? 0 : limitAmount,
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={customer === null ? messages.customers.addCustomer : messages.customers.editCustomer}
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

        <Field label={messages.customers.name} htmlFor="customer-name" required error={nameInvalid ? messages.customers.nameRequired : undefined}>
          <TextInput
            id="customer-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            autoFocus
            error={nameInvalid}
          />
        </Field>

        <Field label={messages.customers.phone} htmlFor="customer-phone">
          <TextInput
            id="customer-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={32}
            dir="ltr"
            className="numeric"
          />
        </Field>

        <Field label={messages.customers.address} htmlFor="customer-address">
          <TextInput id="customer-address" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} />
        </Field>

        <Field label={messages.customers.creditLimit} htmlFor="customer-limit-mode">
          <Select
            id="customer-limit-mode"
            value={limitMode}
            onChange={(value) => setLimitMode(value === 'none' ? 'none' : value === 'custom' ? 'custom' : 'unlimited')}
            options={[
              { value: 'unlimited', label: messages.customers.limitUnlimited },
              { value: 'none', label: messages.customers.limitNone },
              { value: 'custom', label: messages.customers.limitCustom },
            ]}
          />
        </Field>

        {limitMode === 'custom' && (
          <Field label={messages.customers.limitCustom} htmlFor="customer-limit-amount">
            <MoneyInput id="customer-limit-amount" value={limitAmount} onChange={setLimitAmount} digitStyle={digitStyle} />
          </Field>
        )}
      </div>
    </Dialog>
  )
}
