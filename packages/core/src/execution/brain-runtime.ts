/**
 * BrainRuntime — the live, rebuildable owner of `config.brain`.
 *
 * The Brain chain used to be assembled once at boot; every knob except the
 * risk ceiling and escalation mode was frozen until restart. This module
 * makes the whole `BrainConfig` surface live-editable AND persistable from
 * any host surface (/brain subcommands, TUI Brain panel, WebUI BrainSection):
 *
 *   - `arbiter` is a STABLE delegating handle (`decide` reads a mutable
 *     `current`), so hosts wrap it once in their EscalationRouting/Observable
 *     layers and no consumer ever needs a rebind after a settings change.
 *   - `apply(patch)` normalizes + validates the patch, commits it, rebuilds
 *     the tier chain when a structural knob changed (pool, council, timeout,
 *     ledger guard), and persists through an injected callback — core never
 *     touches config files itself.
 *   - `getSnapshot()` is the JSON-safe truth both UIs render: configured
 *     values plus derived facts (resolved pool/council labels, EFFECTIVE
 *     council enablement, session-model fallback).
 *
 * Persistence contract: `config.brain` is on the in-project deny list, so
 * the injected `persist` MUST write the GLOBAL config. A persist failure
 * never rolls back the live change; it is reported via the returned promise.
 *
 * @module brain-runtime
 */

import {
  type BrainArbiter,
  type BrainDecisionRequest,
  DefaultBrainArbiter,
} from '../coordination/brain.js';
import { BrainDecisionCache, createCachingBrainArbiter } from '../coordination/brain-cache.js';
import {
  type BrainDecisionExplanation,
  explainBrainDecision,
} from '../coordination/brain-explain.js';
import type { BrainHeuristicsConfig } from '../coordination/brain-heuristics.js';
import { createLedgerGuardBrainArbiter } from '../coordination/brain-ledger.js';
import {
  type CompiledBrainRule,
  compileBrainRules,
  createRuleBrainArbiter,
} from '../coordination/brain-rules.js';
import { BrainTierCounter } from '../coordination/brain-telemetry.js';
import { parseModelRef } from '../core/fallback-model.js';
import type { BrainConfig, BrainCouncilVoterConfig, BrainModelEntry } from '../types/config.js';
import { createTieredBrainArbiter } from './autonomy-brain.js';
import { assembleBrainTiers } from './brain-chain.js';
import { BrainCircuitBreaker } from './brain-circuit.js';
import { hasAdaptiveBrainRisk, hasBrainProductDefaults } from './brain-runtime-defaults.js';

export { type BrainDefaultsContext, resolveBrainConfigDefaults } from './brain-runtime-defaults.js';

import { createBrainPersistenceQueue } from './brain-persistence.js';
import {
  AUTO_RISK_LEVELS,
  COUNCIL_DISTINCTNESS,
  COUNCIL_MIN_RISKS,
  DENY_TERMINAL_MODES,
  KNOWN_PATCH_KEYS,
  TERMINAL_POLICIES,
  TRACE_CONTENT_MODES,
} from './brain-runtime-constants.js';
import type {
  BrainConfigPatch,
  BrainConfigSnapshot,
  BrainRuntime,
  BrainRuntimeOptions,
} from './brain-runtime-types.js';
import { createSystemOneBrainTier } from './brain-system-one.js';
import { MAX_COUNCIL_DELIBERATION_ROUNDS } from './council-profiles.js';

function normalizeEntry(raw: string | BrainModelEntry): BrainModelEntry {
  const parsed =
    typeof raw === 'string'
      ? (parseModelRef(raw) as { provider?: string | undefined; model?: string | undefined })
      : raw;
  const model = parsed.model?.trim();
  if (!model) {
    throw new Error(
      `Invalid model ref: ${typeof raw === 'string' ? `"${raw}"` : JSON.stringify(raw)} (expected "model" or "provider/model")`,
    );
  }
  const provider = parsed.provider?.trim();
  return provider ? { provider, model } : { model };
}

function normalizeVoter(raw: string | BrainCouncilVoterConfig): BrainCouncilVoterConfig {
  if (typeof raw === 'string') return normalizeEntry(raw);
  const base = normalizeEntry(raw);
  const voter: BrainCouncilVoterConfig = { ...base };
  if (raw.persona !== undefined) voter.persona = raw.persona;
  if (raw.weight !== undefined) {
    if (!Number.isFinite(raw.weight) || raw.weight <= 0) {
      throw new Error(`Invalid voter weight: ${String(raw.weight)} (must be a positive number)`);
    }
    voter.weight = raw.weight;
  }
  if (raw.veto !== undefined) voter.veto = raw.veto;
  return voter;
}

