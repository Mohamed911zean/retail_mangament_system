import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, defaultNavKey, navItemsForRole } from './navigation'

describe('navItemsForRole', () => {
  it('shows every non-restricted page to an owner', () => {
    const keys = navItemsForRole('owner').map((item) => item.key)
    expect(keys).toContain('home')
    expect(keys).toContain('settings')
  })

  it('hides Settings from a cashier', () => {
    // Cashiers sell; they do not change feature flags or restore backups.
    expect(navItemsForRole('cashier').map((item) => item.key)).not.toContain('settings')
  })

  it('shows Settings to a manager', () => {
    expect(navItemsForRole('manager').map((item) => item.key)).toContain('settings')
  })

  it('hides the dev gallery unless a dev build asks for it', () => {
    expect(navItemsForRole('owner').map((item) => item.key)).not.toContain('design-system')
    expect(navItemsForRole('owner', { includeDev: true }).map((item) => item.key)).toContain('design-system')
  })

  it('never returns an empty list for a known role', () => {
    for (const role of ['owner', 'manager', 'cashier'] as const) {
      expect(navItemsForRole(role).length).toBeGreaterThan(0)
    }
  })
})

describe('defaultNavKey', () => {
  it('lands on Home for every role', () => {
    expect(defaultNavKey('owner')).toBe('home')
    expect(defaultNavKey('cashier')).toBe('home')
  })
})

describe('NAV_ITEMS', () => {
  it('has no duplicate keys', () => {
    const keys = NAV_ITEMS.map((item) => item.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives every item an Arabic label from the message file', () => {
    for (const item of NAV_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.label).toMatch(/[؀-ۿ]/u)
    }
  })
})
