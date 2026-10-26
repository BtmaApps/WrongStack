/**
 * String utilities shared across the WrongStack codebase.
 */

/**
 * Truncate a string to at most `max` characters, appending an ellipsis if it
 * was longer. Returns the original string unchanged when it fits.
 */
export function truncate(s: string, max: number): string {
  if (max <= 0) return '';
  if (s.length <= max) return s;
  if (max === 1) return '…';
  let end = max - 1;
  const lastCode = s.charCodeAt(end - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    end -= 1;
  }
  return `${s.slice(0, end)}…`;
}
