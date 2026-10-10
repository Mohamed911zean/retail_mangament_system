/**
 * Shared control styling, so every input has the same height, radius and focus.
 *
 * Lives in its own module (not `Field.tsx`) so presentational helpers stay
 * importable without breaking fast-refresh's components-only rule.
 */
export function controlClasses(hasError: boolean, extra?: string): string {
  return [
    'w-full rounded-md border bg-surface px-3 text-base text-ink placeholder:text-muted',
    'h-10 disabled:cursor-not-allowed disabled:bg-panel disabled:text-line-control',
    hasError ? 'border-error' : 'border-line-control',
    extra ?? '',
  ].join(' ')
}
