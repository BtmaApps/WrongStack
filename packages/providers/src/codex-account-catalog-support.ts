export const CODEX_MODELS_FAILURE_COOLDOWN_MS = 5_000;

export const CODEX_MODELS_TIMEOUT_MS = 3_000;

/** Budget for the account usage read (`/wham/usage`) — a status call, never on a turn's path. */
export const CODEX_USAGE_TIMEOUT_MS = 10_000;

/** Match the official client's in-memory/file model catalog freshness window. */
export const CODEX_MODELS_CACHE_TTL_MS = 5 * 60_000;
