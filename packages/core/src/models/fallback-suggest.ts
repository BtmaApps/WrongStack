/**
 * Fallback profile suggestions — turns the models the user can actually reach
 * (keyed providers × their catalog) into ready-made fallback chains such as
 * "strong", "balanced", "fast" and "budget".
 *
 * Two stages, both pure:
 *
 *   1. {@link suggestFallbackProfiles} — deterministic scoring from catalog
 *      facts (price, reasoning, release date, context window) plus family
 *      name hints (`opus`/`pro` vs `mini`/`flash`). Never calls a model, so it
 *      always produces an answer, including offline.
 *   2. {@link buildFallbackSuggestPrompt} + {@link mergeLlmFallbackSuggestions}
 *      — an optional LLM pass that re-ranks the SAME candidate pool using what
 *      the model knows about benchmark standing and agentic reliability. The
 *      LLM may only reorder refs it was shown: an unknown ref drops the whole
 *      LLM profile back to the heuristic one, so a hallucinated model id can
 *      never reach config.
 *
 * Price is a strength proxy only among PAID models. Subscription and local
 * providers often report 0 or no price at all; those fall back to name hints,
 * reasoning and recency instead of being read as "weakest" (see the unknown-
 * price rule in coordination/model-tier.ts — unknown skips a signal, it never
 * zeroes it).
 */

/** One reachable model, as the WebUI `provider.models` projection carries it. */
export interface FallbackSuggestCandidate {
  /** Saved provider id (the auth profile alias, e.g. `openai`, `custom-2`). */
  provider: string;
  model: string;
  name?: string | undefined;
  /** ISO date (`2025-05-14`) or year-month. */
  releaseDate?: string | undefined;
  contextWindow?: number | undefined;
  maxOutput?: number | undefined;
  /** USD per 1M input tokens. */
  inputCost?: number | undefined;
  /** USD per 1M output tokens. */
  outputCost?: number | undefined;
  /** `tools`, `reasoning`, `vision`, ... — empty/absent means undocumented. */
  capabilities?: readonly string[] | undefined;
  /** models.dev lifecycle marker: `deprecated` is dropped, `beta` is demoted. */
  status?: string | undefined;
  /** models.dev version line (`minimax`, `glm`, `claude-opus`) — see `dropSuperseded`. */
  family?: string | undefined;
}

export const FALLBACK_SUGGESTION_IDS = ['strong', 'balanced', 'fast', 'budget'] as const;
export type FallbackSuggestionId = (typeof FALLBACK_SUGGESTION_IDS)[number];

export interface FallbackSuggestionEntry {
  /** `provider/model` — the exact string a fallback chain stores. */
  ref: string;
  provider: string;
  model: string;
  name: string;
  /** 0..1 — estimated capability. */
  strength: number;
  /** 0..1 — estimated latency/throughput advantage. */
  speed: number;
  /** 0..1 — 1 = free or cheapest in the pool; 0.5 when price is unknown. */
  cheapness: number;
  contextWindow?: number | undefined;
  inputCost?: number | undefined;
  outputCost?: number | undefined;
  releaseDate?: string | undefined;
  reasoning: boolean;
  /** Beta / preview / free-tier model — shown with a caution badge. */
  unstable: boolean;
}

export interface FallbackSuggestion {
  id: FallbackSuggestionId;
  /** The chain, primary first — what a fallback profile stores verbatim. */
  chain: string[];
  entries: FallbackSuggestionEntry[];
  /** Mean archetype score of the chain, 0..1. */
  score: number;
  /** Distinct providers in the chain — the resilience a 429 on one key needs. */
  providerCount: number;
  source: 'heuristic' | 'llm';
  /** Free-text reason; only the LLM pass fills it. */
  rationale?: string | undefined;
}

export interface SuggestFallbackOptions {
  /** Models per chain (clamped 2..6). Default 4. */
  chainLength?: number | undefined;
  /**
   * Drop models released more than this many months before the NEWEST model
   * in the pool. Default {@link DEFAULT_MAX_AGE_MONTHS}; 0 disables.
   */
  maxAgeMonths?: number | undefined;
  /** Restrict the output to these archetypes, in this order. */
  ids?: readonly FallbackSuggestionId[] | undefined;
}

