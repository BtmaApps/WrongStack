import type { Sage } from '../types.js';

export interface SageRetrieverLike {
  retrieveForPath(opts: {
    path: string;
    limit?: number;
    includeAncestors?: boolean;
    includeStatuses?: Sage['status'][];
    includeAudienceScoped?: boolean;
    sessionId?: string | undefined;
    includeAllSessions?: boolean | undefined;
  }): Promise<Sage[]>;
  searchSage(
    query: string,
    opts?: {
      limit?: number;
      includeAudienceScoped?: boolean;
      requireAllTerms?: boolean;
      sessionId?: string | undefined;
      includeAllSessions?: boolean | undefined;
      vectorRecall?: import('../types.js').VectorRecallProvider | undefined;
      vectorRecallWeight?: number | undefined;
      vectorCandidateLimit?: number | undefined;
      vectorRecallThreshold?: number | undefined;
      vectorRecallMinScore?: number | undefined;
    },
  ): Promise<Sage[]>;
  /**
   * Rich variant of `searchSage` returning per-channel scores. Optional
   * on the structural retriever — only ports that can produce the
   * augmented breakdown (in-process SqliteMemoryPort, the wrapped
   * vector-augmented port) implement it. The explainer tools call this
   * when present and fall back to `searchSage` otherwise.
   */
  searchSageWithBreakdown?(
    query: string,
    opts?: {
      limit?: number;
      includeAudienceScoped?: boolean;
      requireAllTerms?: boolean;
      sessionId?: string | undefined;
      includeAllSessions?: boolean | undefined;
      vectorRecall?: import('../types.js').VectorRecallProvider | undefined;
      vectorRecallWeight?: number | undefined;
      vectorCandidateLimit?: number | undefined;
      vectorRecallThreshold?: number | undefined;
      vectorRecallMinScore?: number | undefined;
    },
  ): Promise<import('../retrieval/vector-augment.js').VectorAugmentHit[]>;
  findRelatedSage?(
    memoryIds: string[],
    opts?: {
      limit?: number;
      maxDepth?: number;
      includeStatuses?: Sage['status'][];
      includeAudienceScoped?: boolean;
      sessionId?: string | undefined;
      includeAllSessions?: boolean | undefined;
    },
  ): Promise<Sage[]>;
  verifyForPaths?(paths: string[], signal?: AbortSignal): Promise<unknown>;
  recordInjection?(memoryIds: string[], trigger: string, sessionId?: string): void | Promise<void>;
  recordUse?(memoryIds: string[], source: string, sessionId?: string): void | Promise<void>;
}

export type SageSearchLike = Pick<
  SageRetrieverLike,
  'searchSage' | 'searchSageWithBreakdown' | 'recordInjection' | 'recordUse'
>;
