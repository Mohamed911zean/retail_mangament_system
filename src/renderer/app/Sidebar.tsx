import { cn } from '../lib/cn'
import { messages } from '../i18n'
import { ChevronStartIcon, MenuIcon } from '../components/icons'
import type { NavItem, NavKey } from './navigation'

/**
 * Sidebar (design system §4.6).
 *
 * Sits at the **start** side, which in RTL is the right edge — `flex` order does
 * that for free, and every offset uses a logical property so nothing is pinned to
 * a physical edge. Collapsed it keeps the icons and drops the labels: a cashier on
 * a 1280-wide screen still needs the whole cart visible.
 *
 * The items are passed in rather than derived here, so the shell can add the
 * dev-only gallery in a development build and the sidebar stays a pure view.
 */
export type SidebarProps = {
  items: readonly NavItem[]
  active: NavKey
  onNavigate: (key: NavKey) => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

export function Sidebar({ items, active, onNavigate, collapsed, onToggleCollapsed }: SidebarProps) {
  const width = collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)'

  return (
    <nav
      aria-label={messages.nav.menuLabel}
      style={{ width }}
      className="flex shrink-0 flex-col border-e border-line bg-surface"
    >
      <div className="flex h-16 items-center gap-2 border-b border-line px-4">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-700 text-base font-bold text-surface">
          {messages.nav.brandName.charAt(0)}
        </span>
        {!collapsed && <span className="truncate text-h3 font-semibold text-strong">{messages.nav.brandName}</span>}
      </div>

      <ul className="flex-1 overflow-y-auto py-2">
        {items.map((item) => {
          const isActive = item.key === active
          const Icon = item.icon
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onNavigate(item.key)}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                className={cn(
                  'relative flex h-11 w-full items-center gap-3 px-4 text-start text-base',
                  isActive ? 'bg-brand-50 font-semibold text-brand-700' : 'text-secondary hover:bg-panel hover:text-strong',
                )}
              >
                {/* Active marker: a 3px bar, not a gradient or a shadow (§4.6). */}
                {isActive && <span aria-hidden="true" className="absolute inset-y-1 start-0 w-[3px] rounded-e-sm bg-brand-700" />}
                <Icon size={20} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? messages.nav.expand : messages.nav.collapse}
        title={collapsed ? messages.nav.expand : messages.nav.collapse}
        className="flex h-11 items-center gap-3 border-t border-line px-4 text-secondary hover:bg-panel hover:text-strong"
      >
        {collapsed ? <MenuIcon size={20} className="shrink-0" /> : <ChevronStartIcon size={20} className="shrink-0" />}
        {!collapsed && <span>{messages.nav.collapse}</span>}
      </button>
    </nav>
  )
}
