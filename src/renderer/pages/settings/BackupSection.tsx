import { useEffect, useState } from 'react'
import type { BackupInfo } from '../../../shared/backup'
import { Alert, Button, Dialog, EmptyState, Table, TD, TH, THead, TRow, TableEmpty } from '../../components/ui'
import { ReceiptIcon } from '../../components/icons'
import { messages, translate } from '../../i18n'
import { formatBytes, formatDateTime } from '../../lib/format'
import { errorKey, unwrap } from '../../lib/ipc'

type Status = { kind: 'info' | 'success' | 'warning' | 'error'; text: string }

/**
 * Backup list, create and restore (AGENTS.md §9).
 *
 * Restoring replaces the database, so it is behind a confirmation dialog that
 * names the file being restored — and it is refused outright in read-only mode,
 * because it is the one operation that could undo a licence problem by accident.
 */
export function BackupSection({ readOnly }: { readOnly: boolean }) {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [selected, setSelected] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'info', text: messages.backup.loading })
  const [busy, setBusy] = useState<'create' | 'restore' | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const available = await unwrap(window.api.backup.list())
        if (!alive) return
        setBackups(available)
        setSelected(available[0]?.fileName ?? '')
        setStatus(
          available.length > 0 ? { kind: 'info', text: messages.backup.ready } : { kind: 'warning', text: messages.backup.none },
        )
      } catch (error) {
        if (!alive) return
        setStatus({ kind: 'error', text: translate(errorKey(error)) })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  async function handleCreate(): Promise<void> {
    setBusy('create')
    setStatus({ kind: 'info', text: messages.backup.creating })
    try {
      const backup = await unwrap(window.api.backup.create())
      setBackups((current) => [backup, ...current])
      setSelected(backup.fileName)
      setStatus({ kind: 'success', text: messages.backup.created })
    } catch (error) {
      setStatus({ kind: 'error', text: translate(errorKey(error)) })
    } finally {
      setBusy(null)
    }
  }

  async function handleRestore(): Promise<void> {
    setBusy('restore')
    setStatus({ kind: 'info', text: messages.backup.restoring })
    try {
      const available = await unwrap(window.api.backup.restore(selected))
      setBackups(available)
      setSelected(available[0]?.fileName ?? '')
      setStatus({ kind: 'success', text: messages.backup.restored })
    } catch (error) {
      setStatus({ kind: 'error', text: translate(errorKey(error)) })
    } finally {
      setBusy(null)
      setConfirming(false)
    }
  }

  const disabled = readOnly || busy !== null

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-h3 font-semibold text-ink">{messages.backup.title}</h2>

      {readOnly && <Alert tone="warning">{messages.app.readOnly}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void handleCreate()} loading={busy === 'create'} disabled={disabled}>
          {messages.backup.createButton}
        </Button>
        <Button onClick={() => setConfirming(true)} disabled={disabled || selected === ''}>
          {messages.backup.restoreButton}
        </Button>
      </div>

      <Table>
        <THead>
          <TRow>
            <TH>{messages.backup.columnFile}</TH>
            <TH numeric>{messages.backup.columnDate}</TH>
            <TH numeric>{messages.backup.columnSize}</TH>
          </TRow>
        </THead>
        <tbody>
          {backups.length === 0 ? (
            <TableEmpty colSpan={3}>
              <EmptyState icon={<ReceiptIcon size={24} />} title={messages.backup.none} />
            </TableEmpty>
          ) : (
            backups.map((backup) => (
              <TRow key={backup.fileName} selected={backup.fileName === selected} onClick={() => setSelected(backup.fileName)}>
                <TD>
                  <bdi>{backup.fileName}</bdi>
                </TD>
                <TD numeric>{formatDateTime(backup.createdAt)}</TD>
                <TD numeric>{formatBytes(backup.sizeBytes)}</TD>
              </TRow>
            ))
          )}
        </tbody>
      </Table>

      <Alert tone={status.kind}>{status.text}</Alert>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={messages.backup.restoreButton}
        description={messages.backup.confirm}
        dismissible={busy === null}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy !== null}>
              {messages.common.cancel}
            </Button>
            <Button variant="danger" onClick={() => void handleRestore()} loading={busy === 'restore'}>
              {messages.backup.restoreButton}
            </Button>
          </>
        }
      >
        <p className="numeric text-base text-ink">
          <bdi>{selected}</bdi>
        </p>
      </Dialog>
    </section>
  )
}
