/**
 * Where a System One request goes, and which credential selects it.
 *
 * Jev is reachable two ways, and they are NOT two providers of one model in
 * the sense our provider layer means it — they are two hosts that accept the
 * identical `{state, questions, model}` body:
 *
 *   typesafe   POST https://api.typesafe.ai/v1/systemone      model `jev-latest`
 *   openrouter POST https://openrouter.ai/api/alpha/decisions model `~typesafe/jev-latest`
 *
 * OpenRouter does not expose Jev as a chat model — it is absent from
 * `GET /api/v1/models` and lives behind a separate "Decisions" endpoint,
 * because a model that returns a typed judgment rather than tokens does not
 * fit `/v1/chat/completions` any better there than it fits our `Provider`
 * interface here. That is the whole reason this subsystem is not a provider.
 *
 * The OpenRouter path is still on `/api/alpha/`, which OpenRouter itself
 * warns may move. It is a table entry rather than a constant in the client so
 * that a move is a config override, not a release.
 */

/** Hosts that accept a System One body. `custom` is any explicit endpoint. */
export type TypeSafeRoute = 'typesafe' | 'openrouter' | 'custom';

export interface TypeSafeRouteSpec {
  /** Full endpoint URL, not a base — the two routes differ in path, not host. */
  url: string;
  /** Model id this route names Jev by. Differs per route. */
  model: string;
  /** Environment variable consulted when `typesafe.apiKey` is unset. */
  env: string;
  /** Human label for `wstack typesafe status` and doctor findings. */
  label: string;
}

/**
 * Known routes, in precedence order.
 *
 * `typesafe` is listed first and wins when both credentials are present, for
 * the same reason the upstream `jev` MCP server made that choice: an
 * `OPENROUTER_API_KEY` that happens to be in the environment for chat must not
 * silently reroute a TypeSafe account the operator deliberately configured,
 * nor move its billing.
 */
export const TYPESAFE_ROUTES = {
  typesafe: {
    url: 'https://api.typesafe.ai/v1/systemone',
    model: 'jev-latest',
    env: 'TYPESAFE_API_KEY',
    label: 'TypeSafe',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/alpha/decisions',
    model: '~typesafe/jev-latest',
    env: 'OPENROUTER_API_KEY',
    label: 'OpenRouter (Decisions)',
  },
} as const satisfies Record<Exclude<TypeSafeRoute, 'custom'>, TypeSafeRouteSpec>;

/** Route ids with a built-in endpoint, in the precedence order above. */
export const BUILT_IN_ROUTES = ['typesafe', 'openrouter'] as const;

/** Every value `typesafe.route` may take. */
export const TYPESAFE_ROUTE_IDS: readonly TypeSafeRoute[] = [...BUILT_IN_ROUTES, 'custom'];

export function isTypeSafeRoute(value: unknown): value is TypeSafeRoute {
  return typeof value === 'string' && (TYPESAFE_ROUTE_IDS as readonly string[]).includes(value);
}

/**
 * The published Jev input price, in USD per million input tokens. Output is
 * free, which is why only one number appears here.
 *
 * This is a DISPLAY estimate for `wstack typesafe status` and the eval
 * preview, not a billing figure — a request routed through OpenRouter is
 * billed by OpenRouter at whatever that route charges, and neither host
 * reports a price in the response body.
 */
export const JEV_INPUT_USD_PER_MTOK = 0.042;

/** Estimated USD for an input-token count. See {@link JEV_INPUT_USD_PER_MTOK}. */
export function estimateTypeSafeCostUsd(inputTokens: number): number {
  if (!Number.isFinite(inputTokens) || inputTokens <= 0) return 0;
  return (inputTokens / 1_000_000) * JEV_INPUT_USD_PER_MTOK;
}