export interface ScoredFallbackCandidate {
  candidate: FallbackSuggestCandidate;
  ref: string;
  /** Provider-local family line (see `familyLine`) — one per chain. */
  line: string;
  strength: number;
  speed: number;
  cheapness: number;
  reasoning: boolean;
  /** Beta / preview / free-tier promo: works, but a poor bet for a fallback. */
  unstable: boolean;
}

/**
 * Suggestions are only as good as they are current: a chain built today must
 * not fall back to last year's generation just because it is still listed.
 * Measured against the newest model in the user's OWN pool, not the wall
 * clock — a stale catalog cache must not empty the suggestions.
 */
export const DEFAULT_MAX_AGE_MONTHS = 6;
/** Score subtracted from beta / preview / free models in every archetype. */
const UNSTABLE_PENALTY = 0.3;

/** Archetype weights over (strength, speed, cheapness). */
const ARCHETYPE_WEIGHTS: Record<FallbackSuggestionId, [number, number, number]> = {
  strong: [1, 0, 0],
  balanced: [0.6, 0.2, 0.2],
  fast: [0.25, 0.65, 0.1],
  budget: [0.25, 0.15, 0.6],
};

/**
 * Minimum strength each archetype tolerates before its score is docked by the
 * shortfall. Without it "balanced" opened with the cheapest nano model: speed
 * and price alone can outvote a model that cannot finish the task.
 */
const ARCHETYPE_STRENGTH_FLOOR: Record<FallbackSuggestionId, number> = {
  strong: 0,
  balanced: 0.45,
  fast: 0.3,
  budget: 0.25,
};

/** Score subtracted when a pick reuses a provider already in the chain. */
const SAME_PROVIDER_PENALTY = 0.12;
/** Below this context window a model cannot hold an agent turn. */
const MIN_CONTEXT_WINDOW = 16_000;

/**
 * Ids that are not chat/agent models even when a catalog lists them under a
 * chat provider: embeddings, speech, image generation, moderation, rerankers.
 */
const NON_AGENT_MODEL =
  /(embed|tts|whisper|transcri|speech|moderation|dall-?e|imagen|rerank|realtime|(^|[-_/.])image([-_.]|$)|(^|[-_/.])audio([-_.]|$))/i;

/**
 * Family size hints, matched as WHOLE id tokens: a substring test reads the
 * `MiniMax-M2` brand as both "mini" and "max". Lighter hints win over heavier
 * ones, so `o4-mini` is light even though `o4` alone is heavy.
 */
const ULTRA_LIGHT_TOKENS = new Set(['nano', 'tiny', 'lite', 'micro']);
const LIGHT_TOKENS = new Set(['mini', 'flash', 'haiku', 'small', 'instant', 'air', 'spark']);
/**
 * Same model, faster serving (`glm-5.3-highspeed`, `grok-code-fast-1`): a speed
 * signal that must NOT also mark the model as weaker.
 */
const SPEED_ONLY_TOKENS = new Set(['highspeed', 'fast', 'turbo', 'speed', 'lightning']);
const UNSTABLE_TOKENS = new Set(['preview', 'exp', 'experimental', 'beta', 'alpha', 'free']);
const HEAVY_TOKENS = new Set([
  'opus',
  'pro',
  'max',
  'ultra',
  'large',
  'o1',
  'o3',
  'thinking',
  'reasoner',
  'r1',
  'plus',
]);

type SizeHint = 'ultralight' | 'light' | 'neutral' | 'heavy';

function idTokens(id: string): string[] {
  return id.toLowerCase().split(/[-_/.:@\s]+/u);
}

function sizeHint(id: string): SizeHint {
  const tokens = idTokens(id);
  let params: number | undefined;
  for (const token of tokens) {
    // `a3b` / `a22b` are MoE ACTIVE params — total size is the other token.
    const m = /^(\d+(?:\.\d+)?)b$/u.exec(token);
    if (m) params = Math.max(params ?? 0, Number(m[1]));
  }
  if (tokens.some((t) => ULTRA_LIGHT_TOKENS.has(t)) || (params !== undefined && params <= 4)) {
    return 'ultralight';
  }
  if (tokens.some((t) => LIGHT_TOKENS.has(t)) || (params !== undefined && params <= 32)) {
    return 'light';
  }
  if (tokens.some((t) => HEAVY_TOKENS.has(t)) || (params !== undefined && params >= 200)) {
    return 'heavy';
  }
  return 'neutral';
}

