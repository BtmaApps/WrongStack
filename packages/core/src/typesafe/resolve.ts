/**
 * One place that turns `config.typesafe` + the environment into a client.
 *
 * Both TypeSafe-backed features resolve their transport through here, so
 * "where does the key come from, and which host does it go to" has a single
 * answer and cannot drift between subsystems.
 */

import type { Config } from '../types/config/root.js';
import { createTypeSafeClient, type TypeSafeClient } from './client.js';

/** Environment variable read when `typesafe.apiKey` is unset. */
export const TYPESAFE_API_KEY_ENV = 'TYPESAFE_API_KEY';

export interface ResolveTypeSafeClientDeps {
  config: Pick<Config, 'typesafe'>;
  /** Injected for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv | undefined;
  /** Per-attempt timeout override, when a caller has a tighter budget. */
  timeoutMs?: number | undefined;
}

/**
 * Build a client, or say why one could not be built.
 *
 * Returns a REASON rather than `undefined` so a surface the user invoked
 * directly can explain itself, while a background host is free to ignore the
 * string and stay silent.
 */
export function resolveTypeSafeClient(
  deps: ResolveTypeSafeClientDeps,
): { client: TypeSafeClient } | { error: string } {
  const account = deps.config.typesafe ?? {};
  const env = deps.env ?? process.env;
  const apiKey = (account.apiKey ?? env[TYPESAFE_API_KEY_ENV] ?? '').trim();
  if (!apiKey) {
    return { error: `no TypeSafe API key — set ${TYPESAFE_API_KEY_ENV} or typesafe.apiKey` };
  }
  return {
    client: createTypeSafeClient({
      apiKey,
      endpoint: account.endpoint,
      model: account.model,
      timeoutMs: deps.timeoutMs ?? account.requestTimeoutMs,
    }),
  };
}

/** The configured model id, for callers that pass it per request. */
export function typeSafeModel(config: Pick<Config, 'typesafe'>): string | undefined {
  return config.typesafe?.model;
}
