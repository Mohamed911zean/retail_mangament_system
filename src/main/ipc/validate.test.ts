import { describe, expect, it } from 'vitest'
import { ValidationError, v } from './validate'

function failure(run: () => unknown): ValidationError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError)
    return error as ValidationError
  }
  throw new Error('expected the validator to reject the value')
}

describe('v.payload', () => {
  it('accepts a plain object', () => {
    expect(v.payload({ a: 1 })).toEqual({ a: 1 })
  })

  it.each([null, undefined, 'text', 7, [1, 2]])('rejects %s', (value) => {
    expect(failure(() => v.payload(value)).field).toBe('payload')
  })
})

describe('v.string', () => {
  it('trims and returns the value', () => {
    expect(v.string('  Ahmed  ', 'name')).toBe('Ahmed')
  })

  it('normalizes Arabic-Indic digits so the stored value is ASCII', () => {
    expect(v.string('٠١٢٣', 'code')).toBe('0123')
  })

  it('rejects an empty or whitespace-only string by default', () => {
    expect(failure(() => v.string('   ', 'name')).field).toBe('name')
  })

  it('rejects a value above the maximum length', () => {
    const error = failure(() => v.string('abcd', 'name', { max: 3 }))
    expect(error.field).toBe('name')
  })

  it('rejects a non-string', () => {
    expect(failure(() => v.string(12, 'name')).field).toBe('name')
  })
})

describe('v.optionalText', () => {
  it('maps undefined to undefined (field was not provided)', () => {
    expect(v.optionalText(undefined, 'phone')).toBeUndefined()
  })

  it('maps null and blank text to null', () => {
    expect(v.optionalText(null, 'phone')).toBeNull()
    expect(v.optionalText('   ', 'phone')).toBeNull()
  })

  it('returns trimmed text otherwise', () => {
    expect(v.optionalText(' 0100 ', 'phone', { max: 10 })).toBe('0100')
  })
})

describe('v.id', () => {
  it('accepts ULID-like identifiers', () => {
    expect(v.id('01JCK8Q4Z9K7Y2V5N3M6P1R0ST', 'userId')).toBe('01JCK8Q4Z9K7Y2V5N3M6P1R0ST')
  })

  it.each(['', 'has space', "quote'", 'semi;colon', 'x'.repeat(65)])('rejects %s so it can never reach SQL', (value) => {
    expect(failure(() => v.id(value, 'userId')).field).toBe('userId')
  })

  it('rejects a non-string', () => {
    expect(failure(() => v.id(42, 'userId')).field).toBe('userId')
  })
})

describe('v.optionalId', () => {
  it('treats undefined, null and the empty string as "no id"', () => {
    expect(v.optionalId(undefined, 'customerId')).toBeUndefined()
    expect(v.optionalId(null, 'customerId')).toBeNull()
    expect(v.optionalId('', 'customerId')).toBeNull()
  })

  it('still validates a provided id', () => {
    expect(failure(() => v.optionalId('bad id', 'customerId')).field).toBe('customerId')
  })
})

describe('v.integer', () => {
  it('accepts a whole number and rejects a float', () => {
    expect(v.integer(1250, 'qty')).toBe(1250)
    expect(failure(() => v.integer(12.5, 'qty')).field).toBe('qty')
  })

  it('parses a numeric string, normalizing Arabic-Indic digits', () => {
    expect(v.integer('١٢٥٠', 'qty')).toBe(1250)
  })

  it('enforces the bounds', () => {
    expect(failure(() => v.integer(0, 'qty', { min: 1 })).field).toBe('qty')
    expect(failure(() => v.integer(11, 'qty', { max: 10 })).field).toBe('qty')
  })

  it('rejects NaN and Infinity', () => {
    expect(failure(() => v.integer(Number.NaN, 'qty')).field).toBe('qty')
    expect(failure(() => v.integer(Number.POSITIVE_INFINITY, 'qty')).field).toBe('qty')
  })
})

describe('v.money', () => {
  it('accepts zero by default and rejects a negative amount', () => {
    expect(v.money(0, 'amount')).toBe(0)
    expect(failure(() => v.money(-1, 'amount')).field).toBe('amount')
  })

  it('rejects a fractional piaster value (money is integer piasters)', () => {
    expect(failure(() => v.money(12.5, 'amount')).field).toBe('amount')
  })

  it('honours a stricter minimum', () => {
    expect(failure(() => v.money(0, 'amount', { min: 1 })).field).toBe('amount')
  })
})