const HINT_STRENGTH: Record<SizeHint, number> = {
  ultralight: 0,
  light: 0.2,
  neutral: 0.55,
  heavy: 1,
};
const HINT_SPEED: Record<SizeHint, number> = {
  ultralight: 1,
  light: 0.85,
  neutral: 0.5,
  heavy: 0.15,
};

export function formatFallbackRef(provider: string, model: string): string {
  return `${provider}/${model}`;
}

/**
 * Blended $/1M with agent traffic in mind: input-heavy (history re-sent every
 * turn), output smaller. Undefined when the catalog prices neither side.
 */
function blendedPrice(c: FallbackSuggestCandidate): number | undefined {
  const input = finiteOrUndefined(c.inputCost);
  const output = finiteOrUndefined(c.outputCost);
  if (input === undefined && output === undefined) return undefined;
  if (input === undefined) return output;
  if (output === undefined) return input;
  return (3 * input + output) / 4;
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function releaseTime(c: FallbackSuggestCandidate): number | undefined {
  if (!c.releaseDate) return undefined;
  const t = Date.parse(c.releaseDate.length === 7 ? `${c.releaseDate}-01` : c.releaseDate);
  return Number.isFinite(t) ? t : undefined;
}

/** Fraction of `sorted` strictly below `value`, tie-adjusted, in 0..1. */
function percentile(sorted: readonly number[], value: number): number {
  if (sorted.length <= 1) return 0.5;
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return (below + Math.max(0, equal - 1) / 2) / (sorted.length - 1);
}

function weightedMean(parts: Array<[value: number | undefined, weight: number]>): number {
  let sum = 0;
  let weight = 0;
  for (const [value, w] of parts) {
    if (value === undefined) continue;
    sum += value * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0.5;
}

/** True when the model can plausibly drive an agent turn (tools + context). */
export function isFallbackEligible(c: FallbackSuggestCandidate): boolean {
  if (c.status === 'deprecated') return false;
  if (NON_AGENT_MODEL.test(c.model)) return false;
  const caps = c.capabilities ?? [];
  // Undocumented capabilities stay eligible (custom/local providers); a
  // catalog that documents capabilities WITHOUT tools rules the model out.
  if (caps.length > 0 && !caps.includes('tools')) return false;
  if (typeof c.contextWindow === 'number' && c.contextWindow > 0) {
    if (c.contextWindow < MIN_CONTEXT_WINDOW) return false;
  }
  return true;
}

/** Score every eligible candidate. Exported for the LLM pool and for tests. */
export function scoreFallbackCandidates(
  candidates: readonly FallbackSuggestCandidate[],
  options: Pick<SuggestFallbackOptions, 'maxAgeMonths'> = {},
): ScoredFallbackCandidate[] {
  const seen = new Set<string>();
  const unique: FallbackSuggestCandidate[] = [];
  for (const c of candidates) {
    if (!c.provider || !c.model || !isFallbackEligible(c)) continue;
    const ref = formatFallbackRef(c.provider, c.model);
    if (seen.has(ref)) continue;
    seen.add(ref);
    unique.push(c);
  }
  const eligible = dropOutdated(unique, options.maxAgeMonths ?? DEFAULT_MAX_AGE_MONTHS);

  const paidPrices = eligible
    .map(blendedPrice)
    .filter((p): p is number => p !== undefined && p > 0)
    .sort((a, b) => a - b);
  const releases = eligible
    .map(releaseTime)
    .filter((t): t is number => t !== undefined)
    .sort((a, b) => a - b);
  const contexts = eligible
    .map((c) => c.contextWindow)
    .filter((n): n is number => typeof n === 'number' && n > 0)
    .sort((a, b) => a - b);

  return eligible.map((c) => {
    const hint = sizeHint(c.model);
    const tokens = idTokens(c.model);
    const speedOnly = tokens.some((t) => SPEED_ONLY_TOKENS.has(t));
    const unstable = isUnstable(c);
    const caps = c.capabilities ?? [];
    const reasoning = caps.includes('reasoning');
    const price = blendedPrice(c);
    const pricePct = price !== undefined && price > 0 ? percentile(paidPrices, price) : undefined;
    const release = releaseTime(c);
    const recencyPct = release !== undefined ? percentile(releases, release) : undefined;
    const contextPct =
      typeof c.contextWindow === 'number' && c.contextWindow > 0
        ? percentile(contexts, c.contextWindow)
        : undefined;

    const strength = weightedMean([
      [pricePct, 0.35],
      [HINT_STRENGTH[hint], 0.3],
      [caps.length > 0 ? (reasoning ? 1 : 0) : undefined, 0.15],
      [recencyPct, 0.15],
      [contextPct, 0.05],
    ]);
    const speed = clamp01(
      weightedMean([
        [speedOnly ? Math.max(HINT_SPEED[hint], 0.85) : HINT_SPEED[hint], 0.7],
        [pricePct !== undefined ? 1 - pricePct : undefined, 0.3],
      ]) - (reasoning && hint !== 'light' && hint !== 'ultralight' ? 0.1 : 0),
    );
    const cheapness = price === undefined ? 0.5 : price === 0 ? 1 : 1 - (pricePct ?? 0.5);

    return {
      candidate: c,
      ref: formatFallbackRef(c.provider, c.model),
      line: familyLine(c),
      strength: round3(strength),
      speed: round3(speed),
      cheapness: round3(cheapness),
      reasoning,
      unstable,
    };
  });
}

/**
 * Two currency rules, applied before any scoring:
 *
 *  1. Superseded versions go. Within one provider and one models.dev
 *     `family` (`minimax`, `glm`, `claude-opus`), only the highest version
 *     survives: `MiniMax-M3` retires `MiniMax-M2.7` AND `MiniMax-M2.7-highspeed`,
 *     `glm-5.3` retires `glm-5.2`. A newer version that exists only as a
 *     preview/beta does not retire the stable one — both stay, and the
 *     unstable one is demoted at scoring time.
 *  2. Stale models go: released more than `maxAgeMonths` before the newest
 *     dated model in the pool (the pool, not the wall clock — a stale catalog
 *     cache must not empty the suggestions).
 *
 * Models with no parseable version or no date are kept by the respective
 * rule: an unknown is not evidence of age.
 */
function dropOutdated(
  pool: readonly FallbackSuggestCandidate[],
  maxAgeMonths: number,
): FallbackSuggestCandidate[] {
  const current = dropSuperseded(pool);
  if (!(maxAgeMonths > 0)) return current;
  let newest: number | undefined;
  for (const c of current) {
    const t = releaseTime(c);
    if (t !== undefined && (newest === undefined || t > newest)) newest = t;
  }
  if (newest === undefined) return current;
  const cutoff = new Date(newest);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - maxAgeMonths);
  const cutoffTime = cutoff.getTime();
  return current.filter((c) => {
    const t = releaseTime(c);
    return t === undefined || t >= cutoffTime;
  });
}

function dropSuperseded(pool: readonly FallbackSuggestCandidate[]): FallbackSuggestCandidate[] {
  // Highest STABLE version per version line; unstable versions only count
  // when the line has no stable release at all.
  const best = new Map<string, { version: number[]; stable: boolean }>();
  for (const c of pool) {
    const version = modelVersion(c.model);
    if (!version) continue;
    const line = versionLine(c);
    const stable = !isUnstable(c);
    const prev = best.get(line);
    if (
      !prev ||
      (stable && !prev.stable) ||
      (stable === prev.stable && compareVersions(version, prev.version) > 0)
    ) {
      best.set(line, { version, stable });
    }
  }
  const sameLine = pool.filter((c) => {
    const version = modelVersion(c.model);
    const top = version ? best.get(versionLine(c)) : undefined;
    if (!version || !top) return true;
    const cmp = compareVersions(version, top.version);
    // Same version (variants: -highspeed, -flash) stays; a NEWER unstable
    // version stays beside the stable one; everything older goes.
    return cmp === 0 || (cmp > 0 && isUnstable(c));
  });
  return dropPreviousGenerations(sameLine);
}

/** A previous major generation must also be this much older to be dropped. */
const GENERATION_GAP_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * models.dev splits one vendor's lineup into several families (`gpt-sol`,
 * `gpt-luna`, `gpt-pro`), so the family rule alone kept `gpt-5.5-pro` next
 * to the provider's gpt-6 models. Across a provider's models of ONE vendor
 * (`gpt`, `claude`, `qwen`, `glm`), a stable model whose MAJOR version is
 * below the newest stable generation's — and that was released at least
 * {@link GENERATION_GAP_MS} before it — is a previous generation and goes.
 * The date gap keeps vendors whose product lines number independently from
 * losing a line released alongside the new generation.
 */
