import { useEffect, useState } from 'react'
import type { AppInfo, CurrentUser } from '../../shared/ipc'
import { Badge, Card } from '../components/ui'
import { messages } from '../i18n'
import { unwrap } from '../lib/ipc'
import { navItemsForRole, type NavKey } from '../app/navigation'

/**
 * Home: who is signed in, and the fastest way into any screen the role can use.
 *
 * The tiles are generated from the same navigation data the sidebar uses, so a
 * page can never be reachable from one place and missing from the other.
 */
export function HomePage({ user, onNavigate }: { user: CurrentUser; onNavigate: (key: NavKey) => void }) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const current = await unwrap(window.api.app.getInfo())
        if (alive) setInfo(current)
      } catch {
        // Not fatal — the tiles still work. The version line just stays blank.
        if (alive) setFailed(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-h2 font-semibold text-ink">
          {messages.pages.greeting}، {user.displayName}
        </h2>
        <p className="mt-1 text-base text-secondary">{messages.pages.homeSubtitle}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="info">{messages.roles[user.role]}</Badge>
          {info !== null && (
            <>
              <Badge tone="neutral">
                {messages.pages.version}: <span className="numeric">{info.version}</span>
              </Badge>
              <Badge tone="neutral">
                {messages.pages.device}: <bdi className="numeric">{info.deviceId}</bdi>
              </Badge>
            </>
          )}
        </div>
        {failed && <p className="mt-3 text-sm text-error-ink">{messages.pages.loadError}</p>}
      </Card>

      <section>
        <h3 className="mb-3 text-h3 font-semibold text-ink">{messages.pages.quickActions}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {navItemsForRole(user.role)
            .filter((item) => item.key !== 'home')
            .map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  className="flex min-h-22 flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface p-4 text-base text-strong hover:bg-brand-50"
                >
                  <Icon size={24} className="text-brand-700" />
                  <span>{item.label}</span>
                  {!item.built && <span className="text-caption text-muted">{messages.nav.comingSoon}</span>}
                </button>
              )
            })}
        </div>
      </section>
    </div>
  )
}
