import { normalizeDigits } from '../../shared/digits'
import type { PaymentMethod } from '../../shared/settings'
import { paymentMethods } from '../../shared/settings'
import type { Role } from '../../shared/permissions'

/**
 * Hand-rolled input validation for the IPC boundary. Deliberately small and
 * dependency-free (weak PCs, tiny bundle). Every failure carries the offending
 * field so the renderer can highlight it; the Arabic message comes from i18n.
 */
export class ValidationError extends Error {
  public readonly field: string
  constructor(field: string, message: string) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

export type Discount =
  | { kind: 'fixed'; amountPiasters: number }
  | { kind: 'percent'; basisPoints: number }

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u
export const MAX_MONEY_PIASTERS = Number.MAX_SAFE_INTEGER

function fail(field: string, message: string): never {
  throw new ValidationError(field, message)
}

export const v = {
  /** The payload itself must be a plain object. */
  payload(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('payload', 'expected an object')
    return value as Record<string, unknown>
  },

  string(value: unknown, field: string, options: { min?: number; max?: number } = {}): string {
    if (typeof value !== 'string') fail(field, 'expected a string')
    const trimmed = normalizeDigits(value).trim()
    const min = options.min ?? 1
    const max = options.max ?? 500
    if (trimmed.length < min) fail(field, `expected at least ${min} character(s)`)
    if (trimmed.length > max) fail(field, `expected at most ${max} character(s)`)
    return trimmed
  },

  /** Optional free text: `undefined` is "not provided", `''` becomes `null`. */
  optionalText(value: unknown, field: string, options: { max?: number } = {}): string | null | undefined {
    if (value === undefined) return undefined
    if (value === null) return null
    if (typeof value !== 'string') fail(field, 'expected a string')
    const trimmed = normalizeDigits(value).trim()
    if (trimmed.length === 0) return null
    if (trimmed.length > (options.max ?? 1000)) fail(field, 'text is too long')
    return trimmed
  },

  /** Database ids and ULIDs. Kept strict so a bad id cannot reach SQL. */
  id(value: unknown, field: string): string {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) fail(field, 'expected an identifier')
    return value
  },

  optionalId(value: unknown, field: string): string | null | undefined {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    return v.id(value, field)
  },

  /** A barcode: digits only, 4-32 characters, Arabic-Indic digits normalized. */
  barcode(value: unknown, field: string): string {
    const raw = normalizeDigits(v.string(value, field, { min: 4, max: 32 }))
    if (!/^[0-9A-Za-z-]+$/u.test(raw)) fail(field, 'expected a barcode')
    return raw
  },

  integer(value: unknown, field: string, options: { min?: number; max?: number } = {}): number {
    const parsed = typeof value === 'string' ? Number(normalizeDigits(value)) : value
    if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed)) fail(field, 'expected a whole number')
    if (options.min !== undefined && parsed < options.min) fail(field, `must be at least ${options.min}`)
    if (options.max !== undefined && parsed > options.max) fail(field, `must be at most ${options.max}`)
    return parsed
  },

  /** Money is always integer piasters (AGENTS.md §3 rule 2). */
  money(value: unknown, field: string, options: { min?: number } = {}): number {
    return v.integer(value, field, { min: options.min ?? 0, max: MAX_MONEY_PIASTERS })
  },

  boolean(value: unknown, field: string, fallback?: boolean): boolean {
    if (value === undefined && fallback !== undefined) return fallback
    if (typeof value !== 'boolean') fail(field, 'expected true or false')
    return value
  },

  oneOf<T extends string | number>(value: unknown, field: string, allowed: readonly T[]): T {
    if ((typeof value !== 'string' && typeof value !== 'number') || !allowed.includes(value as T)) {
      fail(field, `expected one of: ${allowed.join(', ')}`)
    }
    return value as T
  },

  paymentMethod(value: unknown, field: string): PaymentMethod {
    return v.oneOf(value, field, paymentMethods)
  },

  role(value: unknown, field: string): Role {
    return v.oneOf(value, field, ['owner', 'manager', 'cashier'] as const)
  },

  array<T>(value: unknown, field: string, parseItem: (item: unknown, index: number) => T, options: { min?: number; max?: number } = {}): T[] {
    if (!Array.isArray(value)) fail(field, 'expected a list')
    const min = options.min ?? 0
    const max = options.max ?? 500
    if (value.length < min) fail(field, `expected at least ${min} item(s)`)
    if (value.length > max) fail(field, `expected at most ${max} item(s)`)
    return value.map((item, index) => parseItem(item, index))
  },

  discount(value: unknown, field: string): Discount | undefined {
    if (value === undefined || value === null) return undefined
    const record = v.payload(value)
    const kind = v.oneOf(record.kind, `${field}.kind`, ['fixed', 'percent'] as const)
    if (kind === 'fixed') return { kind, amountPiasters: v.money(record.amountPiasters, `${field}.amountPiasters`) }
    const basisPoints = v.integer(record.basisPoints, `${field}.basisPoints`, { min: 0, max: 10_000 })
    return { kind, basisPoints }
  },
}