function dropPreviousGenerations(
  pool: readonly FallbackSuggestCandidate[],
): FallbackSuggestCandidate[] {
  const newest = new Map<string, { major: number; released: number }>();
  for (const c of pool) {
    const version = modelVersion(c.model);
    const released = releaseTime(c);
    if (!version || released === undefined || isUnstable(c)) continue;
    const key = vendorKey(c);
    const major = version[0] as number;
    const prev = newest.get(key);
    if (!prev || major > prev.major || (major === prev.major && released > prev.released)) {
      newest.set(key, { major, released });
    }
  }
  return pool.filter((c) => {
    const version = modelVersion(c.model);
    const released = releaseTime(c);
    const top = newest.get(vendorKey(c));
    if (!version || released === undefined || !top) return true;
    return (version[0] as number) >= top.major || top.released - released < GENERATION_GAP_MS;
  });
}

/** Provider + vendor: the first word of the models.dev family, else of the id. */
function vendorKey(c: FallbackSuggestCandidate): string {
  const source = c.family?.trim() || c.model;
  const vendor =
    source
      .toLowerCase()
      .split(/[-_/.:@\s]+/u)[0]
      ?.replace(/\d+$/u, '') ?? '';
  return `${c.provider}\u0000v:${vendor}`;
}

/** Provider + models.dev family; id-derived stem when the catalog has none. */
function versionLine(c: FallbackSuggestCandidate): string {
  const family = c.family?.trim().toLowerCase();
  return family ? `${c.provider}\u0000f:${family}` : familyLine(c);
}

