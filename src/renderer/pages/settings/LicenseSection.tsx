import { useState } from 'react'
import type { LicenseStatus } from '../../../shared/license/api'
import { Alert, Button, Field, TextInput } from '../../components/ui'
import { messages, translate } from '../../i18n'
import { formatDateTime } from '../../lib/format'
import { useToast } from '../../lib/toast'

/** Licence `state` (kebab-case) → the Arabic sentence the shop owner reads. */
const STATE_MESSAGES: Record<LicenseStatus['state'], string> = {
  active: messages.license.active,
  unlicensed: messages.license.unlicensed,
  expired: messages.license.expired,
  invalid: messages.license.invalid,
  'machine-mismatch': messages.license.machineMismatch,
  'fingerprint-unavailable': messages.license.fingerprintUnavailable,
  'clock-rollback': messages.license.clockRollback,
  'storage-error': messages.license.storageError,
}

/**
 * Licence panel (AGENTS.md §8). The machine code is what the client sends to the
 * developer; the key that comes back is pasted here and verified **in the main
 * process** — this screen only displays the answer, it never decides it.
 *
 * Copying the machine code is a toast: it confirms an action that cannot fail
 * silently. Activating a key is not: if it fails, the reason stays on screen.
 */
export function LicenseSection({
  status,
  onActivate,
}: {
  status: LicenseStatus | null
  onActivate: (key: string) => Promise<string | null>
}) {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const active = status?.mode === 'active'

  async function handleActivate(): Promise<void> {
    if (key.trim().length === 0) return
    setBusy(true)
    setError(null)
    const failure = await onActivate(key.trim())
    setBusy(false)
    if (failure === null) {
      setKey('')
      toast({ kind: 'success', message: messages.license.active })
    } else {
      setError(failure)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-h3 font-semibold text-ink">{messages.license.title}</h2>

      <Alert tone={active ? 'success' : 'warning'}>{status === null ? messages.license.loading : STATE_MESSAGES[status.state]}</Alert>

      <div className="flex flex-col gap-2">
        <label htmlFor="license-machine-code" className="text-sm font-semibold text-strong">
          {messages.license.machineCode}
        </label>
        <div className="flex max-w-[520px] gap-2">
          <TextInput id="license-machine-code" readOnly value={status?.machineCode ?? ''} dir="ltr" className="numeric" />
          <Button
            variant="outline"
            disabled={status === null || status.machineCode === ''}
            onClick={() => {
              if (status === null) return
              void navigator.clipboard
                .writeText(status.machineCode)
                .then(() => toast({ kind: 'success', message: messages.license.copied }))
                // A denied clipboard is not worth an error banner: the code is
                // on screen and can be written down by hand.
                .catch(() => undefined)
            }}
          >
            {messages.license.copy}
          </Button>
        </div>
        <p className="text-sm text-muted">
          {messages.license.checksum}: <span className="numeric">{status?.machineChecksum ?? messages.common.emptyValue}</span>
        </p>
      </div>

      <Field
        label={messages.license.keyLabel}
        htmlFor="license-key"
        error={error === null ? undefined : translate(error)}
      >
        <textarea
          id="license-key"
          rows={3}
          value={key}
          dir="ltr"
          placeholder={messages.license.keyPlaceholder}
          onChange={(event) => setKey(event.target.value)}
          className="w-full rounded-md border border-line-control bg-surface p-3 font-mono text-sm text-ink placeholder:text-muted"
        />
      </Field>

      <div>
        <Button onClick={() => void handleActivate()} loading={busy} disabled={key.trim().length === 0}>
          {messages.license.activate}
        </Button>
      </div>

      {status !== null && (status.client !== undefined || status.kid !== undefined || status.expiresAt !== undefined) && (
        <dl className="grid max-w-[520px] grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {status.client !== undefined && (
            <>
              <dt className="text-secondary">{messages.license.client}</dt>
              <dd className="text-ink">{status.client}</dd>
            </>
          )}
          {status.expiresAt !== undefined && (
            <>
              <dt className="text-secondary">{messages.license.expires}</dt>
              <dd className="numeric text-ink">{formatDateTime(status.expiresAt)}</dd>
            </>
          )}
          {status.kid !== undefined && (
            <>
              <dt className="text-secondary">{messages.license.kid}</dt>
              <dd className="numeric text-ink">{status.kid}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  )
}
