import type {
  FallbackSuggestCandidate,
  FallbackSuggestion,
  FallbackSuggestionId,
  ScoredFallbackCandidate,
  SuggestFallbackOptions,
} from './fallback-suggest-llm.js';
import {
  archetypeScore,
  clampLength,
  FALLBACK_SUGGESTION_IDS,
  scoreFallbackCandidates,
  toSuggestion,
} from './fallback-suggest-llm.js';

export type {
  FallbackSuggestCandidate,
  FallbackSuggestion,
  FallbackSuggestionEntry,
  FallbackSuggestionId,
  LlmMergeResult,
  ScoredFallbackCandidate,
  SuggestFallbackOptions,
} from './fallback-suggest-llm.js';
export {
  buildFallbackSuggestPrompt,
  DEFAULT_MAX_AGE_MONTHS,
  excludeListedModels,
  FALLBACK_SUGGEST_JSON_SCHEMA,
  FALLBACK_SUGGEST_SYSTEM_PROMPT,
  FALLBACK_SUGGESTION_IDS,
  formatFallbackRef,
  isFallbackEligible,
  isModelRefListed,
  LLM_POOL_LIMIT,
  mergeLlmFallbackSuggestions,
  modelVersion,
  scoreFallbackCandidates,
  selectLlmCandidatePool,
} from './fallback-suggest-llm.js';

/** Score subtracted when a pick reuses a provider already in the chain. */
const SAME_PROVIDER_PENALTY = 0.12;

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