function isUnstable(c: FallbackSuggestCandidate): boolean {
  return c.status === 'beta' || idTokens(c.model).some((t) => UNSTABLE_TOKENS.has(t));
}

/**
 * Release version from an id: `MiniMax-M3.1-Flash` → [3,1], `glm-5.3` →
 * [5,3], `claude-opus-5-5` → [5,5], `deepseek-v4-pro-0813` → [4]. Snapshot
 * dates (`0813`, `20250929`) and parameter sizes (`30b`, `a3b`) are not
 * versions and are skipped.
 */
export function modelVersion(model: string): number[] | undefined {
  const tokens = model
    .toLowerCase()
    .split(/[-_/:@\s]+/u)
    .filter((t) => t.length > 0 && !/\d{4,}/u.test(t) && !/^a?\d+(\.\d+)?b$/u.test(t));
  for (let i = 0; i < tokens.length; i++) {
    const m = /(\d+(?:\.\d+)*)/u.exec(tokens[i] as string);
    if (!m) continue;
    const parts = (m[1] as string).split('.').map(Number);
    // `claude-opus-5-5`: a bare major followed by a bare 1-2 digit minor.
    const next = tokens[i + 1];
    if (
      parts.length === 1 &&
      /^\d+$/u.test(tokens[i] as string) &&
      next &&
      /^\d{1,2}$/u.test(next)
    ) {
      parts.push(Number(next));
    }
    return parts;
  }
  return undefined;
}

function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Provider + id with every digit and lifecycle suffix removed — the "line" a
 * model belongs to across versions: `qwen3.8-max` and `qwen3.7-max` share
 * `qwen-max`, while `qwen3.8-flash` is a different line.
 */
function familyLine(c: FallbackSuggestCandidate): string {
  const stem = idTokens(c.model)
    .map((t) => t.replace(/\d+/gu, ''))
    .filter((t) => t.length > 0 && !LIFECYCLE_TOKENS.has(t))
    .join('-');
  return `${c.provider}\u0000${stem}`;
}

