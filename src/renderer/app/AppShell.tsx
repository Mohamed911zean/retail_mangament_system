import { Suspense, lazy, useEffect, useState } from 'react'
import type { LicenseStatus } from '../../shared/license/api'
import type { CurrentUser } from '../../shared/ipc'
import { Alert, Spinner } from '../components/ui'
import { messages } from '../i18n'
import { applyPreferences, readPreferences, writePreferences, type Preferences } from '../lib/preferences'
import { defaultNavKey, navItemsForRole, type NavKey } from './navigation'
import { Sidebar } from './Sidebar'
import { AppHeader } from './AppHeader'
import { HomePage } from '../pages/HomePage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { SettingsPage } from '../pages/SettingsPage'
import { PosPage } from '../pages/pos/PosPage'

/**
 * The dev gallery is a separate chunk that only exists in a development build:
 * `import.meta.env.DEV` is a literal `false` in production, so the ternary and
 * the `import()` inside it are dropped by the bundler and the chunk is never
 * emitted (design system §10).
 */
const DevGallery = import.meta.env.DEV ? lazy(() => import('../pages/DesignSystemPage')) : null

/** The page title and subtitle shown in the header, per navigation key. */
const PAGE_HEADINGS: Record<NavKey, { title: string; description?: string }> = {
  home: { title: messages.pages.homeTitle, description: messages.pages.homeSubtitle },
  pos: { title: messages.pages.posTitle },
  inventory: { title: messages.nav.inventory },
  purchases: { title: messages.nav.purchases },
  sales: { title: messages.nav.sales },
  customers: { title: messages.nav.customers },
  suppliers: { title: messages.nav.suppliers },
  reports: { title: messages.nav.reports },
  settings: { title: messages.pages.settingsTitle, description: messages.pages.settingsSubtitle },
  'design-system': { title: messages.nav.designSystem },
}

export type AppShellProps = {
  user: CurrentUser
  onLogout: () => Promise<string | null>
  licenseStatus: LicenseStatus | null
  readOnly: boolean
  onActivateLicense: (key: string) => Promise<string | null>
}

/**
 * The signed-in shell: sidebar, header, page area.
 *
 * Navigation is a single `useState` rather than a router — one window, one user,
 * no URLs to preserve, and a router would be a dependency on a 2 GB-RAM target
 * for nothing. The active page is derived from data (`NAV_ITEMS`), so a screen
 * cannot be reachable in the sidebar but missing from the switch.
 */
export function AppShell({ user, onLogout, licenseStatus, readOnly, onActivateLicense }: AppShellProps) {
  const [active, setActive] = useState<NavKey>(() => defaultNavKey(user.role))
  const [collapsed, setCollapsed] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>(() => readPreferences())

  useEffect(() => {
    applyPreferences(preferences)
    writePreferences(preferences)
  }, [preferences])

  const items = navItemsForRole(user.role, { includeDev: import.meta.env.DEV })
  const heading = PAGE_HEADINGS[active]

  function renderPage() {
    switch (active) {
      case 'home':
        return <HomePage user={user} onNavigate={setActive} />
      case 'settings':
        return (
          <SettingsPage
            preferences={preferences}
            onPreferencesChange={setPreferences}
            licenseStatus={licenseStatus}
            readOnly={readOnly}
            onActivateLicense={onActivateLicense}
          />
        )
      case 'pos':
        return <PosPage user={user} preferences={preferences} />
      case 'design-system':
        return DevGallery === null ? (
          <PlaceholderPage />
        ) : (
          <Suspense fallback={<Spinner />}>
            <DevGallery />
          </Suspense>
        )
      default:
        return <PlaceholderPage />
    }
  }

  return (
    <div className="flex h-full bg-app">
      <Sidebar
        items={items}
        active={active}
        onNavigate={setActive}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader title={heading.title} description={heading.description} user={user} onLogout={onLogout} />

        {/* Read-only mode is a standing condition, not an event: it stays on
            screen (never a toast) until the licence is activated. */}
        {readOnly && (
          <div className="border-b border-line bg-surface px-6 py-3">
            <Alert tone="warning">{messages.pages.readOnlyBanner}</Alert>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6">{renderPage()}</main>
      </div>
    </div>
  )
}
