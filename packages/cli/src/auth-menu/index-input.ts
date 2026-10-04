/** Parse a one-based menu index, rejecting numeric prefixes with trailing text. */
export function parseAuthMenuIndex(raw: string): number | undefined {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return undefined;
  const index = Number(value);
  return Number.isSafeInteger(index) && index > 0 ? index : undefined;
}
