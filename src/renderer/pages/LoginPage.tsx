import { useState, type FormEvent } from 'react'
import type { SetupInput } from '../../shared/ipc'
import { Alert, Button, Field, TextInput } from '../components/ui'
import { LockIcon, UserIcon } from '../components/icons'
import { messages, translate } from '../i18n'

/** §4.2 / §3.3: passwords are ASCII, so this is a plain fixed threshold. */
const MIN_PASSWORD_LENGTH = 6

/** Keys produced by the form itself; they are shown under their own field. */
const LOCAL_VALIDATION = new Set([
  'auth.usernameRequired',
  'auth.passwordRequired',
  'auth.passwordShort',
  'auth.displayNameRequired',
])

export type LoginPageProps = {
  /** First run on this device: create the owner instead of signing in. */
  needsSetup: boolean
  onLogin: (username: string, password: string) => Promise<string | null>
  onSetup: (input: SetupInput) => Promise<string | null>
}

/**
 * Login and first-run setup share one screen because they are the same job for
 * the user: get into the app. Only the fields and the button label differ.
 *
 * Validation runs on submit, not on every keystroke (§4.2), and the messages say
 * what to do. The Arabic wording of a *server* error comes from the error code's
 * `messageKey`, so a wrong password is never re-invented here.
 */
export function LoginPage({ needsSetup, onLogin, onSetup }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setErrorKey(null)

    if (username.trim().length === 0) {
      setErrorKey('auth.usernameRequired')
      return
    }
    if (password.length === 0) {
      setErrorKey('auth.passwordRequired')
      return
    }
    if (needsSetup) {
      if (displayName.trim().length === 0) {
        setErrorKey('auth.displayNameRequired')
        return
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        setErrorKey('auth.passwordShort')
        return
      }
    }

    setBusy(true)
    const failure = needsSetup
      ? await onSetup({ username: username.trim(), displayName: displayName.trim(), password })
      : await onLogin(username.trim(), password)
    setBusy(false)

    // A failed login keeps the username so the cashier only retypes the password.
    if (failure !== null) setErrorKey(failure)
  }

  const isPasswordError = errorKey === 'auth.passwordRequired' || errorKey === 'auth.passwordShort'
  const showFormAlert = errorKey !== null && !LOCAL_VALIDATION.has(errorKey)

  return (
    <main className="flex h-full items-center justify-center bg-app p-6">      <section className="w-full max-w-[420px] rounded-xl border border-line bg-surface p-6">
        <header className="mb-6 flex items-center gap-3">
          <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-700 text-surface">
            <UserIcon size={24} />
          </span>
          <div>
            <h1 className="text-h2 font-semibold text-ink">{needsSetup ? messages.auth.setupTitle : messages.auth.loginTitle}</h1>
            <p className="text-sm text-secondary">{needsSetup ? messages.auth.setupSubtitle : messages.auth.loginSubtitle}</p>
          </div>
        </header>

        <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <Field label={messages.auth.username} htmlFor="login-username" required>
            <TextInput
              id="login-username"
              name="username"
              value={username}
              autoFocus={!needsSetup}
              autoComplete="username"
              dir="ltr"
              error={errorKey === 'auth.usernameRequired'}
              onChange={(event) => setUsername(event.target.value)}
            />
          </Field>

          {needsSetup && (
            <Field label={messages.auth.displayName} htmlFor="login-display-name" required>
              <TextInput
                id="login-display-name"
                value={displayName}
                autoFocus
                error={errorKey === 'auth.displayNameRequired'}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>
          )}

          <Field
            label={messages.auth.password}
            htmlFor="login-password"
            required
            helper={needsSetup ? messages.auth.passwordHint : undefined}
            error={isPasswordError ? translate(errorKey) : undefined}
          >
            <TextInput
              id="login-password"
              name="password"
              type="password"
              value={password}
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              dir="ltr"
              error={errorKey === 'auth.passwordRequired' || errorKey === 'auth.passwordShort'}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {/* Errors from the main process (wrong password, blocked account) land
              here — one alert, whatever the code, so no screen invents wording. */}
          {showFormAlert && (
            <Alert tone="error">
              <span className="flex items-center gap-2">
                <LockIcon size={16} />
                {translate(errorKey)}
              </span>
            </Alert>
          )}

          <Button type="submit" size="lg" block loading={busy}>
            {busy ? (needsSetup ? messages.auth.settingUp : messages.auth.loggingIn) : needsSetup ? messages.auth.setup : messages.auth.login}
          </Button>
        </form>
      </section>
    </main>
  )
}
