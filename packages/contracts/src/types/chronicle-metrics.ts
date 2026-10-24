/**
 * Chronicle metrics rows and the narrow read ports core consumes.
 *
 * Chronicle (the per-project journal, its daemon and the SQLite metrics
 * projection) lives above core. Core code that only reads a projection —
 * the underused-tool advisor and the review file-provenance lookup — depends
 * on these shapes, and the composition root supplies the Chronicle-backed
 * implementation.
 *
 * @module types/chronicle-metrics
 */

/** A row of `ChronicleMetricsStore.underusedTools`. */
export interface ChronicleUnderusedToolRow {
  toolName: string;
  invocations: number;
  failures: number;
  durationMsTotal: number;
  lastInvokedAt: number | null;
  daysSinceLastUse: number | null;
}

/** A row of the Chronicle file-lineage projection (`metrics` view `files`). */
export interface ChronicleFileLineageRow {
  path: string;
  operation: string;
  occurredAt: string;
  sessionId: string;
  agentId: string;
  taskId: string;
  boardId: string;
  runId: string;
  toolName: string;
  providerId: string;
  modelId: string;
  logicalRequestId: string;
  promptManifestId: string;
  provenanceConfidence: 'explicit' | 'correlated' | 'inferred' | 'unknown';
  source: string;
}

/** The slice of `ChronicleMetricsStore` the underused-tool advisor reads. */
export interface ChronicleUnderusedToolsReader {
  /** Ingest journal bytes appended since the last refresh. */
  refresh(): Promise<unknown>;
  underusedTools(options?: {
    from?: string;
    to?: string;
    limit?: number;
  }): ChronicleUnderusedToolRow[];
}

/**
 * Latest lineage row per path for a project. Best-effort: implementations
 * resolve to `[]` (or reject) when Chronicle is unavailable; callers treat any
 * failure as "no provenance".
 */
export type ChronicleFileLineageReader = (
  projectRoot: string,
  paths: readonly string[],
) => Promise<ChronicleFileLineageRow[]>;
