export type ServiceErrorCode =
  | 'permission_denied'
  | 'not_found'
  | 'invalid_input'
  | 'database_error'
  | 'settings_error'
  | 'fault_injected'

export type ServiceError = {
  code: ServiceErrorCode | string
  messageKey: string
  details?: unknown
}

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServiceError }

export type ServiceFailure = { ok: false; error: ServiceError }

export const serviceOk = <T>(value: T): ServiceResult<T> => ({ ok: true, value })
export const serviceErr = (code: ServiceErrorCode | string, details?: unknown): ServiceFailure => ({
  ok: false,
  error: { code, messageKey: `errors.${code}`, details },
})

export class ServiceTransactionError extends Error {
  public readonly result: ServiceFailure
  constructor(result: ServiceFailure) {
    super(result.error.code)
    this.name = 'ServiceTransactionError'
    this.result = result
  }
}

