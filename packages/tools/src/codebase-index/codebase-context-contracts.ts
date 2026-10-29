/** Leaf contracts shared by the tool implementation and its result guidance. */
import type { ContextEntry } from './context-retrieval.js';
import type { AnchoredSageInsight } from './ecosystem-bridge.js';

export interface CodebaseContextOutput {
  query: string;
  entries: ContextEntry[];
  /** Lexical hits that seeded the walk. */
  seedCount: number;
  /** Semantic hits that also seeded it. Zero without an embedding model. */
  semanticSeedCount: number;
  /** Files the walk reached before truncation to `limit`. */
  totalCandidates: number;
  /**
   * `ok` — a ranked answer. `no-matches` — the index exists but the query
   * matched nothing. `unranked` — symbols exist but no reference graph, so
   * results are lexical only. A missing index or a failed lookup THROWS.
   */
  indexStatus: 'ok' | 'no-matches' | 'unranked';
  /** True when a cached answer from a previous generation was served. */
  stale?: boolean | undefined;
  /** Active SAGE memories anchored to the retrieved files or declarations. */
  relatedMemories?: AnchoredSageInsight[] | undefined;
  /** Next-step guidance: which tool answers the follow-up, or why the result is empty. */
  note?: string | undefined;
}
