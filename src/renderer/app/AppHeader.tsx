import { useState } from 'react'
import type { CurrentUser } from '../../shared/ipc'
import { Button, Dialog } from '../components/ui'
import { LogoutIcon, UserIcon } from '../components/icons'
import { messages } from '../i18n'

/**
 * Page header: the current page's title on the start side, the signed-in user on
 * the end side.
 *
 * Logging out is confirmed rather than immediate: a cashier with a half-filled
 * cart must not lose it to a mis-aimed click, and the session ends on the main
 * process so this is not something the renderer can undo.
 */
export type AppHeaderProps = {
  title: string
  description?: string
  user: CurrentUser
  onLogout: () => Promise<string | null>
}

export function AppHeader({ title, description, user, onLogout }: AppHeaderProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleLogout(): Promise<void> {
    setBusy(true)
    await onLogout()
    setBusy(false)
    setConfirming(false)
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6">
      <div className="min-w-0">
        <h1 className="truncate text-h2 font-semibold text-ink">{title}</h1>
        {description !== undefined && <p className="truncate text-sm text-secondary">{description}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5">
          <UserIcon size={20} className="text-muted" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-strong">{user.displayName}</p>
            <p className="text-caption text-muted">{messages.roles[user.role]}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setConfirming(true)}>
          <LogoutIcon size={16} />
          {messages.auth.logout}
        </Button>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={messages.auth.logout}
        description={messages.auth.logoutConfirm}
        dismissible={!busy}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              {messages.common.cancel}
            </Button>
            <Button onClick={() => void handleLogout()} loading={busy}>
              {messages.auth.logout}
            </Button>
          </>
        }
      />
    </header>
  )
}
