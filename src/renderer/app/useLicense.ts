import { useCallback, useEffect, useRef, useState } from 'react'
import type { LicenseStatus } from '../../shared/license/api'
import { errorKey, unwrap } from '../lib/ipc'

/** Re-check the licence every minute, like the main process does (§8). */
const POLL_INTERVAL_MS = 60_000

export type LicenseState = {
  status: LicenseStatus | null
  /** True while the first status is still on its way. */
  loading: boolean
  /** i18n key when the status could not be read at all. */
  error: string | null
  /** The app may look at data but must not write (licence missing/expired). */
  readOnly: boolean
}

/**
 * Licence state for the whole app.
 *
 * It is fetched **once** in the shell and passed down, rather than asked for by
 * every screen: two screens must never disagree about whether the app is in
 * read-only mode. The main process is still the one that refuses a write, so a
 * stale value here can hide a button but cannot let a change through.
 */
export function useLicense() {
  const [state, setState] = useState<LicenseState>({ status: null, loading: true, error: null, readOnly: false })
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const status = await unwrap(window.api.license.getStatus())
      if (!alive.current) return
      setState({ status, loading: false, error: null, readOnly: status.mode !== 'active' })
    } catch (error) {
      if (!alive.current) return
      setState((current) => ({ ...current, loading: false, error: errorKey(error) }))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  const activate = useCallback(async (key: string): Promise<string | null> => {
    try {
      const status = await unwrap(window.api.license.activate(key))
      setState({ status, loading: false, error: null, readOnly: status.mode !== 'active' })
      return null
    } catch (error) {
      return errorKey(error)
    }
  }, [])

  return { ...state, refresh, activate }
}
