/**
 * Canonical text normalization and tokenization for SAGE memories. A leaf
 * module: the store helpers, similarity and validation modules all build on
 * these, and `store-helpers.ts` re-exports them.
 */

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Hygiene's near-duplicate pass compares every pair in a bucket and each
 * comparison re-tokenized both texts (NFKC + a unicode regex split) several
 * times: ~3s of a 14s pass on a 7k-memory store. Callers get a copy, so the
 * cached arrays are never mutated. Only memory-sized texts are cached — the
 * middlewares also tokenize whole tool outputs, which must not be retained
 * by a long-lived daemon. Cleared wholesale when full: a bounded memo, not an
 * LRU, is enough for one pass over the corpus.
 */
const TOKEN_CACHE = new Map<string, readonly string[]>();
const TOKEN_CACHE_MAX = 8_192;
const TOKEN_CACHE_MAX_TEXT = 4_096;

/**
 * Canonical tokenizer for retrieval scoring across BOTH the stores and the
 * injection middlewares — do not fork it. Invariants:
 * - NFKC + lowercase: strings differing only in unicode form/case tokenize alike.
 * - Unicode letters/numbers plus `_`, `.`, `-` are token characters, so
 *   identifiers like `edge-case`, `snake_case`, and `foo.bar` stay whole.
 * - Terms shorter than 3 characters are dropped: scoring does substring
 *   matching (`haystack.includes(term)`), where 1–2 char terms ("in", "go")
 *   match nearly every text and produce pure noise.
 * - Output is deduplicated; scoring operates on sets.
 */
export function tokenize(text: string): string[] {
  const cacheable = text.length <= TOKEN_CACHE_MAX_TEXT;
  // Key on the canonical form so inputs differing only in unicode form,
  // case, or whitespace share one entry — they tokenize identically by
  // the NFKC + lowercase invariant above.
  const key = cacheable ? normalizeTextKey(text) : text;
  const cached = cacheable ? TOKEN_CACHE.get(key) : undefined;
  if (cached) return [...cached];
  const tokens = [
    ...new Set(
      text
        .normalize('NFKC')
        .toLowerCase()
        .split(/[^\p{L}\p{N}_.-]+/u)
        .filter((term) => term.length >= 3),
    ),
  ];
  if (!cacheable) return tokens;
  if (TOKEN_CACHE.size >= TOKEN_CACHE_MAX) TOKEN_CACHE.clear();
  TOKEN_CACHE.set(key, tokens);
  return [...tokens];
}

/** Canonical text key for memory deduplication and comparison. */
export function normalizeTextKey(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Canonical dedup key for session consolidation and hygiene.
 * Strips trailing sentence-ending punctuation so "Use pnpm." and
 * "Use pnpm" produce the same key, while preserving internal
 * punctuation in identifiers (`C++`, `foo.bar`).
 */
export function canonicalMemoryText(text: string): string {
  return normalizeTextKey(text).replace(/[.!?,;:]+$/u, '');
}