function requireFraction(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`Invalid ${label}: ${String(value)} (must be in (0, 1])`);
  }
  return value;
}

function requirePositiveMs(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Invalid ${label}: ${String(value)} (must be a positive number of milliseconds)`,
    );
  }
  return Math.round(value);
}

/** Compact a normalized entry to the friendliest lossless config form. */
function compactEntry(entry: BrainModelEntry): string {
  return entry.provider ? `${entry.provider}/${entry.model}` : entry.model;
}

function compactVoter(voter: BrainCouncilVoterConfig): string | BrainCouncilVoterConfig {
  if (voter.persona === undefined && voter.weight === undefined && voter.veto === undefined) {
    return compactEntry(voter);
  }
  return { ...voter };
}

/** Lenient boot-time normalization: bad entries are dropped, not fatal. */
function normalizeInitial(config: BrainConfig | undefined): BrainConfig {
  const cfg: BrainConfig = { ...(config ?? {}) };
  const safe = <T, R>(items: readonly T[] | undefined, map: (item: T) => R): R[] =>
    (items ?? []).flatMap((item) => {
      try {
        return [map(item)];
      } catch {
        return [];
      }
    });
  if (cfg.models) cfg.models = safe(cfg.models, normalizeEntry);
  // Rules are validated at COMPILE time (rebuild), where a bad rule disables
  // only itself and reports through `ruleErrors`. Nothing to drop here — but
  // a non-array from a hand-edited config would break compilation, so guard.
  if (cfg.rules !== undefined && !Array.isArray(cfg.rules)) cfg.rules = undefined;
  if (cfg.council) {
    const council = { ...cfg.council };
    if (council.voters) council.voters = safe(council.voters, normalizeVoter);
    if (council.judge) {
      try {
        council.judge = normalizeEntry(council.judge);
      } catch {
        council.judge = undefined;
      }
    }
    cfg.council = council;
  }
  return cfg;
}

export function createBrainRuntime(opts: BrainRuntimeOptions): BrainRuntime {
  let cfg: BrainConfig = normalizeInitial(opts.initialConfig);
  let adaptiveRisk = hasAdaptiveBrainRisk(opts.initialConfig);
  let poolLabels: string[] = [];
  let councilLabels: string[] = [];
  let judgeLabel: string | undefined;
  let judgeIsVoter = false;
  let circuit: BrainCircuitBreaker | undefined;
  let decisionCache: BrainDecisionCache | undefined;
  let compiledRules: CompiledBrainRule[] = [];
  let peekRule: ReturnType<typeof createRuleBrainArbiter>['peekDecision'] | undefined;
  let ruleErrors: string[] = [];
  let current: BrainArbiter;
  let disposed = false;
  const effectiveMaxAutoRisk = () =>
    adaptiveRisk ? (councilLabels.length > 0 ? 'all' : 'high') : (cfg.maxAutoRisk ?? 'medium');
  const effectiveHumanTimeout = () =>
    cfg.humanTimeoutMs ?? (hasBrainProductDefaults(opts.initialConfig) ? 120_000 : undefined);
  const persistConfig = createBrainPersistenceQueue(opts.persist);
  const tierCounter = new BrainTierCounter();
  const offTierStats = opts.events?.on('brain.tier_transition', (e) => {
    if (e.terminal) {
      tierCounter.record(e.tier);
    }
  });

  // Digest + streak wrappers check the host's live ledger enablement per call
  // so a ledger toggle takes effect without re-plumbing.
  const getDecisionDigest = (request: BrainDecisionRequest): string | undefined => {
    const ledger = opts.ledger;
    if (!ledger?.isEnabled()) return undefined;
    return ledger.getDecisionDigest?.(request);
  };

  function rebuild(): void {
    const breakerCfg = cfg.llm?.circuitBreaker;
    circuit = new BrainCircuitBreaker({
      failureThreshold: breakerCfg?.failureThreshold,
      cooldownMs: breakerCfg?.cooldownMs,
    });
    const tiers = assembleBrainTiers({
      brainConfig: cfg,
      defaultProviderId: opts.defaultProviderId,
      sessionProvider: opts.sessionProvider,
      sessionModel: opts.sessionModel,
      resolveProvider: opts.resolveProvider,
      getDecisionDigest,
      events: opts.events,
      traceContent: cfg.trace?.content === undefined || cfg.trace.content === 'full',
      circuit,
    });
    poolLabels = tiers.poolLabels;
    councilLabels = tiers.councilLabels;
    judgeLabel = tiers.judgeLabel;
    judgeIsVoter = tiers.judgeIsVoter;
    const tiered = createTieredBrainArbiter({
      policy: new DefaultBrainArbiter({ heuristics: cfg.heuristics }),
      autonomous: tiers.autonomous,
      getMaxAutoRisk: effectiveMaxAutoRisk,
      council: tiers.council,
      getCouncilMinRisk: tiers.getCouncilMinRisk,
      // Product default 'when-decided', not the bare-API 'never': the tier
      // distinguishes a model that CONSIDERED the question and refused from a
      // pool that was never reached (`readLlmDenyKind`), and with 'never' that
      // distinction is unreachable — every refusal is discarded, so the LLM
      // tier can express agreement but never disagreement. Infrastructure
      // failures (unavailable / unparseable) still fall through untouched.
      // Same split as `maxAutoRisk`: the raw arbiter stays conservative for
      // callers that wire it directly; the product default lives here.
      getDenyIsTerminal: () => cfg.llm?.denyIsTerminal ?? 'when-decided',
      events: opts.events,
      systemOne: opts.getSystemOneJudge
        ? createSystemOneBrainTier({
            getJudge: opts.getSystemOneJudge,
            getDecisionDigest,
          })
        : undefined,
    });

    // Deterministic rules sit in FRONT of the tiered chain so a configured
    // rule settles the question before the policy/council/LLM ladder runs.
    // Compiled once per rebuild; the arbiter reads the array by reference so
    // there is no per-decision compilation cost.
    const compileResult = compileBrainRules(cfg.rules);
    compiledRules = compileResult.rules;
    ruleErrors = compileResult.errors;
    const ruleArbiter =
      compiledRules.length > 0
        ? createRuleBrainArbiter({
            inner: tiered,
            getRules: () => compiledRules,
            events: opts.events,
          })
        : undefined;
    peekRule = ruleArbiter?.peekDecision;
    const ruled: BrainArbiter = ruleArbiter ?? tiered;

    // Decision cache wraps the tiers but stays INSIDE the ledger guard: a
    // guard denial must always be evaluated against the live failure
    // history, never served from a cache.
    decisionCache?.stop();
    decisionCache = new BrainDecisionCache({
      enabled: cfg.cache?.enabled,
      ttlMs: cfg.cache?.ttlMs,
      maxEntries: cfg.cache?.maxEntries,
      events: opts.events,
    });
    decisionCache.start();
    const cached: BrainArbiter =
      cfg.cache?.enabled === true
        ? createCachingBrainArbiter({ inner: ruled, cache: decisionCache, events: opts.events })
        : ruled;

    // The ledger guard stays OUTERMOST: a guard denial must be terminal, and
    // must not be overridable by a rule that would resurrect the very action
    // the observed failure history condemned.
    const streakFor = opts.ledger?.failureStreakFor;
    current =
      streakFor && opts.ledger?.isEnabled()
        ? createLedgerGuardBrainArbiter({
            inner: cached,
            failureStreakFor: streakFor,
            denyAfter: cfg.ledger?.autoDenyAfterFailures,
            events: opts.events,
          })
        : cached;
  }
  rebuild();

  /** Merge + validate a patch into a NEW config. Throws before any state changes. */
  function mergePatch(patch: BrainConfigPatch): { next: BrainConfig; rebuildNeeded: boolean } {
    const next: BrainConfig = { ...cfg, council: cfg.council ? { ...cfg.council } : undefined };
    let rebuildNeeded = false;
    const structural = (): void => {
      rebuildNeeded = true;
    };

    if (patch.mode !== undefined) {
      if (patch.mode !== 'headless' && patch.mode !== 'interactive') {
        throw new Error(`Invalid mode: ${String(patch.mode)}`);
      }
      next.mode = patch.mode;
    }
    if (patch.maxAutoRisk !== undefined) {
      if (!AUTO_RISK_LEVELS.has(patch.maxAutoRisk)) {
        throw new Error(`Invalid maxAutoRisk: ${String(patch.maxAutoRisk)}`);
      }
      next.maxAutoRisk = patch.maxAutoRisk;
    }
    if (patch.humanTimeoutMs !== undefined) {
      next.humanTimeoutMs =
        patch.humanTimeoutMs === null
          ? undefined
          : patch.humanTimeoutMs === 0
            ? 0
            : requirePositiveMs(patch.humanTimeoutMs, 'humanTimeoutMs');
    }
    if (patch.models !== undefined) {
      next.models = patch.models === null ? undefined : patch.models.map(normalizeEntry);
      structural();
    }
    if (patch.strategy !== undefined) {
      if (
        patch.strategy !== null &&
        patch.strategy !== 'fallback' &&
        patch.strategy !== 'round-robin'
      ) {
        throw new Error(`Invalid strategy: ${String(patch.strategy)}`);
      }
      next.strategy = patch.strategy ?? undefined;
      structural();
    }
    if (patch.decisionTimeoutMs !== undefined) {
      next.decisionTimeoutMs =
        patch.decisionTimeoutMs === null
          ? undefined
          : requirePositiveMs(patch.decisionTimeoutMs, 'decisionTimeoutMs');
      structural();
    }
    if (patch.heuristics !== undefined) {
      if (patch.heuristics === null) {
        next.heuristics = undefined;
      } else {
        const h: BrainHeuristicsConfig = { ...(next.heuristics ?? {}) };
        for (const key of [
          'lowRiskAutoAnswer',
          'blockedResolved',
          'deadlockSkip',
          'retryExhausted',
          'continuePing',
        ] as const) {
          const value = patch.heuristics[key];
          if (value === undefined) continue;
          if (typeof value !== 'boolean') {
            throw new Error(`Invalid heuristics.${key}: expected a boolean`);
          }
          h[key] = value;
        }
        if (patch.heuristics.blockedResolvedMarkers !== undefined) {
          const markers = patch.heuristics.blockedResolvedMarkers;
          if (markers !== null && !Array.isArray(markers)) {
            throw new Error('Invalid heuristics.blockedResolvedMarkers: expected an array');
          }
          h.blockedResolvedMarkers = markers ?? undefined;
        }
        next.heuristics = h;
      }
      structural();
    }
    if (patch.rules !== undefined) {
      if (patch.rules === null) {
        next.rules = undefined;
      } else {
        if (!Array.isArray(patch.rules)) throw new Error('Invalid rules: expected an array');
        // apply() is STRICT where boot is lenient: an interactive edit that
        // silently dropped half its rules would be worse than a clear error.
        const { errors } = compileBrainRules(patch.rules);
        if (errors.length > 0) {
          throw new Error(`Invalid Brain rule(s): ${errors.join('; ')}`);
        }
        next.rules = [...patch.rules];
      }
      structural();
    }
    if (patch.council !== undefined) {
      if (patch.council === null) {
        next.council = undefined;
      } else {
        const c = { ...(next.council ?? {}) };
        const p = patch.council;
        if (p.enabled !== undefined) c.enabled = p.enabled === null ? undefined : p.enabled;
        if (p.minRisk !== undefined) {
          if (p.minRisk !== null && !COUNCIL_MIN_RISKS.has(p.minRisk)) {
            throw new Error(`Invalid council minRisk: ${String(p.minRisk)}`);
          }
          c.minRisk = p.minRisk ?? undefined;
        }
        if (p.voters !== undefined) {
          c.voters = p.voters === null ? undefined : p.voters.map(normalizeVoter);
        }
        if (p.quorum !== undefined) {
          c.quorum = p.quorum === null ? undefined : requireFraction(p.quorum, 'council quorum');
        }
        if (p.approval !== undefined) {
          c.approval =
            p.approval === null ? undefined : requireFraction(p.approval, 'council approval');
        }
        if (p.judge !== undefined) {
          c.judge = p.judge === null ? undefined : normalizeEntry(p.judge);
        }
        for (const key of [
          'perCallTimeoutMs',
          'maxConcurrency',
          'voterMaxTokens',
          'judgeMaxTokens',
          'deliberationRounds',
        ] as const) {
          const v = p[key];
          if (v === undefined) continue;
          if (v !== null && (!Number.isInteger(v) || v <= 0)) {
            throw new Error(`Invalid council.${key}: ${String(v)} (must be a positive integer)`);
          }
          // Every round costs one provider call PER SEAT and blocks the
          // decision for its whole duration; an unbounded value from config
          // would turn one decision into an open-ended debate.
          if (key === 'deliberationRounds' && v !== null && v > MAX_COUNCIL_DELIBERATION_ROUNDS) {
            throw new Error(
              `Invalid council.deliberationRounds: ${String(v)} (max ${MAX_COUNCIL_DELIBERATION_ROUNDS})`,
            );
          }
          c[key] = v ?? undefined;
        }
        if (p.distinctness !== undefined) {
          if (p.distinctness !== null && !COUNCIL_DISTINCTNESS.has(p.distinctness)) {
            throw new Error(`Invalid council.distinctness: ${String(p.distinctness)}`);
          }
          c.distinctness = p.distinctness ?? undefined;
        }
        if (p.seats !== undefined) {
          if (p.seats === null) {
            c.seats = undefined;
          } else {
            if (!Array.isArray(p.seats))
              throw new Error('Invalid council.seats: expected an array');
            for (const seat of p.seats) {
              if (!seat?.persona?.trim()) {
                throw new Error('Invalid council.seats: every seat needs a persona');
              }
            }
            c.seats = p.seats.map((seat) => ({ ...seat }));
          }
        }
        next.council = c;
      }
      structural();
    }
    if (patch.terminalPolicy !== undefined) {
      if (patch.terminalPolicy !== null && !TERMINAL_POLICIES.has(patch.terminalPolicy)) {
        throw new Error(`Invalid terminalPolicy: ${String(patch.terminalPolicy)}`);
      }
      next.terminalPolicy = patch.terminalPolicy ?? undefined;
    }
    if (patch.decisionLogMaxEntries !== undefined) {
      const n = patch.decisionLogMaxEntries;
      if (n !== null && (!Number.isInteger(n) || n <= 0)) {
        throw new Error(`Invalid decisionLogMaxEntries: ${String(n)} (must be a positive integer)`);
      }
      next.decisionLogMaxEntries = n ?? undefined;
    }
    if (patch.cache !== undefined) {
      if (patch.cache === null) {
        next.cache = undefined;
      } else {
        const c = { ...(next.cache ?? {}) };
        if (patch.cache.enabled !== undefined) {
          if (typeof patch.cache.enabled !== 'boolean') {
            throw new Error('Invalid cache.enabled: expected a boolean');
          }
          c.enabled = patch.cache.enabled;
        }
        for (const key of ['ttlMs', 'maxEntries'] as const) {
          const v = patch.cache[key];
          if (v === undefined) continue;
          if (!Number.isInteger(v) || v <= 0) {
            throw new Error(`Invalid cache.${key}: ${String(v)} (must be a positive integer)`);
          }
          c[key] = v;
        }
        next.cache = c;
      }
      structural();
    }
    if (patch.llm !== undefined) {
      if (patch.llm === null) {
        next.llm = undefined;
      } else {
        const l = { ...(next.llm ?? {}) };
        if (patch.llm.maxTokens === null) {
          delete l.maxTokens;
        } else if (patch.llm.maxTokens !== undefined) {
          const n = patch.llm.maxTokens;
          if (!Number.isInteger(n) || n <= 0) {
            throw new Error(`Invalid llm.maxTokens: ${String(n)} (must be a positive integer)`);
          }
          l.maxTokens = n;
        }
        if (patch.llm.rejectUncertain !== undefined) {
          if (typeof patch.llm.rejectUncertain !== 'boolean') {
            throw new Error('Invalid llm.rejectUncertain: expected a boolean');
          }
          l.rejectUncertain = patch.llm.rejectUncertain;
        }
        if (patch.llm.denyIsTerminal !== undefined) {
          if (!DENY_TERMINAL_MODES.has(patch.llm.denyIsTerminal)) {
            throw new Error(`Invalid llm.denyIsTerminal: ${String(patch.llm.denyIsTerminal)}`);
          }
          l.denyIsTerminal = patch.llm.denyIsTerminal;
        }
        if (patch.llm.minConfidence !== undefined) {
          const n = patch.llm.minConfidence;
          if (!Number.isFinite(n) || n < 0 || n > 1) {
            throw new Error(`Invalid llm.minConfidence: ${String(n)} (must be in [0, 1])`);
          }
          l.minConfidence = n;
        }
        next.llm = l;
      }
      structural();
    }
    if (patch.trace !== undefined) {
      if (patch.trace === null) {
        next.trace = undefined;
      } else {
        const t = { ...(next.trace ?? {}) };
        if (patch.trace.enabled !== undefined) {
          if (typeof patch.trace.enabled !== 'boolean') {
            throw new Error('Invalid trace.enabled: expected a boolean');
          }
          t.enabled = patch.trace.enabled;
        }
        if (patch.trace.content !== undefined) {
          if (!TRACE_CONTENT_MODES.has(patch.trace.content)) {
            throw new Error(`Invalid trace.content: ${String(patch.trace.content)}`);
          }
          t.content = patch.trace.content;
        }
        if (patch.trace.path !== undefined) t.path = patch.trace.path || undefined;
        if (patch.trace.maxOpenRecords !== undefined) {
          const n = patch.trace.maxOpenRecords;
          if (!Number.isInteger(n) || n <= 0) {
            throw new Error(
              `Invalid trace.maxOpenRecords: ${String(n)} (must be a positive integer)`,
            );
          }
          t.maxOpenRecords = n;
        }
        next.trace = t;
      }
      structural();
    }
    if (patch.monitor !== undefined) {
      next.monitor =
        patch.monitor === null ? undefined : { ...(next.monitor ?? {}), ...patch.monitor };
      structural();
    }
    if (patch.ledger !== undefined) {
      if (patch.ledger === null) {
        next.ledger = undefined;
      } else {
        const l = { ...(next.ledger ?? {}) };
        if (patch.ledger.enabled !== undefined) {
          if (typeof patch.ledger.enabled !== 'boolean')
            throw new Error('Invalid ledger.enabled: expected a boolean');
          l.enabled = patch.ledger.enabled;
        }
        if (patch.ledger.autoDenyAfterFailures !== undefined) {
          const n = patch.ledger.autoDenyAfterFailures;
          if (n !== null && (!Number.isInteger(n) || n < 0)) {
            throw new Error(
              `Invalid autoDenyAfterFailures: ${String(n)} (must be an integer >= 0)`,
            );
          }
          l.autoDenyAfterFailures = n ?? undefined;
        }
        for (const key of ['maxMemoryEntries', 'interventionRetryWindowMs'] as const) {
          const v = patch.ledger[key];
          if (v === undefined) continue;
          if (v !== null && (!Number.isInteger(v) || v <= 0)) {
            throw new Error(`Invalid ledger.${key}: ${String(v)} (must be a positive integer)`);
          }
          l[key] = v ?? undefined;
        }
        next.ledger = l;
      }
      structural();
    }

    // Structural keys already flagged themselves above; anything not covered
    // by either key set is a typo or a field that was added to the patch type
    // without being registered here, and must fail loudly.
    for (const key of Object.keys(patch)) {
      if ((patch as Record<string, unknown>)[key] === undefined) continue;
      if (!KNOWN_PATCH_KEYS.has(key)) {
        throw new Error(`Unknown brain config field: ${key}`);
      }
    }
    return { next, rebuildNeeded };
  }

  function getSnapshot(): BrainConfigSnapshot {
    const councilCfg = cfg.council;
    const voters = (councilCfg?.voters ?? []).map((v) => normalizeVoter(v));
    return {
      mode: cfg.mode ?? 'interactive',
      maxAutoRisk: effectiveMaxAutoRisk(),
      models: (cfg.models ?? []).map((m) => normalizeEntry(m)),
      strategy: cfg.strategy ?? 'fallback',
      decisionTimeoutMs: cfg.decisionTimeoutMs,
      humanTimeoutMs: effectiveHumanTimeout(),
      council: {
        enabled: councilLabels.length > 0,
        configured: councilCfg?.enabled,
        minRisk: councilCfg?.minRisk ?? 'high',
        voters,
        quorum: councilCfg?.quorum,
        approval: councilCfg?.approval,
        judge: councilCfg?.judge ? normalizeEntry(councilCfg.judge) : undefined,
        perCallTimeoutMs: councilCfg?.perCallTimeoutMs,
        maxConcurrency: councilCfg?.maxConcurrency,
        distinctness: councilCfg?.distinctness ?? 'none',
        voterMaxTokens: councilCfg?.voterMaxTokens,
        judgeMaxTokens: councilCfg?.judgeMaxTokens,
        deliberationRounds: councilCfg?.deliberationRounds,
        seats: (councilCfg?.seats ?? []).map((seat) => ({ ...seat })),
      },
      ledger: {
        enabled: opts.ledger?.isEnabled() ?? false,
        autoDenyAfterFailures: cfg.ledger?.autoDenyAfterFailures,
        path: opts.ledger?.getPath(),
        maxMemoryEntries: cfg.ledger?.maxMemoryEntries,
        interventionRetryWindowMs: cfg.ledger?.interventionRetryWindowMs,
      },
      rules: (cfg.rules ?? []).map((rule) => ({ ...rule })),
      llm: {
        maxTokens: cfg.llm?.maxTokens,
        rejectUncertain: cfg.llm?.rejectUncertain ?? true,
        minConfidence: cfg.llm?.minConfidence ?? 0,
        denyIsTerminal: cfg.llm?.denyIsTerminal ?? 'when-decided',
      },
      trace: {
        enabled: cfg.trace?.enabled === true,
        content: cfg.trace?.content ?? 'full',
        path: cfg.trace?.path,
      },
      monitor: { ...(cfg.monitor ?? {}) },
      terminalPolicy: cfg.terminalPolicy ?? 'conservative',
      decisionLogMaxEntries: cfg.decisionLogMaxEntries ?? 20,
      circuit: circuit
        ? {
            state: circuit.state(),
            consecutiveFailures: circuit.snapshot().consecutiveFailures,
          }
        : undefined,
      cache: {
        enabled: cfg.cache?.enabled === true,
        ttlMs: cfg.cache?.ttlMs ?? 300_000,
        maxEntries: cfg.cache?.maxEntries ?? 200,
        hits: decisionCache?.snapshot().hits ?? 0,
        misses: decisionCache?.snapshot().misses ?? 0,
        size: decisionCache?.snapshot().size ?? 0,
      },
      heuristics: {
        lowRiskAutoAnswer: cfg.heuristics?.lowRiskAutoAnswer ?? true,
        blockedResolved: cfg.heuristics?.blockedResolved ?? true,
        deadlockSkip: cfg.heuristics?.deadlockSkip ?? true,
        retryExhausted: cfg.heuristics?.retryExhausted ?? true,
        continuePing: cfg.heuristics?.continuePing ?? true,
        blockedResolvedMarkers: cfg.heuristics?.blockedResolvedMarkers
          ? [...cfg.heuristics.blockedResolvedMarkers]
          : undefined,
      },
      ruleErrors: [...ruleErrors],
      poolLabels: [...poolLabels],
      councilLabels: [...councilLabels],
      judgeLabel,
      judgeIsVoter,
      usingSessionModel: poolLabels.length === 0,
      tierStats: tierCounter.snapshot(),
    };
  }

  function getConfig(): BrainConfig {
    const out: BrainConfig = {};
    if (cfg.mode !== undefined) out.mode = cfg.mode;
    if (!adaptiveRisk && cfg.maxAutoRisk !== undefined) out.maxAutoRisk = cfg.maxAutoRisk;
    if (cfg.models?.length) out.models = cfg.models.map((m) => compactEntry(normalizeEntry(m)));
    if (cfg.strategy !== undefined) out.strategy = cfg.strategy;
    if (cfg.decisionTimeoutMs !== undefined) out.decisionTimeoutMs = cfg.decisionTimeoutMs;
    if (cfg.humanTimeoutMs !== undefined) out.humanTimeoutMs = cfg.humanTimeoutMs;
    if (cfg.council !== undefined) {
      const c = cfg.council;
      const outCouncil: NonNullable<BrainConfig['council']> = {};
      if (c.enabled !== undefined) outCouncil.enabled = c.enabled;
      if (c.minRisk !== undefined) outCouncil.minRisk = c.minRisk;
      if (c.voters?.length)
        outCouncil.voters = c.voters.map((v) => compactVoter(normalizeVoter(v)));
      if (c.quorum !== undefined) outCouncil.quorum = c.quorum;
      if (c.approval !== undefined) outCouncil.approval = c.approval;
      if (c.judge !== undefined) outCouncil.judge = compactEntry(normalizeEntry(c.judge));
      // Same rule as the top level: a field missing here is DELETED from the
      // user's config on the next apply(). Guarded by brain-config-roundtrip.
      if (c.perCallTimeoutMs !== undefined) outCouncil.perCallTimeoutMs = c.perCallTimeoutMs;
      if (c.maxConcurrency !== undefined) outCouncil.maxConcurrency = c.maxConcurrency;
      if (c.distinctness !== undefined) outCouncil.distinctness = c.distinctness;
      if (c.voterMaxTokens !== undefined) outCouncil.voterMaxTokens = c.voterMaxTokens;
      if (c.judgeMaxTokens !== undefined) outCouncil.judgeMaxTokens = c.judgeMaxTokens;
      if (c.deliberationRounds !== undefined) outCouncil.deliberationRounds = c.deliberationRounds;
      if (c.seats?.length) outCouncil.seats = c.seats.map((seat) => ({ ...seat }));
      out.council = outCouncil;
    }
    if (cfg.rules?.length) out.rules = cfg.rules.map((rule) => ({ ...rule }));
    if (cfg.heuristics !== undefined) out.heuristics = { ...cfg.heuristics };
    if (cfg.ledger !== undefined) out.ledger = { ...cfg.ledger };
    if (cfg.monitor !== undefined) out.monitor = { ...cfg.monitor };
    // Blocks that are boot-only (no patch surface yet) must STILL be copied:
    // `apply()` persists this object wholesale, so a field missing here is
    // silently deleted from the user's config the next time any Brain
    // setting changes. `brain-config-roundtrip` guards this.
    if (cfg.trace !== undefined) out.trace = { ...cfg.trace };
    if (cfg.llm !== undefined) out.llm = { ...cfg.llm };
    if (cfg.cache !== undefined) out.cache = { ...cfg.cache };
    if (cfg.terminalPolicy !== undefined) out.terminalPolicy = cfg.terminalPolicy;
    if (cfg.decisionLogMaxEntries !== undefined) {
      out.decisionLogMaxEntries = cfg.decisionLogMaxEntries;
    }
    return out;
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      offTierStats?.();
      decisionCache?.stop();
    },
    arbiter: {
      async decide(request) {
        if (disposed) return { type: 'deny', reason: 'Brain runtime disposed.' };
        const decision = await current.decide(request);
        return disposed ? { type: 'deny', reason: 'Brain runtime disposed.' } : decision;
      },
    },
    getMode: () => cfg.mode ?? 'interactive',
    getMaxAutoRisk: effectiveMaxAutoRisk,
    getHumanTimeoutMs: effectiveHumanTimeout,
    getSnapshot,
    getConfig,
    apply(patch, applyOpts) {
      if (disposed) throw new Error('Brain runtime disposed.');
      const { next, rebuildNeeded } = mergePatch(patch);
      if (patch.maxAutoRisk !== undefined) adaptiveRisk = false;
      cfg = next;
      // Ledger enablement is host-owned state — toggle it BEFORE rebuilding
      // so the guard wrap sees the new value.
      if (
        patch.ledger !== undefined &&
        (patch.ledger === null || patch.ledger.enabled !== undefined)
      ) {
        opts.ledger?.setEnabled(patch.ledger?.enabled ?? true);
      }
      if (rebuildNeeded) rebuild();
      else decisionCache?.clear();
      const snapshot = getSnapshot();
      const persisted =
        applyOpts?.persist === false ? Promise.resolve({ ok: true }) : persistConfig(getConfig());
      opts.onApplied?.(snapshot);
      return { snapshot, persisted };
    },
    explain(request: BrainDecisionRequest): BrainDecisionExplanation {
      let systemOneEnabled = false;
      if ((request.options?.length ?? 0) > 1) {
        try {
          const judge = opts.getSystemOneJudge?.();
          systemOneEnabled = judge !== undefined && judge.unavailableReason === undefined;
        } catch {
          /* An unavailable account defers, as in real arbitration. */
        }
      }
      return explainBrainDecision(request, {
        ledger: opts.ledger,
        ledgerAutoDenyAfterFailures: cfg.ledger?.autoDenyAfterFailures,
        cache: decisionCache,
        rules: compiledRules,
        peekRule,
        systemOneEnabled,
        llmCircuitOpen: circuit ? !circuit.canAttempt() : false,
        llmDenyIsTerminal: cfg.llm?.denyIsTerminal ?? 'when-decided',
        heuristics: cfg.heuristics,
        maxAutoRisk: effectiveMaxAutoRisk(),
        council: {
          enabled: councilLabels.length > 0,
          minRisk: cfg.council?.minRisk ?? 'high',
        },
        mode: cfg.mode ?? 'interactive',
        terminalPolicy: cfg.terminalPolicy ?? 'conservative',
      });
    },
    getTierStats: () => tierCounter.snapshot(),
  };
}
export type {
  BrainApplyResult,
  BrainConfigPatch,
  BrainConfigSnapshot,
  BrainCouncilMinRisk,
  BrainCouncilPatch,
  BrainPoolStrategy,
  BrainRuntime,
  BrainRuntimeLedgerHost,
  BrainRuntimeOptions,
} from './brain-runtime-types.js';
