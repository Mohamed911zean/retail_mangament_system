import { err, ok, type DomainError, type Result } from './result'

export function safeInteger(
  value: unknown,
  label: string,
): Result<number, DomainError> {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    return err({
      code: 'invalid_input',
      message: `${label} must be a safe integer`,
      field: label,
    })
  }

  return ok(value)
}
