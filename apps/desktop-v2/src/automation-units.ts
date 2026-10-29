/**
 * Convert an automation form entry (minutes or seconds) to whole milliseconds.
 *
 * The runtime accepts only safe-integer milliseconds, and a plain
 * `Number(value) * unit` is not one for many ordinary decimals in binary
 * floating point (4.1 × 60000 = 245999.99999999997), so an in-range entry was
 * rejected as out of range. Invalid input stays NaN for the runtime to refuse.
 */
export function automationMilliseconds(value: string, unitMs: number): number {
  return Math.round(Number(value) * unitMs);
}