describe('v.boolean', () => {
  it('accepts true and false', () => {
    expect(v.boolean(true, 'flag')).toBe(true)
    expect(v.boolean(false, 'flag')).toBe(false)
  })

  it('falls back only when the value is undefined', () => {
    expect(v.boolean(undefined, 'flag', true)).toBe(true)
    expect(v.boolean(undefined, 'flag', false)).toBe(false)
    // null is an explicit value, not an omission.
    expect(failure(() => v.boolean(null, 'flag', true)).field).toBe('flag')
  })
})

describe('v.oneOf', () => {
  it('accepts a listed value and rejects anything else', () => {
    expect(v.oneOf('cash', 'method', ['cash', 'card'] as const)).toBe('cash')
    expect(failure(() => v.oneOf('bitcoin', 'method', ['cash', 'card'] as const)).field).toBe('method')
  })

  it('compares numbers strictly, so a string of the same digits is rejected', () => {
    expect(v.oneOf(3, 'qtyScale', [0, 3] as const)).toBe(3)
    expect(failure(() => v.oneOf('3', 'qtyScale', [0, 3] as const)).field).toBe('qtyScale')
  })
})

describe('v.role and v.paymentMethod', () => {
  it('accepts the three known roles', () => {
    expect(v.role('owner', 'role')).toBe('owner')
    expect(v.role('manager', 'role')).toBe('manager')
    expect(v.role('cashier', 'role')).toBe('cashier')
    expect(failure(() => v.role('admin', 'role')).field).toBe('role')
  })

  it('accepts the configured payment methods only', () => {
    expect(v.paymentMethod('wallet', 'method')).toBe('wallet')
    expect(failure(() => v.paymentMethod('cheque', 'method')).field).toBe('method')
  })
})

describe('v.barcode', () => {
  it('accepts digits and letters and normalizes Arabic-Indic digits', () => {
    expect(v.barcode('6221031015', 'barcode')).toBe('6221031015')
    expect(v.barcode('ABC-1234', 'barcode')).toBe('ABC-1234')
    expect(v.barcode('٦٢٢١٠٣١٠١٥', 'barcode')).toBe('6221031015')
  })

  it('rejects a value that is too short or contains separators', () => {
    expect(failure(() => v.barcode('12', 'barcode')).field).toBe('barcode')
    expect(failure(() => v.barcode('6200 1234', 'barcode')).field).toBe('barcode')
  })
})

describe('v.array', () => {
  it('parses each item and reports the offending field with its index', () => {
    const parsed = v.array([{ n: 1 }, { n: 2 }], 'items', (item, index) => v.integer((item as { n: unknown }).n, `items[${index}].n`))
    expect(parsed).toEqual([1, 2])
    expect(failure(() => v.array([{ n: 'x' }], 'items', (item, index) => v.integer((item as { n: unknown }).n, `items[${index}].n`))).field).toBe('items[0].n')
  })

  it('enforces the item count bounds', () => {
    expect(failure(() => v.array([], 'lines', (item) => item, { min: 1 })).field).toBe('lines')
    expect(failure(() => v.array([1, 2], 'lines', (item) => item, { max: 1 })).field).toBe('lines')
  })

  it('rejects a non-array', () => {
    expect(failure(() => v.array({}, 'lines', (item) => item)).field).toBe('lines')
  })
})

describe('v.discount', () => {
  it('treats undefined and null as "no discount"', () => {
    expect(v.discount(undefined, 'discount')).toBeUndefined()
    expect(v.discount(null, 'discount')).toBeUndefined()
  })

  it('parses a fixed discount in piasters', () => {
    expect(v.discount({ kind: 'fixed', amountPiasters: 250 }, 'discount')).toEqual({ kind: 'fixed', amountPiasters: 250 })
  })

  it('parses a percentage discount as basis points', () => {
    expect(v.discount({ kind: 'percent', basisPoints: 750 }, 'discount')).toEqual({ kind: 'percent', basisPoints: 750 })
  })

  it('rejects a percentage above 100% and a negative fixed amount', () => {
    expect(failure(() => v.discount({ kind: 'percent', basisPoints: 10_001 }, 'discount')).field).toBe('discount.basisPoints')
    expect(failure(() => v.discount({ kind: 'fixed', amountPiasters: -1 }, 'discount')).field).toBe('discount.amountPiasters')
  })

  it('rejects an unknown kind', () => {
    expect(failure(() => v.discount({ kind: 'free' }, 'discount')).field).toBe('discount.kind')
  })
})
