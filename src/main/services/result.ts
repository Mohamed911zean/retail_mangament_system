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

export const serviceOk = <T>(value: T): ServiceResult<T> => ({ ok: true, value })
export const serviceErr = (code: ServiceErrorCode | string, details?: unknown): ServiceResult<never> => ({
  ok: false,
  error: { code, messageKey: `errors.${code}`, details },
})
