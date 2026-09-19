import type { DatabaseSync } from 'node:sqlite';
import type { VectorAugmentHit } from './retrieval/vector-augment.js';
import { augmentLexicalWithVectorRecall } from './retrieval/vector-augment.js';
import { retrieveSqliteSageForAudience } from './sqlite-store-audience.js';
import { materializeSageByIdFactory, searchSqliteSage } from './sqlite-store-search-sage.js';
import type { MemoryAudienceContext, Sage, SageSearchOptions } from './types.js';

export async function searchSqliteSageWithRecall(
  stmt: (sql: string) => ReturnType<DatabaseSync['prepare']>,
  query: string,
  opts?: SageSearchOptions,
): Promise<Sage[]> {
  const lexical = searchSqliteSage({ stmt: (sql) => stmt(sql) }, query, opts);
  if (!opts?.vectorRecall) return lexical;
  // Fused semantic recall — the vector channel is fail-open by contract
  // (any backend error falls through to the lexical list).
  const fused = await augmentLexicalWithVectorRecall(query, lexical, {
    vectorRecall: opts.vectorRecall,
    // Vector-only hits (semantically close but lexically missed) are
    // materialized by id under the SAME visibility rules as the lexical
    // channel — see materializeSageByIdFactory.
    materializeVectorOnly: materializeSageByIdFactory({ stmt: (sql) => stmt(sql) }, opts),
    ...(opts.vectorRecallWeight !== undefined ? { vectorWeight: opts.vectorRecallWeight } : {}),
    ...(opts.vectorRecallMinScore !== undefined ? { threshold: opts.vectorRecallMinScore } : {}),
    ...(opts.vectorRecallThreshold !== undefined
      ? { vectorOnlyThreshold: opts.vectorRecallThreshold }
      : {}),
    ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
  });
  return fused.map((hit) => hit.memory);
}

/**
 * Rich variant of `searchSage` that returns the augmented hits
 * (memory + per-channel scores + RRF final score + source attribution)
 * rather than a flat `Sage[]`. Use this when the caller wants to
 * surface the dual-channel breakdown to the user — e.g. the
 * `memory_search_explain` tool, the WebUI memory manager, or any
 * diagnostic that needs to answer "did this hit come from lexical,
 * semantic, or both?".
 *
 * When no `vectorRecall` is wired the result collapses to
 * `source: 'lexical'` hits with `vectorScore: null` — the same shape
 * the fused path would have produced, so consumers don't need to
 * branch.
 */
export async function explainSqliteSageRecall(
  stmt: (sql: string) => ReturnType<DatabaseSync['prepare']>,
  query: string,
  opts?: SageSearchOptions,
): Promise<VectorAugmentHit[]> {
  const lexical = searchSqliteSage({ stmt: (sql) => stmt(sql) }, query, opts);
  if (!opts?.vectorRecall) {
    // No semantic channel — return lexical hits as augmentation hits
    // with `vectorScore: null` so consumers can render them uniformly.
    return lexical.map((memory, index) => ({
      memory,
      vectorScore: null,
      lexicalScore: lexical.length <= 1 ? 1 : 1 - index / (lexical.length - 1),
      finalScore: lexical.length <= 1 ? 1 : 1 - index / (lexical.length - 1),
      source: 'lexical' as const,
    }));
  }
  return augmentLexicalWithVectorRecall(query, lexical, {
    vectorRecall: opts.vectorRecall,
    // Same vector-only materialization contract as searchSage —
    // visibility-respecting, fail-open on unknown ids.
    materializeVectorOnly: materializeSageByIdFactory({ stmt: (sql) => stmt(sql) }, opts),
    ...(opts.vectorRecallWeight !== undefined ? { vectorWeight: opts.vectorRecallWeight } : {}),
    ...(opts.vectorRecallMinScore !== undefined ? { threshold: opts.vectorRecallMinScore } : {}),
    ...(opts.vectorRecallThreshold !== undefined
      ? { vectorOnlyThreshold: opts.vectorRecallThreshold }
      : {}),
    ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
  });
}

/**
 * Retrieve memories scoped to a specific agent audience (role, taskType, mode).
 * Queries all audience-scoped memories (status active/stale) then filters in JS
 * for correctness (the SQLite LIKE approach produced false negatives when a
 * memory targeted only one audience dimension).
 *
 * **Note:** The internal SQL prefilter pulls `limit * 5` rows as a safety
 * net to bound the in-memory audience filter pass. The over-fetch factor
 * (5) matches `AUDIENCE_OVERFETCH_FACTOR` in `sqlite-store-audience.ts`
 * and is the trigger for the `memory.audience_truncated` audit event
 * the onTruncated callback emits when more matching rows likely exist
 * beyond the prefilter window. Bump the factor if narrow role/task
 * filters warrant a larger window.
 */
export async function retrieveSageAudienceWithAudit(
  stmt: (sql: string) => ReturnType<DatabaseSync['prepare']>,
  audit: (event: string, data?: Record<string, unknown>) => void,
  context: MemoryAudienceContext,
  limit?: number,
  onTruncated?: (info: { sqlRowsExamined: number; returned: number }) => void,
  sessionId?: string | undefined,
  includeAllSessions?: boolean | undefined,
): Promise<Sage[]> {
  return retrieveSqliteSageForAudience(
    {
      stmt: (sql) => stmt(sql),
      onTruncated: (info) => {
        audit('memory.audience_truncated', { context, ...info });
        onTruncated?.(info);
      },
    },
    context,
    limit === undefined
      ? { sessionId, includeAllSessions }
      : { limit, sessionId, includeAllSessions },
  );
}
