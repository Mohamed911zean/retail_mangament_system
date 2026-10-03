export type DomainErrorCode =
  | 'invalid_money'
  | 'invalid_quantity'
  | 'invalid_rate'
  | 'overflow'
  | 'invalid_discount'
  | 'invalid_payment'
  | 'insufficient_stock'
  | 'invalid_shift_state'
  | 'ledger_invariant_violation'
  | 'return_exceeds_original'
  | 'document_already_voided'
  | 'invalid_input'

export type DomainError = {
  code: DomainErrorCode
  message: string
  field?: string
}

export type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}
