import type { FallbackSuggestion } from '@/types';

/**
 * Profile name for an accepted suggestion: the archetype id (`strong`,
 * `fast`, ...) when free, otherwise `strong-2`, `strong-3`, ... — accepting a
 * suggestion must never overwrite a profile the user already curated.
 */
export function suggestionProfileName(
  id: FallbackSuggestion['id'],
  existing: Readonly<Record<string, readonly string[]>>,
): string {
  if (!(id in existing)) return id;
  for (let n = 2; ; n++) {
    const candidate = `${id}-${n}`;
    if (!(candidate in existing)) return candidate;
  }
}

/** Name of a saved profile whose chain equals `chain` exactly, if any. */
export function findProfileWithChain(
  chain: readonly string[],
  profiles: Readonly<Record<string, readonly string[]>>,
): string | undefined {
  for (const [name, saved] of Object.entries(profiles)) {
    if (saved.length === chain.length && saved.every((ref, i) => ref === chain[i])) return name;
  }
  return undefined;
}

export function sameChain(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((ref, i) => ref === b[i]);
}

/** `$0.30 / $1.20` per 1M tokens; `free` at zero; empty when unpriced. */
export function formatPricePair(input?: number, output?: number): string {
  if (input === undefined && output === undefined) return '';
  if ((input ?? 0) === 0 && (output ?? 0) === 0) return 'free';
  const fmt = (n: number | undefined) =>
    n === undefined ? '?' : `$${n < 1 ? n.toFixed(2) : n.toFixed(n < 10 ? 1 : 0)}`;
  return `${fmt(input)} / ${fmt(output)}`;
}

export function formatContextWindow(tokens?: number): string {
  if (!tokens) return '';
  return tokens >= 1_000_000
    ? `${Number((tokens / 1_000_000).toFixed(1))}M`
    : `${Math.round(tokens / 1000)}K`;
}