const LIFECYCLE_TOKENS = new Set(['latest', 'preview', 'exp', 'experimental', 'beta', 'alpha']);

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function archetypeScore(s: ScoredFallbackCandidate, id: FallbackSuggestionId): number {
  const [ws, wv, wc] = ARCHETYPE_WEIGHTS[id];
  const shortfall = Math.max(0, ARCHETYPE_STRENGTH_FLOOR[id] - s.strength);
  return (
    ws * s.strength +
    wv * s.speed +
    wc * s.cheapness -
    shortfall -
    (s.unstable ? UNSTABLE_PENALTY : 0)
  );
}

function toEntry(s: ScoredFallbackCandidate): FallbackSuggestionEntry {
  const c = s.candidate;
  return {
    ref: s.ref,
    provider: c.provider,
    model: c.model,
    name: c.name ?? c.model,
    strength: s.strength,
    speed: s.speed,
    cheapness: s.cheapness,
    ...(c.contextWindow ? { contextWindow: c.contextWindow } : {}),
    ...(finiteOrUndefined(c.inputCost) !== undefined ? { inputCost: c.inputCost } : {}),
    ...(finiteOrUndefined(c.outputCost) !== undefined ? { outputCost: c.outputCost } : {}),
    ...(c.releaseDate ? { releaseDate: c.releaseDate } : {}),
    reasoning: s.reasoning,
    unstable: s.unstable,
  };
}

/**
 * Greedy chain: best archetype score first, then each next pick maximizes
 * score minus a penalty for reusing a provider. Cross-provider order is the
 * point — an account-level 429 limits every model behind the same key, so a
 * chain that never leaves the provider fails all at once.
 */
function buildChain(
  scored: readonly ScoredFallbackCandidate[],
  id: FallbackSuggestionId,
  length: number,
): ScoredFallbackCandidate[] {
  const ranked = [...scored].sort(
    (a, b) => archetypeScore(b, id) - archetypeScore(a, id) || a.ref.localeCompare(b.ref),
  );
  const chain: ScoredFallbackCandidate[] = [];
  const providers = new Set<string>();
  const lines = new Set<string>();
  while (chain.length < length) {
    let best: ScoredFallbackCandidate | undefined;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const s of ranked) {
      if (chain.includes(s) || lines.has(s.line)) continue;
      const value =
        archetypeScore(s, id) - (providers.has(s.candidate.provider) ? SAME_PROVIDER_PENALTY : 0);
      if (value > bestValue) {
        best = s;
        bestValue = value;
      }
    }
    if (!best) break;
    chain.push(best);
    providers.add(best.candidate.provider);
    lines.add(best.line);
  }
  return chain;
}

function toSuggestion(
  id: FallbackSuggestionId,
  chain: readonly ScoredFallbackCandidate[],
  source: FallbackSuggestion['source'],
  rationale?: string,
): FallbackSuggestion {
  const score =
    chain.length > 0 ? chain.reduce((sum, s) => sum + archetypeScore(s, id), 0) / chain.length : 0;
  return {
    id,
    chain: chain.map((s) => s.ref),
    entries: chain.map(toEntry),
    score: round3(score),
    providerCount: new Set(chain.map((s) => s.candidate.provider)).size,
    source,
    ...(rationale ? { rationale } : {}),
  };
}

function clampLength(length: number | undefined): number {
  const n = typeof length === 'number' && Number.isFinite(length) ? Math.trunc(length) : 4;
  return Math.min(6, Math.max(2, n));
}

/**
 * Deterministic suggestions. Archetypes whose chain would be shorter than two
 * models, or identical to an earlier archetype's chain, are omitted — a
 * single-model "fallback" is no fallback, and a duplicate card is noise.
 */
export function suggestFallbackProfiles(
  candidates: readonly FallbackSuggestCandidate[],
  options: SuggestFallbackOptions = {},
): FallbackSuggestion[] {
  const scored = scoreFallbackCandidates(candidates, options);
  const length = clampLength(options.chainLength);
  const ids = options.ids ?? FALLBACK_SUGGESTION_IDS;
  const out: FallbackSuggestion[] = [];
  const seenChains = new Set<string>();
  for (const id of ids) {
    const chain = buildChain(scored, id, length);
    if (chain.length < 2) continue;
    const key = chain.map((s) => s.ref).join('\n');
    if (seenChains.has(key)) continue;
    seenChains.add(key);
    out.push(toSuggestion(id, chain, 'heuristic'));
  }
  return out;
}

