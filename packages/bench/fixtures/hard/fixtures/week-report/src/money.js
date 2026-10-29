/** Parse a decimal amount string such as '12.34' into integer cents. */
export function parseCents(amount) {
  return Math.floor(Number.parseFloat(amount) * 100);
}

/** Format integer cents as a decimal string with two fraction digits. */
export function formatCents(cents) {
  return (cents / 100).toFixed(2);
}
