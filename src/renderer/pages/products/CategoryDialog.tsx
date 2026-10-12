import { useEffect, useState } from 'react'
import { Alert, Button, Dialog, Field, TextInput } from '../../components/ui'
import { TrashIcon } from '../../components/icons'
import { messages } from '../../i18n'
import type { CategoryRow } from '../../../shared/rows'

/**
 * The category manager: add, rename and soft-delete product categories.
 *
 * Deleting a category never touches its products — they stay on the shelf with
 * "no category", which the service guarantees by soft-deleting only the row.
 * A removal still asks first, with an inline yes/no on the row itself rather
 * than a second stacked dialog.
 */
export type CategoryDialogProps = {
  open: boolean
  categories: readonly CategoryRow[]
  saving: boolean
  /** Already-translated server error from the last attempt. */
  errorText: string | null
  onClose: () => void
  onCreate: (name: string) => void
  onRename: (categoryId: string, name: string) => void
  onDelete: (categoryId: string) => void
}

export function CategoryDialog({ open, categories, saving, errorText, onClose, onCreate, onRename, onDelete }: CategoryDialogProps) {
  const [name, setName] = useState('')
  const [triedAdd, setTriedAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // A fresh dialog starts from an empty name field, never from the last one.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setName('')
      setTriedAdd(false)
      setEditingId(null)
      setEditingName('')
      setConfirmId(null)
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  const nameInvalid = triedAdd && name.trim().length === 0

  function add(): void {
    setTriedAdd(true)
    if (name.trim().length === 0) return
    onCreate(name.trim())
    setName('')
    setTriedAdd(false)
  }

  function rename(): void {
    if (editingId === null || editingName.trim().length === 0) return
    onRename(editingId, editingName.trim())
    setEditingId(null)
    setEditingName('')
  }

  return (
    <Dialog open={open} onClose={onClose} title={messages.products.categoriesTitle} size="sm">
      <div className="flex flex-col gap-4">
        {errorText !== null && <Alert tone="error">{errorText}</Alert>}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label={messages.products.categoryName} htmlFor="category-name" error={nameInvalid ? messages.products.categoryNameRequired : undefined}>
              <TextInput
                id="category-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') add()
                }}
                maxLength={120}
                error={nameInvalid}
              />
            </Field>
          </div>
          <div className="pb-1">
            <Button variant="primary" loading={saving} onClick={add}>
              {messages.products.addCategory}
            </Button>
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {categories.map((category) =>
            editingId === category.id ? (
              <li key={category.id} className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label={messages.products.categoryName} htmlFor={`category-rename-${category.id}`}>
                    <TextInput
                      id={`category-rename-${category.id}`}
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') rename()
                      }}
                      maxLength={120}
                      autoFocus
                    />
                  </Field>
                </div>
                <div className="flex shrink-0 items-center gap-2 pb-1">
                  <Button variant="primary" size="sm" disabled={editingName.trim().length === 0} onClick={rename}>
                    {messages.common.save}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    {messages.common.cancel}
                  </Button>
                </div>
              </li>
            ) : (
              <li key={category.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                <span className="min-w-0 truncate text-base text-strong" title={category.name}>{category.name}</span>
                {confirmId === category.id ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setConfirmId(null)
                        onDelete(category.id)
                      }}
                    >
                      {messages.common.yes}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                      {messages.common.no}
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(category.id)
                        setEditingName(category.name)
                        setConfirmId(null)
                      }}
                    >
                      {messages.products.renameCategory}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${messages.products.deleteCategory}: ${category.name}`}
                      onClick={() => setConfirmId(category.id)}
                    >
                      <TrashIcon size={16} />
                    </Button>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      </div>
    </Dialog>
  )
}
