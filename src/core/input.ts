/**
 * Numeric text input handling.
 *
 * Users type money and prices into MOVA's tools, and a half-typed value like
 * "0." or "" must not become NaN, crash a calculation, or be silently rewritten
 * under the cursor. These helpers keep the *text* the user is editing intact and
 * convert to a number only at the point of use.
 */

/**
 * Strip anything that cannot appear in a positive decimal, keeping at most one
 * decimal point. Applied on every keystroke, so it must never reorder or insert
 * characters — only remove them.
 */
export function sanitizeDecimal(text: string): string {
  if (typeof text !== 'string') return '';
  const cleaned = text.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

/**
 * Parse sanitised input to a number.
 *
 * Returns `fallback` for anything not finite — including the empty string and a
 * lone ".", both of which are normal intermediate states while typing.
 */
export function toNumber(text: string, fallback = 0): number {
  if (typeof text !== 'string') return fallback;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed === '.') return fallback;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : fallback;
}

/** Whether the field holds something that can be used as a positive amount. */
export function isPositiveInput(text: string): boolean {
  return toNumber(text, 0) > 0;
}

/**
 * Format a number back into an editable field.
 *
 * Uses plain decimal notation: `toString` switches to exponential below 1e-7,
 * and "1e-8" is not something a user can sensibly edit.
 */
export function toInputText(value: number | null | undefined, maxDecimals = 12): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return '';
  const fixed = value.toFixed(maxDecimals);
  // Drop trailing zeros, and the decimal point if nothing follows it.
  return fixed.replace(/\.?0+$/, '');
}
