import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { AlertIcon } from '../icons'

/**
 * Field wrapper (§4.2): label **above** the control, helper text below, and an
 * error message below that, in Arabic and actionable ("اكتب اسم المنتج", never
 * just "خطأ"). Colours are never the only signal — the error also shows an icon.
 *
 * The single child is cloned with `aria-describedby` (and `aria-required`) so a
 * screen reader reads the helper or the error together with the control, without
 * every call site having to repeat the ids.
 */
export type FieldProps = {
  label: string
  /** Id of the control this label describes. */
  htmlFor: string
  required?: boolean
  /** Short hint under the control (not shown once there is an error). */
  helper?: string
  error?: string
  children: ReactNode
}

export function Field({ label, htmlFor, required = false, helper, error, children }: FieldProps) {
  const describedBy = error !== undefined ? `${htmlFor}-error` : helper !== undefined ? `${htmlFor}-helper` : undefined

  const control =
    isValidElement(children) && describedBy !== undefined
      ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': describedBy })
      : children

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-strong">
        {label}
        {required && (
          <>
            {' '}
            <span aria-hidden="true">*</span>
            <span className="sr-only">(مطلوب)</span>
          </>
        )}
      </label>
      {control}
      {error !== undefined ? (
        <p id={`${htmlFor}-error`} className="flex items-center gap-1 text-sm text-error-ink">
          <AlertIcon size={16} />
          {error}
        </p>
      ) : (
        helper !== undefined && (
          <p id={`${htmlFor}-helper`} className="text-sm text-muted">
            {helper}
          </p>
        )
      )}
    </div>
  )
}

/** Shared control styling, so every input has the same height, radius and focus. */
export function controlClasses(hasError: boolean, extra?: string): string {
  return [
    'w-full rounded-md border bg-surface px-3 text-base text-ink placeholder:text-muted',
    'h-10 disabled:cursor-not-allowed disabled:bg-panel disabled:text-line-control',
    hasError ? 'border-error' : 'border-line-control',
    extra ?? '',
  ].join(' ')
}
