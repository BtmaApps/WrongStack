import type { MemoryAnchor, SageKind, SageStatus } from './memory-model.js';

export type VerificationStatus = 'verified' | 'stale' | 'contradicted' | 'unknown';

export interface AnchorVerificationResult {
  anchor: MemoryAnchor;
  status: VerificationStatus;
  reason: string;
  contentHash?: string | undefined;
  gitBlobHash?: string | undefined;
}

export interface MemoryVerificationResult {
  memoryId: string;
  status: VerificationStatus;
  checkedAt: string;
  anchors: AnchorVerificationResult[];
}

export interface SageHygieneOptions {
  retentionDays?: number | undefined;
  /**
   * Soft-delete session-scoped memories older than this many days when they
   * have no explicit `expiresAt`. Default: 7. Session scope is ephemeral;
   * hygiene deletes these immediately instead of creating review candidates.
   */
  sessionRetentionDays?: number | undefined;
  archiveLowConfidenceAfterDays?: number | undefined;
  /**
   * Archive active memories that were injected at least `unusedMinInjections`
   * times but never referenced by the assistant, this many days after their
   * last content update. Default: 30.
   */
  archiveUnusedAfterDays?: number | undefined;
  /** Minimum injection count before a never-used memory is archived. Default: 10. */
  unusedMinInjections?: number | undefined;
  /** When false, skip anchor verification entirely. Default: true. */
  verify?: boolean | undefined;
  /**
   * Anchor verification depth for the hygiene sweep.
   * - `existence` (default): path still present on disk.
   * - `content` / `git`: deep verify via `verifyMemoryAnchors` (content hash,
   *   symbol, command; git blob when depth is `git` or anchor carries a hash).
   */
  verifyDepth?: 'existence' | 'content' | 'git' | undefined;
  /**
   * Run a second dedup pass that catches near-duplicate texts (semantically
   * similar but not byte-identical after canonical normalization) via SimHash
   * bucketing. Default: true.
   *
   * Set to `false` to skip the pass for any of:
   * - Small corpora (< ~200 active memories) where the O(N) bucketing cost
   *   is dominated by the I/O of `updateMemory` writes, not by the analysis.
   * - Experimental recall-tuning sessions where you want exact-match dedup
   *   behavior preserved verbatim so you can isolate recall regressions to
   *   the cache layer rather than the dedup layer.
   * - Stores where transitive-merge audit clarity matters more than recall
   *   compression — the near-dedup keeper inherits the merged `tags` /
   *   `anchors` / `sources` of all near-duplicate members, which can
   *   obscure the provenance of any single memory.
   *
   * The pass only operates on the post-first-pass `active` set, so memories
   * already superseded by exact-identity dedup are not re-fed in.
   */
  nearDedup?: boolean | undefined;
  /**
   * OPT-IN, destructive: physically remove records that are ALREADY
   * `status: 'deleted'` and whose deletion is older than this many days.
   *
   * This is the ONLY hygiene step that physically drops rows from SQLite
   * (or compacting JSONL). It never changes any live memory's status and
   * never touches `permanent` records. It exists to stop the soft-delete
   * audit trail (including session-GC tombstones) from growing unbounded.
   *
   * Undefined/omitted or <= 0 → the purge is disabled (default). `0` is treated
   * as "disabled" rather than "purge everything" to prevent accidental data loss.
   */
  purgeDeletedAfterDays?: number | undefined;
}

export interface SageHygieneReport {
  startedAt: string;
  completedAt: string;
  examined: number;
  deduplicated: number;
  superseded: number;
  contradicted: number;
  staled: number;
  /** Review candidates produced by hygiene this run. Final deletion/archival
   *  decision is made by the user or LLM via `memory_forget`/`memory_update`,
   *  never by hygiene itself. */
  reviewCandidatesCreated: number;
  /** Subset of historical semantics: ALWAYS 0 in the current pipeline —
   *  retained for backward-compatible tooling that reads the field. */
  archived: number;
  /** Subset of historical semantics: ALWAYS 0 in the current pipeline. */
  archivedUnused: number;
  /**
   * Soft-deleted memories this run. Currently only session-scope GC
   * (expired / aged-out session memories) increments this; project memories
   * still go through review candidates.
   */
  deleted: number;
  /**
   * Number of already-`deleted` records physically removed by the opt-in
   * `purgeDeletedAfterDays` step. 0 unless that option was passed.
   */
  purgedDeleted: number;
  verified: number;
  /**
   * Stale memories whose anchors verified again this run and were returned to
   * `active`. Optional for reports produced by older stores.
   */
  reactivated?: number | undefined;
  /**
   * Number of near-dup groups in the SimHash pass whose size exceeded 2
   * (transitive union-find collapse). See `findNearDuplicateGroups` for the
   * trade-off; the `SIMHASH_THRESHOLD = 7` mitigation makes 3-way collapse
   * of unrelated texts unlikely, but a non-zero counter on a real corpus
   * is a signal that the threshold or band-bits may want re-tuning.
   * Always 0 when `nearDedup === false`.
   */
  transitiveMerges: number;
}

/**
 * Why hygiene surfaced a memory for review. Distinct from the candidate's own
 * status (`pending`/`accepted`/`rejected`) — these are the *reasons* a candidate
 * exists, surfaced as tags on the candidate and in the audit log.
 */
export type MemoryReviewReason =
  | 'anchor_invalid'
  | 'never_injected'
  | 'injected_never_used'
  | 'confidence_low'
  | 'expires_at_passed'
  | 'contradicted_by_graph'
  | 'freshness_low';

export interface SageStats {
  total: number;
  byStatus: Record<SageStatus, number>;
  byKind: Partial<Record<SageKind, number>>;
  edges: number;
  /** Total recorded context injections across all memories. */
  injections?: number | undefined;
  /** Total recorded assistant references to injected memories. */
  uses?: number | undefined;
}
