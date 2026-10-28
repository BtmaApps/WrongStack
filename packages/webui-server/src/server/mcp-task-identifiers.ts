/** Operation/receipt IDs are opaque tokens. Core session IDs may contain one dated path segment. */
export const isMcpTaskIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
export function isMcpTaskSessionId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 256) return false;
  const parts = value.split('/');
  return (
    parts.length <= 2 &&
    parts.every((part) => part !== '.' && part !== '..' && isMcpTaskIdentifier(part))
  );
}
