/** Max chars of collapse digest persisted to the session log line. */
export const MAX_DIGEST_LOG_CHARS = 4_000;

export function truncateDigest(digest: string): string {
  if (digest.length <= MAX_DIGEST_LOG_CHARS) return digest;
  return `${digest.slice(0, MAX_DIGEST_LOG_CHARS)}… [+${digest.length - MAX_DIGEST_LOG_CHARS} chars; full turns in session log]`;
}
