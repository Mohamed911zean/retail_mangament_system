import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { DatabaseHandle } from '../database/repositories/common'
import { runInTransaction } from '../database/repositories/common'
import { getUser, getUserByUsername, insertUser, listUsers, updateUser, deactivateUser } from '../database/repositories/users'
import type { UserRow } from '../database/rows'
import type { Clock } from './clock'
import type { FaultInjector } from './fault-injector'
import { noFaults } from './fault-injector'
import type { IdGenerator } from './ids'
import { createUlidGenerator } from './ids'
import type { Actor } from './permissions'
import { serviceErr, serviceOk, type ServiceResult } from './result'
import { writeAudit } from './audit'

export type PublicUser = {
  id: string
  username: string
  displayName: string
  role: 'owner' | 'manager' | 'cashier'
  isActive: boolean
  lastLoginAt: number | null
}

export type LoginResult = {
  user: PublicUser
  sessionToken: string
}

type UserDependencies = {
  database: DatabaseHandle
  clock: Clock
  ids?: IdGenerator
  deviceId: string
  faults?: FaultInjector
}

// PBKDF-like hash: scrypt(password, salt, N=16384, r=8, p=1) stored as "scrypt:salt:hash"
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, expectedHex] = parts
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = scryptSync(password, salt, 64)
  return timingSafeEqual(expected, actual)
}

function toPublic(row: UserRow): PublicUser {
  return { id: row.id, username: row.username, displayName: row.displayName, role: row.role, isActive: row.isActive, lastLoginAt: row.lastLoginAt }
}

function generateSessionToken(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex')
}

export class UserService {
  private readonly ids: IdGenerator
  private readonly faults: FaultInjector
  constructor(private readonly deps: UserDependencies) {
    this.ids = deps.ids ?? createUlidGenerator()
    this.faults = deps.faults ?? noFaults
  }

  async login(username: string, password: string): Promise<ServiceResult<LoginResult>> {
    try {
      const row = getUserByUsername(this.deps.database, username)
      if (row === undefined) return serviceErr('not_found')
      if (!row.isActive) return serviceErr('user_inactive')
      if (!verifyPassword(password, row.passwordHash)) return serviceErr('wrong_password')
      const now = this.deps.clock.now()
      updateUser(this.deps.database, row.id, { lastLoginAt: now, updatedAt: now })
      const sessionToken = generateSessionToken()
      return serviceOk({ user: toPublic(row), sessionToken })
    } catch (error) {
      return serviceErr('database_error', error)
    }
  }

  async createUser(actor: Actor, fields: { username: string; displayName: string; role: 'owner' | 'manager' | 'cashier'; password: string }): Promise<ServiceResult<PublicUser>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    if (actor.role === 'manager' && fields.role === 'owner') return serviceErr('permission_denied')
    try {
      const existing = getUserByUsername(this.deps.database, fields.username)
      if (existing !== undefined) return serviceErr('username_taken')
      const now = this.deps.clock.now()
      const id = this.ids.next()
      const passwordHash = hashPassword(fields.password)
      this.faults.after('user.password_hashed')
      runInTransaction(this.deps.database, (tx) => {
        insertUser(tx, { id, username: fields.username, displayName: fields.displayName, passwordHash, role: fields.role, isActive: true, createdAt: now, updatedAt: now, deviceId: this.deps.deviceId })
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'user_created', entityType: 'user', entityId: id, after: { id, username: fields.username, role: fields.role }, now, deviceId: this.deps.deviceId })
        this.faults.after('user.created_audited')
      })
      const row = getUser(this.deps.database, id)
      if (row === undefined) return serviceErr('database_error')
      return serviceOk(toPublic(row))
    } catch (error) {
      return serviceErr('database_error', error)
    }
  }

  async changePassword(actor: Actor, targetUserId: string, newPassword: string): Promise<ServiceResult<true>> {
    if (actor.role === 'cashier' && actor.userId !== targetUserId) return serviceErr('permission_denied')
    try {
      const row = getUser(this.deps.database, targetUserId)
      if (row === undefined) return serviceErr('not_found')
      if (actor.role === 'manager' && row.role === 'owner') return serviceErr('permission_denied')
      const now = this.deps.clock.now()
      const passwordHash = hashPassword(newPassword)
      this.faults.after('user.password_hashed')
      runInTransaction(this.deps.database, (tx) => {
        updateUser(tx, targetUserId, { passwordHash, updatedAt: now })
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'password_changed', entityType: 'user', entityId: targetUserId, before: { passwordHash: '[redacted]' }, after: { passwordHash: '[redacted]' }, now, deviceId: this.deps.deviceId })
        this.faults.after('user.password_changed_audited')
      })
      return serviceOk(true)
    } catch (error) {
      return serviceErr('database_error', error)
    }
  }

  async updateUser(actor: Actor, targetUserId: string, fields: Partial<Pick<PublicUser, 'displayName' | 'role' | 'isActive'>>): Promise<ServiceResult<PublicUser>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      const row = getUser(this.deps.database, targetUserId)
      if (row === undefined) return serviceErr('not_found')
      if (actor.role === 'manager' && row.role === 'owner') return serviceErr('permission_denied')
      if (actor.role === 'manager' && fields.role === 'owner') return serviceErr('permission_denied')
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        updateUser(tx, targetUserId, { ...fields, updatedAt: now })
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'user_updated', entityType: 'user', entityId: targetUserId, before: { displayName: row.displayName, role: row.role, isActive: row.isActive }, after: fields, now, deviceId: this.deps.deviceId })
        this.faults.after('user.updated_audited')
      })
      const updated = getUser(this.deps.database, targetUserId)
      if (updated === undefined) return serviceErr('database_error')
      return serviceOk(toPublic(updated))
    } catch (error) {
      return serviceErr('database_error', error)
    }
  }

  async deactivateUser(actor: Actor, targetUserId: string): Promise<ServiceResult<true>> {
    if (actor.role === 'cashier') return serviceErr('permission_denied')
    try {
      const row = getUser(this.deps.database, targetUserId)
      if (row === undefined) return serviceErr('not_found')
      if (actor.role === 'manager' && row.role === 'owner') return serviceErr('permission_denied')
      const now = this.deps.clock.now()
      runInTransaction(this.deps.database, (tx) => {
        deactivateUser(tx, targetUserId, now)
        writeAudit(tx, this.ids, { userId: actor.userId, action: 'user_deactivated', entityType: 'user', entityId: targetUserId, before: { isActive: true }, after: { isActive: false }, now, deviceId: this.deps.deviceId })
        this.faults.after('user.deactivated_audited')
      })
      return serviceOk(true)
    } catch (error) {
      return serviceErr('database_error', error)
    }
  }

  async listUsers(): Promise<ServiceResult<PublicUser[]>> {
    try {
      return serviceOk(listUsers(this.deps.database).map(toPublic))
    } catch (error) {
      return serviceErr('database_error', error)
    }
  }
}
