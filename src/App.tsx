import { Alert, Button, Spinner, ToastProvider } from './renderer/components/ui'
import { AppShell } from './renderer/app/AppShell'
import { useAuth } from './renderer/app/useAuth'
import { useLicense } from './renderer/app/useLicense'
import { messages, translate } from './renderer/i18n'
import { LoginPage } from './renderer/pages/LoginPage'

/**
 * App root: providers, then the two screens that can exist before anyone is
 * signed in — a boot spinner and the login/first-run form.
 *
 * The signed-in shell is only mounted with a real `CurrentUser` from the main
 * process, so no screen can render a half-authenticated state. Both hooks live
 * here (not per page) because the licence governs the whole app and the user is
 * needed by the header and the navigation together.
 */
export default function App() {
  return (
    <ToastProvider>
      <AppRoot />
    </ToastProvider>
  )
}

function AppRoot() {
  const auth = useAuth()
  const license = useLicense()

  if (auth.loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-app">
        <Spinner size={24} />
        <p className="text-base text-secondary">{messages.common.loading}</p>
      </div>
    )
  }

  if (auth.user === null) {
    // `error` is set when the main process could not be reached at all — a
    // different problem from "not signed in", and one the user can act on.
    if (auth.error !== null) {
      return (
        <div className="flex h-full items-center justify-center bg-app p-6">
          <div className="w-full max-w-[480px]">
            <Alert tone="error">{translate(auth.error)}</Alert>
            <div className="mt-4">
              <Button onClick={() => void auth.refresh()}>{messages.common.retry}</Button>
            </div>
          </div>
        </div>
      )
    }

    return <LoginPage needsSetup={auth.needsSetup} onLogin={auth.login} onSetup={auth.setup} />
  }

  return (
    <AppShell
      user={auth.user}
      onLogout={auth.logout}
      licenseStatus={license.status}
      readOnly={license.readOnly}
      onActivateLicense={license.activate}
    />
  )
}
