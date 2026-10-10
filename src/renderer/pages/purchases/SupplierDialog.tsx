import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, Field, TextInput } from '../../components/ui'
import { messages } from '../../i18n'
import type { SupplierInput } from '../../../shared/ipc'
import type { SupplierRow } from '../../../shared/rows'

/**
 * The supplier form: one dialog for creating and editing. The page owns every
 * IPC call; this dialog owns the draft and reports the filled input.
 */
export type SupplierDialogProps = {
  open: boolean
  /** Null means "create"; a row means "edit this supplier". */
  supplier: SupplierRow | null
  saving: boolean
  /** Already-translated server error from the last save attempt. */
  errorText: string | null
  onClose: () => void
  onSave: (input: SupplierInput) => void
}

export function SupplierDialog({ open, supplier, saving, errorText, onClose, onSave }: SupplierDialogProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [triedSave, setTriedSave] = useState(false)

  // Opening reseeds the draft; typing never does.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    setTriedSave(false)
    setName(supplier?.name ?? '')
    setPhone(supplier?.phone ?? '')
    setAddress(supplier?.address ?? '')
  }, [open, supplier])
  /* eslint-enable react-hooks/set-state-in-effect */

  const nameInvalid = triedSave && name.trim().length === 0

  function save(): void {
    setTriedSave(true)
    if (name.trim().length === 0) return
    onSave({
      name: name.trim(),
      phone: phone.trim().length === 0 ? null : phone.trim(),
      address: address.trim().length === 0 ? null : address.trim(),
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={supplier === null ? messages.suppliers.addSupplier : messages.suppliers.editSupplier}
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

        <Field label={messages.suppliers.name} htmlFor="supplier-name" required error={nameInvalid ? messages.suppliers.nameRequired : undefined}>
          <TextInput
            id="supplier-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            autoFocus
            error={nameInvalid}
          />
        </Field>

        <Field label={messages.suppliers.phone} htmlFor="supplier-phone">
          <TextInput
            id="supplier-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={32}
            dir="ltr"
            className="numeric"
          />
        </Field>

        <Field label={messages.suppliers.address} htmlFor="supplier-address">
          <TextInput id="supplier-address" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} />
        </Field>
      </div>
    </Dialog>
  )
}
