import { normalizeModelRef, parseModelRef } from '@wrongstack/core/agent';

// ── Reference validation helpers ──────────────────────────────────────────────

/**
 * Reason a ref may NOT be stored in a chain or profile, or undefined when it
 * is acceptable. Only hard, user-owned rules live here:
 *
 *  1. It parses to a non-empty model.
 *  2. It is in `favoriteModels` (skipped when favorites are empty — legacy
 *     behavior: no favorites ⇒ no enforcement). This is an explicit policy
 *     the user turned on, so it stays blocking.
 *
 * The `providers[].models` allow-list is deliberately NOT blocking: it is an
 * unrefreshed snapshot that re-auth and manual edits rewrite, so a stale entry
 * would refuse a model the provider actually serves. It is surfaced as a
 * warning instead (see {@link refStaleModelListWarning}).
 */
export function refInvalidReason(
  ref: string,
  config: {
    provider: string;
    providers?: Record<string, { models?: string[] | undefined }> | undefined;
    favoriteModels?: string[] | undefined;
  },
): string | undefined {
  const parsed = parseModelRef(ref);
  if (!parsed.model) return 'no model in reference';
  const favorites = config.favoriteModels ?? [];
  if (favorites.length === 0) return undefined;
  const canonical = normalizeModelRef(ref, config.provider);
  const inFavorites = favorites.some((f) => normalizeModelRef(f, config.provider) === canonical);
  if (!inFavorites) return 'not in favorites';
  return undefined;
}

/**
 * Advisory note when a ref names a model the provider's saved `models` list
 * does not contain. The runtime still tries the entry (the list drifts), so
 * this is a "check this" hint, never a drop — the previous wording claimed the
 * entry was "inactive", which was true then and would be misleading now.
 */
export function refStaleModelListWarning(
  ref: string,
  config: {
    provider: string;
    providers?: Record<string, { models?: string[] | undefined }> | undefined;
  },
): string | undefined {
  const parsed = parseModelRef(ref);
  if (!parsed.model) return 'no model in reference';
  const providerId = parsed.provider ?? config.provider;
  const entry = config.providers?.[providerId];
  if (Array.isArray(entry?.models) && !entry.models.includes(parsed.model)) {
    return `not in ${providerId} saved model list — will still be tried`;
  }
  return undefined;
}