// ── LLM re-rank ─────────────────────────────────────────────────────────────

/** Upper bound on candidates shown to the LLM — keeps the prompt small. */
export const LLM_POOL_LIMIT = 48;

export const FALLBACK_SUGGEST_SYSTEM_PROMPT = [
  'You design fallback model chains for an AI coding agent.',
  'A chain is tried in order: when the first model fails (rate limit, outage, overload) the next one takes over the SAME agentic coding session, with tool calls.',
  'Use what you know about each model: agentic coding benchmarks (SWE-bench, Terminal-Bench, tool-use reliability), reasoning quality, latency and price.',
  'Rules:',
  '- Only use refs from the candidate list, copied exactly. Never invent a ref.',
  '- Each chain has 2-4 distinct refs. Prefer mixing providers so one exhausted API key does not take down the whole chain.',
  '- Avoid beta/preview/free models unless nothing stable fits: a fallback must be dependable.',
  '- strong = best capability regardless of cost; balanced = strong-enough at sane cost; fast = lowest latency that still uses tools reliably; budget = cheapest that can still finish coding tasks.',
  '- rationale: one short sentence per chain.',
  'Return only JSON, no markdown.',
].join('\n');

export const FALLBACK_SUGGEST_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    profiles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', enum: [...FALLBACK_SUGGESTION_IDS] },
          chain: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
          rationale: { type: 'string' },
        },
        required: ['id', 'chain'],
      },
    },
  },
  required: ['profiles'],
} as const;

/**
 * The pool the LLM chooses from: every model the heuristic placed in any
 * chain, then the best of each archetype until {@link LLM_POOL_LIMIT}.
 */
export function selectLlmCandidatePool(
  candidates: readonly FallbackSuggestCandidate[],
  limit: number = LLM_POOL_LIMIT,
  options: Pick<SuggestFallbackOptions, 'maxAgeMonths'> = {},
): ScoredFallbackCandidate[] {
  const scored = scoreFallbackCandidates(candidates, options);
  if (scored.length <= limit) return scored;
  const pool = new Map<string, ScoredFallbackCandidate>();
  const rankings = FALLBACK_SUGGESTION_IDS.map((id) =>
    [...scored].sort((a, b) => archetypeScore(b, id) - archetypeScore(a, id)),
  );
  for (let i = 0; pool.size < limit && i < scored.length; i++) {
    for (const ranking of rankings) {
      const s = ranking[i];
      if (s && !pool.has(s.ref)) pool.set(s.ref, s);
      if (pool.size >= limit) break;
    }
  }
  return [...pool.values()];
}

function fmtPrice(n: number | undefined): string {
  return n === undefined ? '?' : n === 0 ? '0' : n < 1 ? n.toFixed(2) : n.toFixed(1);
}

