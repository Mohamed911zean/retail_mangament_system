import { describe, expect, it } from 'vitest'
import { SessionStore } from './session'
import { allPermissions } from '../../shared/permissions'
import type { PublicUser } from '../../shared/ipc'

function user(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: 'u1',
    username: 'cashier1',
    displayName: 'Cashier One',
    role: 'cashier',
    isActive: true,
    lastLoginAt: null,
    ...overrides,
  }
}

describe('SessionStore', () => {
  it('starts empty: no user, no actor, and `currentUser` is null', () => {
    const session = new SessionStore()
    expect(session.user()).toBeNull()
    expect(session.actor()).toBeNull()
    expect(session.currentUser()).toBeNull()
  })

  it('exposes the actor derived from the stored user', () => {
    const session = new SessionStore()
    session.start(user({ id: 'u9', role: 'owner' }), 1700000000000)
    expect(session.actor()).toEqual({ userId: 'u9', role: 'owner' })
  })

  it('never leaks the password hash or inactivity flag into `currentUser`', () => {
    const session = new SessionStore()
    const current = session.start(user(), 1700000000000)
    expect(Object.keys(current).sort()).toEqual(['displayName', 'id', 'permissions', 'role', 'username'])
  })

  it('grants the owner every permission and the cashier none of them', () => {
    const session = new SessionStore()
    expect(session.start(user({ role: 'owner' }), 1).permissions).toEqual(allPermissions)
    expect(session.start(user({ role: 'cashier' }), 1).permissions).toEqual([])
  })

  it('replaces the previous user on a second login', () => {
    const session = new SessionStore()
    session.start(user({ id: 'u1', role: 'cashier' }), 1)
    session.start(user({ id: 'u2', role: 'manager' }), 2)
    expect(session.actor()).toEqual({ userId: 'u2', role: 'manager' })
  })

  it('clears everything on end()', () => {
    const session = new SessionStore()
    session.start(user(), 1)
    session.end()
    expect(session.user()).toBeNull()
    expect(session.actor()).toBeNull()
  })

  it('builds a fresh CurrentUser per call instead of handing out shared state', () => {
    const session = new SessionStore()
    session.start(user(), 1)
    const first = session.currentUser()
    const second = session.currentUser()
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
  })
})
