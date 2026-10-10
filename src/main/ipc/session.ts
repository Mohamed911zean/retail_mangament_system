import type { CurrentUser, PublicUser } from '../../shared/ipc'
import { permissionsForRole, type Actor } from '../../shared/permissions'

/**
 * The session is the single source of truth for "who is acting". The renderer
 * never sends a user id or role: it logs in, and every later call is attributed
 * to the stored user. One shop = one PC = one cashier device, so a single slot
 * is enough; the class is still explicit so a future LAN mode can key by
 * connection instead of replacing globals.
 */
export class SessionStore {
  private current: { user: PublicUser; startedAt: number } | null = null

  start(user: PublicUser, startedAt: number): CurrentUser {
    this.current = { user, startedAt }
    return SessionStore.toCurrentUser(user)
  }

  end(): void {
    this.current = null
  }

  user(): PublicUser | null {
    return this.current?.user ?? null
  }

  currentUser(): CurrentUser | null {
    return this.current === null ? null : SessionStore.toCurrentUser(this.current.user)
  }

  /** The `Actor` handed to services; `null` when nobody is logged in. */
  actor(): Actor | null {
    const user = this.current?.user
    return user === undefined ? null : { userId: user.id, role: user.role }
  }

  static toCurrentUser(user: PublicUser): CurrentUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      permissions: permissionsForRole(user.role),
    }
  }
}
