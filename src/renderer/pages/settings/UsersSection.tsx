import { useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Select,
  Spinner,
  Table,
  TableEmpty,
  TD,
  TH,
  THead,
  TRow,
  TextInput,
  Toggle,
} from '../../components/ui'
import { UserIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { formatDateTime } from '../../lib/format'
import { errorKey, unwrap } from '../../lib/ipc'
import { useToast } from '../../lib/toast'
import type { CurrentUser, PublicUser, UserCreateInput } from '../../../shared/ipc'
import type { Role } from '../../../shared/permissions'

/**
 * The user list (AGENTS.md §10: users/roles/permissions).
 *
 * A manager cannot touch an owner and cannot mint one — the service refuses
 * both, and the role picker does not even offer the choice. Nobody can switch
 * off their own account from here: the button is replaced by the reason.
 */
export function UsersSection({ currentUser }: { currentUser: CurrentUser }) {
  const toast = useToast()
  const [users, setUsers] = useState<PublicUser[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const [editor, setEditor] = useState<PublicUser | 'create' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<PublicUser | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<PublicUser | null>(null)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const canAssignOwner = currentUser.role === 'owner'

  // The account list is IPC data the section cannot render without asking.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let alive = true
    setUsers(null)
    setFailed(false)
    void (async () => {
      try {
        const listed = await unwrap(window.api.users.list())
        if (alive) setUsers(listed)
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [reloadTick])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function refresh(): Promise<void> {
    setUsers(await unwrap(window.api.users.list()))
  }

  async function handleSave(input: UserCreateInput | { displayName: string; role: Role; isActive: boolean }): Promise<void> {
    setSaving(true)
    setFormError(null)
    try {
      if (editor === null || editor === 'create') {
        await unwrap(window.api.users.create(input as UserCreateInput))
      } else {
        const { displayName, role, isActive } = input as { displayName: string; role: Role; isActive: boolean }
        await unwrap(window.api.users.update(editor.id, { displayName, role, isActive }))
      }
      setEditor(null)
      toast({ message: messages.users.saved, kind: 'success' })
      await refresh()
    } catch (error) {
      setFormError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handlePassword(userId: string, password: string): Promise<void> {
    setSaving(true)
    setPasswordError(null)
    try {
      await unwrap(window.api.users.changePassword(userId, password))
      setPasswordTarget(null)
      toast({ message: messages.users.passwordChanged, kind: 'success' })
    } catch (error) {
      setPasswordError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(): Promise<void> {
    if (deactivateTarget === null) return
    setSaving(true)
    setDeactivateError(null)
    try {
      await unwrap(window.api.users.deactivate(deactivateTarget.id))
      setDeactivateTarget(null)
      toast({ message: messages.users.deactivated, kind: 'success' })
      await refresh()
    } catch (error) {
      setDeactivateError(translate(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  if (failed) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert tone="error">{messages.users.loadError}</Alert>
        <Button variant="outline" onClick={() => setReloadTick((tick) => tick + 1)}>
          {messages.common.retry}
        </Button>
      </div>
    )
  }

  if (users === null) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-h3 font-semibold text-ink">{messages.users.title}</h2>
        <Button
          variant="primary"
          onClick={() => {
            setFormError(null)
            setEditor('create')
          }}
        >
          {messages.users.addUser}
        </Button>
      </div>

      <Table>
        <THead>
          <TRow>
            <TH>{messages.users.username}</TH>
            <TH>{messages.users.displayName}</TH>
            <TH>{messages.users.role}</TH>
            <TH>{messages.users.lastLogin}</TH>
            <TH>{messages.users.actions}</TH>
          </TRow>
        </THead>
        <tbody>
          {users.length === 0 ? (
            <TableEmpty colSpan={5}>
              <EmptyState icon={<UserIcon size={24} />} title={messages.users.title} />
            </TableEmpty>
          ) : (
            users.map((entry) => {
              const isSelf = entry.id === currentUser.id
              return (
                <TRow key={entry.id}>
                  <TD>
                    <p className="numeric font-semibold text-strong">{entry.username}</p>
                  </TD>
                  <TD>{entry.displayName}</TD>
                  <TD>
                    <span className="inline-flex items-center gap-2">
                      <Badge tone={entry.role === 'owner' ? 'info' : entry.role === 'manager' ? 'neutral' : 'neutral'}>
                        {messages.roles[entry.role]}
                      </Badge>
                      {entry.isActive ? <Badge tone="success">{messages.users.active}</Badge> : <Badge tone="error">{messages.users.inactive}</Badge>}
                    </span>
                  </TD>
                  <TD numeric>{entry.lastLoginAt === null ? messages.users.never : formatDateTime(entry.lastLoginAt)}</TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setPasswordTarget(entry)}>
                        {messages.users.changePassword}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFormError(null)
                          setEditor(entry)
                        }}
                      >
                        {messages.users.edit}
                      </Button>
                      {isSelf ? (
                        <span className="px-2 text-sm text-muted" title={messages.users.deactivateSelf}>
                          {messages.users.deactivate}
                        </span>
                      ) : (
                        entry.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeactivateTarget(entry)
                              setDeactivateError(null)
                            }}
                          >
                            {messages.users.deactivate}
                          </Button>
                        )
                      )}
                    </div>
                  </TD>
                </TRow>
              )
            })
          )}
        </tbody>
      </Table>

      <UserFormDialog
        open={editor !== null}
        entry={editor === null || editor === 'create' ? null : editor}
        canAssignOwner={canAssignOwner}
        saving={saving}
        errorText={formError}
        onClose={() => setEditor(null)}
        onSave={(input) => void handleSave(input)}
      />

      <PasswordDialog
        open={passwordTarget !== null}
        username={passwordTarget?.username ?? ''}
        saving={saving}
        errorText={passwordError}
        onClose={() => setPasswordTarget(null)}
        onSave={(password) => {
          if (passwordTarget !== null) void handlePassword(passwordTarget.id, password)
        }}
      />

      <Dialog
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        title={messages.users.deactivateTitle}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeactivateTarget(null)}>
              {messages.common.no}
            </Button>
            <Button variant="danger" loading={saving} onClick={() => void handleDeactivate()}>
              {messages.common.yes}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {deactivateError !== null && <Alert tone="error">{deactivateError}</Alert>}
          <p className="text-base font-semibold text-strong">{deactivateTarget?.displayName}</p>
          <p className="text-sm text-secondary">{messages.users.deactivateBody}</p>
        </div>
      </Dialog>
    </section>
  )
}

function roleOptions(canAssignOwner: boolean): { value: Role; label: string }[] {
  const options: { value: Role; label: string }[] = [
    { value: 'cashier', label: messages.roles.cashier },
    { value: 'manager', label: messages.roles.manager },
  ]
  if (canAssignOwner) options.push({ value: 'owner', label: messages.roles.owner })
  return options
}

function UserFormDialog({
  open,
  entry,
  canAssignOwner,
  saving,
  errorText,
  onClose,
  onSave,
}: {
  open: boolean
  entry: PublicUser | null
  canAssignOwner: boolean
  saving: boolean
  errorText: string | null
  onClose: () => void
  onSave: (input: UserCreateInput | { displayName: string; role: Role; isActive: boolean }) => void
}) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<Role>('cashier')
  const [password, setPassword] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [triedSave, setTriedSave] = useState(false)

  // Opening reseeds the draft; typing never does.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    setTriedSave(false)
    setUsername(entry?.username ?? '')
    setDisplayName(entry?.displayName ?? '')
    setRole(entry?.role ?? 'cashier')
    setPassword('')
    setIsActive(entry?.isActive ?? true)
  }, [open, entry])
  /* eslint-enable react-hooks/set-state-in-effect */

  const usernameInvalid = triedSave && username.trim().length === 0
  const displayInvalid = triedSave && displayName.trim().length === 0
  const passwordInvalid = triedSave && entry === null && password.length < 4

  function save(): void {
    setTriedSave(true)
    if (username.trim().length === 0 || displayName.trim().length === 0) return
    const picked: Role = role === 'owner' && !canAssignOwner ? 'manager' : role
    if (entry === null) {
      if (password.length < 4) return
      onSave({ username: username.trim(), displayName: displayName.trim(), role: picked, password })
      return
    }
    onSave({ displayName: displayName.trim(), role: picked, isActive })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={entry === null ? messages.users.addUser : messages.users.editUser}
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

        <Field label={messages.users.username} htmlFor="user-username" required error={usernameInvalid ? messages.users.usernameRequired : undefined}>
          <TextInput
            id="user-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            maxLength={64}
            autoFocus
            disabled={entry !== null}
            dir="ltr"
            className="numeric"
            error={usernameInvalid}
          />
        </Field>

        <Field label={messages.users.displayName} htmlFor="user-display" required error={displayInvalid ? messages.users.displayNameRequired : undefined}>
          <TextInput
            id="user-display"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={128}
            error={displayInvalid}
          />
        </Field>

        <Field label={messages.users.role} htmlFor="user-role">
          <Select id="user-role" value={role} onChange={(value) => setRole(value === 'owner' ? 'owner' : value === 'manager' ? 'manager' : 'cashier')} options={roleOptions(canAssignOwner)} />
        </Field>

        {entry === null ? (
          <Field label={messages.users.password} htmlFor="user-password" required helper={messages.users.passwordMin} error={passwordInvalid ? messages.users.passwordMin : undefined}>
            <TextInput id="user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={200} autoComplete="new-password" error={passwordInvalid} />
          </Field>
        ) : (
          <Toggle id="user-active" checked={isActive} onChange={setIsActive} label={entry.isActive ? messages.users.active : messages.users.inactive} />
        )}
      </div>
    </Dialog>
  )
}

function PasswordDialog({
  open,
  username,
  saving,
  errorText,
  onClose,
  onSave,
}: {
  open: boolean
  username: string
  saving: boolean
  errorText: string | null
  onClose: () => void
  onSave: (password: string) => void
}) {
  const [password, setPassword] = useState('')
  const [triedSave, setTriedSave] = useState(false)

  // Opening starts from an empty password, never from the last one.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setPassword('')
      setTriedSave(false)
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  const passwordInvalid = triedSave && password.length < 4

  function save(): void {
    setTriedSave(true)
    if (password.length < 4) return
    onSave(password)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={messages.users.changePassword}
      description={username}
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
        <Field label={messages.users.newPassword} htmlFor="user-new-password" required helper={messages.users.passwordMin} error={passwordInvalid ? messages.users.passwordMin : undefined}>
          <TextInput
            id="user-new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={200}
            autoFocus
            autoComplete="new-password"
            error={passwordInvalid}
          />
        </Field>
      </div>
    </Dialog>
  )
}
