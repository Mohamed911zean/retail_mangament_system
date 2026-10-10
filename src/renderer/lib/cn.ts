/** Joins class names, dropping the falsy ones (no dependency needed). */
export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ')
}
