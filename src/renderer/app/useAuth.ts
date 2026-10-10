import { useCallback, useEffect, useRef, useState } from 'react'
import type { CurrentUser, SetupInput } from '../../shared/ipc'
import { errorKey, unwrap } from '../lib/ipc'

/**
 * Who is signed in, and the three auth actions. The session itself lives in the
 * main process; this hook only mirrors it, so a reload can never "invent" a user.
 *
 * Errors are returned as i18n keys, not thrown: the login screen shows them next
 * to the form, and a failed login is an ordinary case, not an exception.
 */
export type AuthState = {
  loading: boolean
  user: CurrentUser | null
  needsSetup: boolean
  /** Set when the app could not even ask who is signed in. */
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, needsSetup: false, error: null })
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const status = await unwrap(window.api.auth.current())
      if (!alive.current) return
      setState({ loading: false, user: status.user, needsSetup: status.needsSetup, error: null })
    } catch (error) {
      if (!alive.current) return
      // The app must not dead-end here: it shows the reason and lets the user retry.
      setState({ loading: false, user: null, needsSetup: false, error: errorKey(error) })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(
    async (username: string, password: string): Promise<string | null> => {
      try {
        const user = await unwrap(window.api.auth.login(username, password))
        setState({ loading: false, user, needsSetup: false, error: null })
        return null
      } catch (error) {
        return errorKey(error)
      }
    },
    [],
  )

  const setup = useCallback(async (input: SetupInput): Promise<string | null> => {
    try {
      const user = await unwrap(window.api.auth.setup(input))
      setState({ loading: false, user, needsSetup: false, error: null })
      return null
    } catch (error) {
      return errorKey(error)
    }
  }, [])

  const logout = useCallback(async (): Promise<string | null> => {
    try {
      await unwrap(window.api.auth.logout())
      setState({ loading: false, user: null, needsSetup: false, error: null })
      return null
    } catch (error) {
      return errorKey(error)
    }
  }, [])

  return { ...state, refresh, login, setup, logout }
}
