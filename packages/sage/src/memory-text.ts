/**
 * Canonical text normalization and tokenization for SAGE memories. A leaf
 * module: the store helpers, similarity and validation modules all build on
 * these, and `store-helpers.ts` re-exports them.
 */

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

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
  return [
    ...new Set(
      text
        .normalize('NFKC')
        .toLowerCase()
        .split(/[^\p{L}\p{N}_.-]+/u)
        .filter((term) => term.length >= 3),
    ),
  ];
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
