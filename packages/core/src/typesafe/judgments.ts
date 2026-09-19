/**
 * One way for a feature to ask "may I use TypeSafe right now?".
 *
 * The judgment features (Brain, memory triage, topic shift, recall filtering,
 * compaction, kanban verification, model tier, semantic lint) all have the
 * same shape: an existing path that works without TypeSafe, and a System One
 * judgment that can answer the same question faster, cheaper or with a real
 * probability. Each one must use the judgment only when:
 *
 *   1. an account resolves `ready` (unconfigured → silent, unusable → one warning),
 *   2. its own switch in `typesafe.judgments` is not `false`,
 *   3. the host is not resting after transient failures (`rest.ts`), and
 *   4. the credential has not been rejected (`breaker.ts`).
 *
 * (1) and (2) are answered here. (3) and (4) are answered per request by the
 * client itself — it throws `TypeSafeRestingError` / `TypeSafeDisabledError`
 * without touching the network — so every caller already has the right
 * behaviour by treating ANY throw as "take the fallback".
 *
 * ## Why one client per account, memoised
 *
 * The auth breaker counts consecutive rejections PER CLIENT. A feature that
 * built a fresh client per call would never accumulate evidence and a revoked
 * key would be retried forever. Every feature therefore shares one client per
 * (endpoint, model, credential), and so shares what that client has learned.
 *
 * This deliberately is not the `isTypeSafeAvailable()` helper the account
 * module refuses to have: it returns a client, not a boolean, and what happens
 * without one stays in each caller.
 */

import { createHash } from 'node:crypto';
import { TOKENS } from '../kernel/tokens.js';
import type { Config } from '../types/config/root.js';
import type { TypeSafeJudgmentsConfig } from '../types/config/typesafe.js';
import type { TypeSafeClient } from './client.js';
import { type WarnSink, warnOnce } from './notify.js';
import { resolveTypeSafeAccount, type TypeSafeAccountReady } from './resolve.js';
import { TYPESAFE_ROUTES } from './route.js';

export type TypeSafeJudgmentFeature = keyof TypeSafeJudgmentsConfig;

export const TYPESAFE_JUDGMENT_FEATURES: readonly TypeSafeJudgmentFeature[] = [
  'brain',
  'memoryTriage',
  'topicShift',
  'memoryRecall',
  'compaction',
  'kanbanVerify',
  'modelTier',
  'semanticLint',
];

export interface TypeSafeJudge {
  client: TypeSafeClient;
  /** Model id to send; the account's own. */
  model: string;
  feature: TypeSafeJudgmentFeature;
}

export interface ResolveTypeSafeJudgeDeps {
  config: Pick<Config, 'typesafe'>;
  feature: TypeSafeJudgmentFeature;
  /** Injected for tests; defaults to `process.env`. Bypasses the memo. */
  env?: NodeJS.ProcessEnv | undefined;
  logger?: (WarnSink & { debug?: (message: string) => void }) | undefined;
}

/** Whether the feature's switch allows it. Unset = allowed. */
export function isTypeSafeJudgmentEnabled(
  config: Pick<Config, 'typesafe'>,
  feature: TypeSafeJudgmentFeature,
): boolean {
  return config.typesafe?.judgments?.[feature] !== false;
}

const accounts = new Map<string, TypeSafeAccountReady>();

/**
 * A client for `feature`, or `undefined` when it must take its fallback path.
 *
 * A returned judge can still fail per request (rest, breaker, network); the
 * caller treats every throw as "no judgment" and falls back.
 */
export function resolveTypeSafeJudge(deps: ResolveTypeSafeJudgeDeps): TypeSafeJudge | undefined {
  if (!isTypeSafeJudgmentEnabled(deps.config, deps.feature)) return undefined;
  const env = deps.env ?? process.env;
  const logger = deps.logger;
  const probe = resolveTypeSafeAccount({ config: deps.config, env, restGate: null });
  if (probe.status === 'unconfigured') return undefined;
  if (probe.status === 'unusable') {
    // A key or endpoint exists and is wrong. Features default ON with an
    // account, so this is someone who meant to use TypeSafe: say it once.
    warnOnce(logger, `typesafe is configured but unusable: ${probe.reason}`);
    return undefined;
  }

  const apiKey =
    deps.config.typesafe?.apiKey?.trim() ||
    env[probe.keyEnv ?? TYPESAFE_ROUTES.typesafe.env]?.trim() ||
    '';
  const id = [
    probe.endpoint,
    probe.model,
    String(deps.config.typesafe?.requestTimeoutMs ?? ''),
    String(deps.config.typesafe?.authFailureLimit ?? ''),
    createHash('sha256').update(apiKey).digest('hex').slice(0, 16),
  ].join('\0');

  let account = deps.env ? undefined : accounts.get(id);
  if (!account) {
    const resolved = resolveTypeSafeAccount({
      config: deps.config,
      env,
      onUsage: (usage) =>
        logger?.debug?.(
          `typesafe: ${usage.inputTokens} input tokens (${usage.model ?? 'unknown model'})`,
        ),
      onDisabled: (reason) => warnOnce(logger, reason),
      // Rests end on their own and repeat; a debug line per rest is the
      // honest amount of noise for "the fallback ran for a while".
      onRest: (reason) => logger?.debug?.(reason),
    });
    if (resolved.status !== 'ready') return undefined;
    account = resolved;
    if (!deps.env) accounts.set(id, account);
  }
  return { client: account.client, model: account.model, feature: deps.feature };
}

/** Test seam. Never call from product code. */
export function resetTypeSafeJudgesForTests(): void {
  accounts.clear();
}

/** Run `fn` against the judge, or return `undefined` on any failure. */
export async function askTypeSafeJudge<T>(
  judge: TypeSafeJudge | undefined,
  fn: (judge: TypeSafeJudge) => Promise<T | undefined>,
): Promise<T | undefined> {
  if (!judge) return undefined;
  try {
    return await fn(judge);
  } catch {
    return undefined;
  }
}

/**
 * Resolve a judge from a host DI container: the live config from
 * `TOKENS.ConfigStore`, warnings to `TOKENS.Logger`. For surfaces (TUI,
 * WebUI) that hold an agent but not the config object itself.
 */
export function typeSafeJudgeFromContainer(
  container: { safeResolve(token: unknown): unknown } | undefined,
  feature: TypeSafeJudgmentFeature,
): TypeSafeJudge | undefined {
  if (!container) return undefined;
  try {
    const store = container.safeResolve(TOKENS.ConfigStore) as
      | { get(): Pick<Config, 'typesafe'> }
      | undefined;
    const config = store?.get();
    if (!config) return undefined;
    const logger = container.safeResolve(TOKENS.Logger) as ResolveTypeSafeJudgeDeps['logger'];
    return resolveTypeSafeJudge({ config, feature, logger });
  } catch {
    return undefined;
  }
}
