/** The `ProviderErrorKind`s a code can decide; a literal subset so this file imports nothing. */
type CodeKind = 'quota_exhausted' | 'overloaded' | 'rate_limit' | 'context_overflow';

/**
 * Provider error codes whose meaning is unambiguous, consulted by
 * `classifyProviderError` ahead of status and prose. These are OpenAI's
 * (Responses API + ChatGPT backend), mapped as the official Codex client maps
 * them: a 429 `usage_not_included` would otherwise be retried forever as a
 * rate limit, and a 503 `server_is_overloaded` retried as a plain 5xx.
 *
 * Deliberately absent:
 * - policy codes (`cyber_policy`, `bio_policy`, `invalid_prompt`): they stay
 *   `invalid_request`, because `content_filter` would let the reroute strategy
 *   route a safety refusal to a sibling model;
 * - billing codes (`insufficient_quota`, `*_spend_limit_exceeded`, …): quota
 *   is decided from the structured message/type only (see the quota comment
 *   in `classifyProviderError`), and a code-only match would reopen the
 *   burst-429 → 15-minute quarantine regression that rule exists to prevent.
 */
const KIND_BY_ERROR_CODE: Readonly<Record<string, CodeKind>> = {
  // ChatGPT backend: the plan does not include Codex at all. Retrying is
  // pointless; another provider may still serve the request.
  usage_not_included: 'quota_exhausted',
  server_is_overloaded: 'overloaded',
  slow_down: 'rate_limit',
  context_length_exceeded: 'context_overflow',
};

export function kindFromErrorCode(code: string | undefined): CodeKind | undefined {
  return code !== undefined && Object.hasOwn(KIND_BY_ERROR_CODE, code)
    ? KIND_BY_ERROR_CODE[code]
    : undefined;
}
