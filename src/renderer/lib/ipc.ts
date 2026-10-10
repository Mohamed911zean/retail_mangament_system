import type { IpcErrorInfo, IpcResult } from '../../shared/ipc'

/**
 * Renderer-side error for a failed IPC call. The main process never rejects a
 * channel; it resolves to an `IpcResult`, so the stable code and the Arabic
 * `messageKey` survive the trip and can be shown to the user.
 */
export class ApiError extends Error {
  readonly code: string
  readonly messageKey: string
  readonly details?: unknown

  constructor(error: IpcErrorInfo) {
    super(error.code)
    this.name = 'ApiError'
    this.code = error.code
    this.messageKey = error.messageKey
    this.details = error.details
  }
}

/** Awaits an `IpcResult` and returns its value, or throws an `ApiError`. */
export async function unwrap<T>(result: Promise<IpcResult<T>>): Promise<T> {
  const resolved = await result
  if (resolved.ok) return resolved.value
  throw new ApiError(resolved.error)
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof Error) {
    return new ApiError({ code: 'internal_error', messageKey: 'errors.internal_error', details: error.message })
  }
  return new ApiError({ code: 'internal_error', messageKey: 'errors.internal_error' })
}

/** i18n key for a thrown error, safe to index into `ar.json`. */
export function errorKey(error: unknown): string {
  return toApiError(error).messageKey
}