function fmtContext(n: number | undefined): string {
  if (!n) return '?';
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`;
}

/** User prompt for the LLM pass: the pool as a compact table + the draft. */
export function buildFallbackSuggestPrompt(
  pool: readonly ScoredFallbackCandidate[],
  draft: readonly FallbackSuggestion[],
  options: { chainLength?: number | undefined } = {},
): string {
  const rows = pool.map((s) => {
    const c = s.candidate;
    return [
      s.ref,
      c.name && c.name !== c.model ? c.name : '',
      c.releaseDate ?? '?',
      fmtContext(c.contextWindow),
      `$${fmtPrice(finiteOrUndefined(c.inputCost))}/$${fmtPrice(finiteOrUndefined(c.outputCost))}`,
      [s.reasoning ? 'reasoning' : '', s.unstable ? 'beta/preview/free' : '']
        .filter(Boolean)
        .join(','),
    ].join(' | ');
  });
  const draftLines = draft.map((d) => `${d.id}: ${d.chain.join(' -> ')}`);
  return [
    'Candidates (ref | name | released | context | $in/$out per 1M | flags):',
    ...rows,
    '',
    'Heuristic draft (price/recency based; improve it with your model knowledge):',
    ...(draftLines.length > 0 ? draftLines : ['(none)']),
    '',
    `Return {"profiles":[{"id":"strong|balanced|fast|budget","chain":[refs],"rationale":"..."}]} with one entry per id, ${clampLength(options.chainLength)} refs per chain when the pool allows.`,
  ].join('\n');
}

/** Pull the first JSON object out of a model reply (tolerates code fences). */
function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

export interface LlmMergeResult {
  suggestions: FallbackSuggestion[];
  /** Profiles the LLM returned but that failed validation (unknown ref, too short). */
  rejected: number;
}

/**
 * Validate the LLM reply against the pool and merge it over the heuristic
 * draft. A profile with ANY ref outside the pool is rejected whole — keeping
 * the valid half would silently ship a chain the model did not intend.
 */
export function mergeLlmFallbackSuggestions(
  replyText: string,
  candidates: readonly FallbackSuggestCandidate[],
  draft: readonly FallbackSuggestion[],
  options: SuggestFallbackOptions = {},
): LlmMergeResult {
  const scored = scoreFallbackCandidates(candidates, options);
  const byRef = new Map(scored.map((s) => [s.ref, s]));
  const length = clampLength(options.chainLength);
  const parsed = extractJsonObject(replyText);
  const profiles =
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { profiles?: unknown }).profiles)
      ? ((parsed as { profiles: unknown[] }).profiles as unknown[])
      : [];

  const fromLlm = new Map<FallbackSuggestionId, FallbackSuggestion>();
  let rejected = 0;
  for (const raw of profiles) {
    if (!raw || typeof raw !== 'object') {
      rejected++;
      continue;
    }
    const { id, chain, rationale } = raw as { id?: unknown; chain?: unknown; rationale?: unknown };
    if (
      typeof id !== 'string' ||
      !(FALLBACK_SUGGESTION_IDS as readonly string[]).includes(id) ||
      !Array.isArray(chain) ||
      fromLlm.has(id as FallbackSuggestionId)
    ) {
      rejected++;
      continue;
    }
    const refs = [...new Set(chain.filter((r): r is string => typeof r === 'string'))].slice(
      0,
      length,
    );
    const picked = refs.map((r) => byRef.get(r.trim()));
    if (picked.length < 2 || picked.some((s) => s === undefined)) {
      rejected++;
      continue;
    }
    fromLlm.set(
      id as FallbackSuggestionId,
      toSuggestion(
        id as FallbackSuggestionId,
        picked as ScoredFallbackCandidate[],
        'llm',
        typeof rationale === 'string' ? rationale.trim().slice(0, 300) : undefined,
      ),
    );
  }

  const ids = options.ids ?? FALLBACK_SUGGESTION_IDS;
  const draftById = new Map(draft.map((d) => [d.id, d]));
  const suggestions: FallbackSuggestion[] = [];
  for (const id of ids) {
    const pick = fromLlm.get(id) ?? draftById.get(id);
    if (pick) suggestions.push(pick);
  }
  return { suggestions, rejected };
}

/**
 * True when `provider/model` is named by any entry of a model-ref list such
 * as `disabledModels`. Same grammar the WebUI pickers use: `provider/model`,
 * `provider model`, or a bare `model` (which matches on every provider);
 * case- and whitespace-insensitive.
 */
export function isModelRefListed(
  provider: string,
  model: string,
  refs: readonly string[] | undefined,
): boolean {
  if (!refs || refs.length === 0) return false;
  const p = provider.trim().toLowerCase();
  const m = model.trim().toLowerCase();
  return refs.some((raw) => {
    const ref = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!ref) return false;
    if (ref === m || ref === `${p}/${m}`) return true;
    const slash = ref.indexOf('/');
    if (slash !== -1) return ref.slice(0, slash).trim() === p && ref.slice(slash + 1).trim() === m;
    const parts = ref.split(/\s+/u);
    return parts.length >= 2 && parts[0] === p && parts.slice(1).join(' ') === m;
  });
}

/** Drop every candidate the user disabled — a suggestion must never resurrect one. */
export function excludeListedModels(
  candidates: readonly FallbackSuggestCandidate[],
  refs: readonly string[] | undefined,
): FallbackSuggestCandidate[] {
  if (!refs || refs.length === 0) return [...candidates];
  return candidates.filter((c) => !isModelRefListed(c.provider, c.model, refs));
}
