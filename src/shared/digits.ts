/**
 * Arabic-Indic (٠-٩, U+0660-U+0669) and Extended Arabic-Indic (۰-۹, U+06F0-U+06F9)
 * digits are common on Arabic keyboards. Users may type either form into money,
 * quantity, phone or barcode fields, so every numeric input is normalized to
 * Western digits (0-9) before it reaches the domain or the database.
 */
const ARABIC_INDIC_ZERO = 0x0660
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0

/** Converts every Arabic-Indic digit in `input` to its Western counterpart. */
export function normalizeDigits(input: string): string {
  let output = ''
  for (const character of input) {
    const code = character.codePointAt(0) ?? 0
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      output += String(code - ARABIC_INDIC_ZERO)
    } else if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
      output += String(code - EXTENDED_ARABIC_INDIC_ZERO)
    } else {
      output += character
    }
  }
  return output
}

/** Western digits are the default; a setting may switch display to Arabic-Indic. */
export function formatDigits(input: string, style: 'western' | 'arabic' = 'western'): string {
  if (style === 'western') return input
  return input.replace(/[0-9]/gu, (digit) => String.fromCodePoint(ARABIC_INDIC_ZERO + Number(digit)))
}
