/**
 * SQLite-backed SAGE store.
 *
 * Replaces the JSONL full-load-on-every-op pattern with an indexed database.
 * Uses `node:sqlite` (DatabaseSync), WAL mode, and FTS5 for full-text search.
 *
 * The schema stores the full Sage object as JSON in a `memories` table
 * (primary index on id, with indexes on status, kind, scope, importance,
 * updatedAt) plus an FTS5 virtual table over the searchable text.  Graph edges
 * are stored in an `edges` table with indexes on from/to nodes.
 *
 * On first open, if a legacy `memories.jsonl` exists and the SQLite db is empty,
 * the store migrates records automatically (one-time cost).
 */
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { HqSageRecord } from '@wrongstack/core/hq';
import type { MemoryEntry, MemoryScope, MemoryStore } from '@wrongstack/core/types';
import { resolveSagePaths } from './paths.js';
import type { VectorAugmentHit } from './retrieval/vector-augment.js';
import type { SearchOptions, SearchQuery, SearchResult } from './service-contract.js';
import type { SqliteMemoryMutationsHost } from './sqlite-memory-mutations.js';
import {
  applyHqSync as applyHqSyncFromHost,
  clear as clearFromHost,
  consolidate as consolidateFromHost,
  forget as forgetFromHost,
  hardDeleteSage as hardDeleteSageFromHost,
  recordInjection as recordInjectionFromHost,
  recordUse as recordUseFromHost,
  updateSage as updateSageFromHost,
  upsertMemory as upsertMemoryFromHost,
} from './sqlite-memory-mutations.js';
import { pruneSqliteAuditLog, readSqliteAudit } from './sqlite-store-audit.js';
import type { SqliteCandidateHost } from './sqlite-store-candidate-ops.js';
import {
  acceptCandidateOp,
  addCandidateOp,
  createCandidateOp,
  listCandidatesOp,
  rejectCandidateOp,
  resolveCandidateOp,
} from './sqlite-store-candidate-ops.js';
import { reconcileAcceptedCandidates } from './sqlite-store-candidates.js';
import { sqliteRowToMemory } from './sqlite-store-codec.js';
import { getCompatSage, listCompatSage } from './sqlite-store-compat.js';
import {
  findRelatedSqliteSage,
  type SqliteFindRelatedOptions,
} from './sqlite-store-find-related.js';
import {
  addGraphEdge as delegateAddGraphEdge,
  cascadeDeleteEdges as delegateCascadeDeleteEdges,
  graphFor as delegateGraphFor,
  type SqliteStoreGraphHost,
} from './sqlite-store-graph.js';
import { traverseSqliteGraph } from './sqlite-store-graph-traverse.js';
import {
  audit as auditFromHost,
  deleteSage as deleteSageFromHost,
  hygiene as hygieneFromHost,
  rememberSage as rememberSageFromHost,
  type SqliteStoreGraphWriteHost,
  syncAnchorEdges as syncAnchorEdgesFromHost,
  verify as verifyFromHost,
} from './sqlite-store-graph-write.js';
import { initializeSqliteSageStore } from './sqlite-store-initialize.js';
import { migrateSqliteLegacyJsonl } from './sqlite-store-jsonl-migration.js';
import { importLegacySqliteMemory, searchLegacySqliteMemory } from './sqlite-store-legacy-api.js';
import {
  readAllSqliteMemory,
  readSqliteMemory,
  rememberSqliteMemoryBridge,
} from './sqlite-store-legacy-bridge.js';
import { listLegacySqliteMemory } from './sqlite-store-legacy-list.js';
import { listSqliteMemories } from './sqlite-store-list-memories.js';
import { listSqliteSagePage } from './sqlite-store-list-page.js';
import { SqliteMutationQueue } from './sqlite-store-mutation-queue.js';
import {
  backfillAdminSage,
  closeSqliteStore,
  drainSqliteStoreMutations,
  findAdminMemoriesForFile,
  initSageHqSync,
  listSageHqSync,
  recoverAdminSage,
  type SqliteAdminHost,
  sageHqSyncVersion,
} from './sqlite-store-operations.js';
import {
  explainSqliteSageRecall,
  retrieveSageAudienceWithAudit,
  searchSqliteSageWithRecall,
} from './sqlite-store-recall.js';
import { retrieveSqliteSageForPath } from './sqlite-store-retrieve-path.js';
import { executeUnifiedSearch } from './sqlite-store-search.js';
import { consolidateSqliteSession } from './sqlite-store-session-consolidation.js';
import { SqliteStatementCache } from './sqlite-store-statement-cache.js';
import { getSqliteSageStats } from './sqlite-store-stats.js';
import { upsertSqliteCandidate } from './sqlite-store-upsert.js';
import type {
  CandidateDecision,
  CreateCandidateInput,
  FindMemoriesForFileOptions,
  FindMemoriesForFileResponse,
  LegacyImportResult,
  ListSagePageOptions,
  ListSagePageResult,
  MemoryAudienceContext,
  MemoryCandidate,
  MemoryCandidateResolution,
  MemoryGraphEdge,
  MemoryGraphRelation,
  MemoryVerificationResult,
  RememberSageInput,
  Sage,
  SageAuditRecord,
  SageBackfillOptions,
  SageBackfillReport,
  SageForPathOptions,
  SageHygieneOptions,
  SageHygieneReport,
  SageSearchOptions,
  SageStats,
  SageStatus,
  SageStoreOptions,
  SessionConsolidationInput,
  SessionConsolidationResult,
  UpdateSageInput,
} from './types.js';

export { sqliteStoreCoverage } from './sqlite-store-coverage.js';
export { isSqliteAvailable } from './sqlite-store-loader.js';

// ─── Store ──────────────────────────────────────────────────────────────

/**
 * @deprecated Use `createSqliteMemoryPort` and depend on Core's `MemoryPort`.
 * This class remains public only for the compatibility window.
 */
export class SqliteSageStore implements MemoryStore {
  readonly paths;
  private readonly projectRoot: string;
  private readonly now: () => Date;
  private readonly events: SageStoreOptions['events'];
  private readonly operationContext: SageStoreOptions['operationContext'];
  private traceId?: string | undefined;
  private db!: DatabaseSync;
  private initialized = false;
  private initializing: Promise<void> | undefined;
  private readonly mutationQueue = new SqliteMutationQueue();
  /**
   * Independent chain for lightweight counter updates (recordInjection,
   * recordUse). Runs independently of the main mutation chain so that
   * injection/use bookkeeping never blocks behind a heavy rememberSage
   * or consolidation — the actual benefit is skipping the withFileLock
   * I/O round-trip, not true parallelism. On a single synchronous
   * DatabaseSync connection the BEGIN/work/COMMIT blocks serialize
   * at the event-loop level; WAL+busy_timeout handles engine-level
   * contention.
   */
  private auditWritesSincePrune = 0;
  private readonly stmtCache = new SqliteStatementCache(128);

  constructor(opts: SageStoreOptions) {
    this.projectRoot = path.resolve(opts.projectRoot);
    this.paths = resolveSagePaths(this.projectRoot, opts.directory);
    this.traceId = opts.traceId;
    this.now = opts.now ?? (() => new Date());
    this.events = opts.events;
    this.operationContext = opts.operationContext;
  }

  withTraceId(traceId: string): this {
    this.traceId = traceId;
    return this;
  }

  /** Prepare-once helper: compile `sql` on first use, reuse thereafter. */
  private stmt(sql: string): ReturnType<DatabaseSync['prepare']> {
    return this.stmtCache.get(this.db, sql);
  }

  private rowToMemory(row: { data: string }): Sage {
    return sqliteRowToMemory(row);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = this.initializeOnce();
    try {
      await this.initializing;
    } catch (error) {
      // A failed migration/open must not leak a handle. Without this cleanup,
      // a retry opened a second connection while the failed WAL connection
      // remained alive (notably leaving `sage.db-shm` locked on Windows).
      this.stmtCache.clear();
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // Preserve the original initialization error.
        }
      }
      throw error;
    } finally {
      this.initializing = undefined;
    }
  }

  private async initializeOnce(): Promise<void> {
    await initializeSqliteSageStore({
      paths: this.paths,
      now: () => this.now(),
      stmt: (sql) => this.stmt(sql),
      setDb: (db) => {
        this.db = db;
      },
      syncAnchorEdges: (memory) => this.syncAnchorEdges(memory),
      migrateFromJsonl: () => this.migrateFromJsonl(),
    });
    initSageHqSync(this.db);
    // H2 (docs/sage-phase4-design.md): reconcile candidates whose memoryId
    // annotation was lost to a crash between rememberSage and the annotation
    // write. Recovery failure is audited, never fatal — the store must open.
    try {
      await this.runMutation(() =>
        reconcileAcceptedCandidates({
          stmt: (sql) => this.stmt(sql),
          nowIso: () => this.nowIso(),
          audit: (event, data) => this.audit(event, data),
        }),
      );
    } catch (error) {
      this.audit('memory.candidate_accept_reconcile_failed', {
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }
    this.initialized = true;
  }

  // ─── JSONL migration ────────────────────────────────────────────────

  private async migrateFromJsonl(): Promise<void> {
    await migrateSqliteLegacyJsonl({
      paths: this.paths,
      db: this.db,
      stmt: (sql) => this.stmt(sql),
      nowIso: () => this.nowIso(),
      traceId: this.currentTraceId(),
      upsertMemory: (memory) => this.upsertMemory(memory),
      syncAnchorEdges: (memory) => this.syncAnchorEdges(memory),
    });
  }

  // ─── Core helpers ───────────────────────────────────────────────────

  private nowIso(): string {
    return this.now().toISOString();
  }

  private currentTraceId(): string | undefined {
    return this.operationContext?.()?.traceId ?? this.traceId;
  }

  private cascadeDeleteEdges(nodeId: string): void {
    delegateCascadeDeleteEdges((sql) => this.stmt(sql), nodeId);
  }

  /**
   * Serialize mutations with the file lock and a single SQLite write transaction.
   * Multi-statement paths (remember merge, cascade delete, counter batch) commit
   * once instead of once per prepared statement.
   */
  private runMutation<T>(work: () => T, signal?: AbortSignal): Promise<T> {
    return this.mutationQueue.runLocked({
      db: this.db,
      lockPath: path.join(this.paths.locksDir, 'store-mutation'),
      work,
      signal,
    });
  }

  /**
   * Lightweight independent chain for counter-only updates (recordInjection,
   * recordUse). Skips the file lock (saving an I/O round-trip) and runs
   * independently from the main mutation chain so that counter bookkeeping
   * never delays or is delayed by a heavy remember/consolidate.
   *
   * The two chains are independent Promise chains, not truly concurrent:
   * on a single synchronous DatabaseSync connection the BEGIN/work/COMMIT
   * blocks serialize at the event-loop level, so cross-chain ordering is
   * well-defined. WAL + busy_timeout handles engine-level contention.
   * Counter updates are idempotent and loss-tolerant (they increment
   * advisory statistics), so a transient SQLITE_BUSY is safe.
   */
  private runCounterMutation<T>(work: () => T extends Promise<unknown> ? never : T): Promise<T> {
    return this.mutationQueue.runCounter(this.db, work);
  }

  protected runCompositeOperation<T>(work: () => Promise<T>): Promise<T> {
    return this.mutationQueue.runCompositeOperation(work);
  }

  // ─── Public API ─────────────────────────────────────────────────────

  /**
   * Store (or merge) a SAGE record.
   *
   * **Field precedence for the dual-bridge API:**
   * - `scope` (SageScope) and `kind` (SageKind) are the primary
   *   fields. `legacyScope` (MemoryScope) and `type` (MemoryType) are read-only
   *   bridges for backward compatibility with the legacy `MemoryStore` API.
   * - When `scope` is omitted, it is derived from `legacyScope` via
   *   `legacyToSageScope()`.  Defaults to `'project'` when neither is given.
   * - When `kind` is omitted, it is derived from `type` via
   *   `legacyTypeToKind()`.  Defaults to `'fact'` when neither is given.
   * - **`kind` always wins over `type`**, and **`scope` always wins over
   *   `legacyScope`**.  Callers supplying both should ensure they are
   *   semantically consistent.
   */
  async rememberSage(input: RememberSageInput): Promise<Sage> {
    return rememberSageFromHost(this.sqliteStoreGraphWriteHost(), input);
  }

  // ─── Legacy MemoryStore compatibility ──────────────────────────────

  async readAll(): Promise<string> {
    return readAllSqliteMemory((scope) => this.read(scope));
  }

  async read(scope: MemoryScope): Promise<string> {
    return readSqliteMemory((targetScope) => this.list(targetScope), scope);
  }

  async remember(
    text: string,
    scope: MemoryScope = 'project-memory',
    metadata?: Omit<Partial<MemoryEntry>, 'scope' | 'text' | 'ts'>,
  ): Promise<void> {
    return rememberSqliteMemoryBridge((input) => this.rememberSage(input), text, scope, metadata);
  }

  async forget(query: string, scope: MemoryScope = 'project-memory'): Promise<number> {
    return forgetFromHost.call(this.sqliteMemoryMutationsHost(), query, scope);
  }

  async consolidate(scope: MemoryScope): Promise<void> {
    return consolidateFromHost.call(this.sqliteMemoryMutationsHost(), scope);
  }

  async clear(scope?: MemoryScope): Promise<void> {
    return clearFromHost.call(this.sqliteMemoryMutationsHost(), scope);
  }

  async list(scope: MemoryScope = 'project-memory', limit?: number): Promise<MemoryEntry[]> {
    await this.initialize();
    return listLegacySqliteMemory({ stmt: (sql) => this.stmt(sql) }, scope, limit);
  }

  private upsertMemory(m: Sage): void {
    upsertMemoryFromHost.call(this.sqliteMemoryMutationsHost(), m);
  }

  async listHqSync(after = ''): Promise<HqSageRecord[]> {
    await this.initialize();
    return listSageHqSync(this.db, after);
  }

  async getHqSyncVersion(): Promise<string> {
    await this.initialize();
    return sageHqSyncVersion(this.db);
  }

  async applyHqSync(records: HqSageRecord[]): Promise<void> {
    return applyHqSyncFromHost.call(this.sqliteMemoryMutationsHost(), records);
  }

  private upsertCandidate(candidate: MemoryCandidate, canonicalText?: string): void {
    upsertSqliteCandidate((sql) => this.stmt(sql), candidate, canonicalText);
  }

  /**
   * Maintain typed anchor graph edges for the SQLite-backed store.
   *
   * The canonical JSONL store only rebuilds anchor edges inside its
   * `addAutomaticEdges` consolidation / relationship-proposal pass and
   * skips the rebuild on plain text or tag-only updates. The SQLite port
   * additionally keeps edge weights and soft-delete state in lock-step
   * with memory rows; this is new SQLite-side behavior, not a 1:1 parity
   * of the canonical pass.
   *
   * Responsibility split:
   * - `syncAnchorEdges` (this method) only touches the `about_*` relation
   *   family (file / directory / symbol / package / command / agent).
   *   Callers invoke it after inserts and after updates that change anchors,
   *   confidence, or eligibility for the active/stale anchor graph.
   * - `cascadeDeleteEdges` (used by forget / clear / deleteSage)
   *   drops outgoing and incoming edges for the memory node (preserving
   *   `related_to` structural edges shared across memories), which is
   *   required when a row is fully removed but is overkill for a
   *   plain upsert. The overlap on `about_*` is intentional and safe:
   *   the edge rewrite runs inside `runMutation` so it is serialized,
   *   and `ON CONFLICT … DO UPDATE` makes the inserts idempotent.
   *
   *   NOTE: with `ON CONFLICT … DO UPDATE SET weight = MAX(weight, excluded.weight)`
   *   (unified 2026-08-02, see sqlite-store-schema.ts) concurrent writers can
   *   never erode an edge, but the weight is still the confidence of whichever
   *   memory synced LAST when multiple memories share the same anchor target —
   *   a last-sync-wins race on WHICH memory's confidence is reflected, not a
   *   CRDT merge. Acceptable because the value tracks the most recently
   *   refreshed confidence and re-sync converges to the newer memory.
   */
  private syncAnchorEdges(memory: Sage): void {
    syncAnchorEdgesFromHost(this.sqliteStoreGraphWriteHost(), memory);
  }

  async updateSage(id: string, input: UpdateSageInput): Promise<Sage> {
    return updateSageFromHost.call(this.sqliteMemoryMutationsHost(), id, input);
  }

  async hardDeleteSage(id: string, reason?: string): Promise<{ deleted: true; id: string }> {
    return hardDeleteSageFromHost.call(this.sqliteMemoryMutationsHost(), id, reason);
  }

  async recordInjection(memoryIds: string[], trigger: string, sessionId?: string): Promise<void> {
    return recordInjectionFromHost.call(
      this.sqliteMemoryMutationsHost(),
      memoryIds,
      trigger,
      sessionId,
    );
  }

  async recordUse(memoryIds: string[], source: string, sessionId?: string): Promise<void> {
    return recordUseFromHost.call(this.sqliteMemoryMutationsHost(), memoryIds, source, sessionId);
  }

  async searchSage(query: string, opts?: SageSearchOptions): Promise<Sage[]> {
    await this.initialize();
    return searchSqliteSageWithRecall((sql) => this.stmt(sql), query, opts);
  }
  /** See {@link explainSqliteSageRecall}. */
  async searchSageWithBreakdown(
    query: string,
    opts?: SageSearchOptions,
  ): Promise<VectorAugmentHit[]> {
    await this.initialize();
    return explainSqliteSageRecall((sql) => this.stmt(sql), query, opts);
  }

  async retrieveForPath(paths: string[], opts?: SageForPathOptions): Promise<Sage[]> {
    await this.initialize();
    return retrieveSqliteSageForPath(
      { projectRoot: this.projectRoot, stmt: (sql) => this.stmt(sql) },
      paths,
      opts,
    );
  }

  /** SQLite equivalent of JSONL graph/metadata expansion. */
  async findRelatedSage(memoryIds: string[], opts: SqliteFindRelatedOptions = {}): Promise<Sage[]> {
    await this.initialize();
    return findRelatedSqliteSage(
      {
        stmt: (sql) => this.stmt(sql),
        traverseGraph: (starts, graphOpts) => this.traverseGraph(starts, graphOpts),
      },
      memoryIds,
      opts,
    );
  }
  /** See {@link retrieveSageAudienceWithAudit}. */
  async retrieveForAudience(
    context: MemoryAudienceContext,
    limit?: number,
    onTruncated?: (info: { sqlRowsExamined: number; returned: number }) => void,
    sessionId?: string | undefined,
    includeAllSessions?: boolean | undefined,
  ): Promise<Sage[]> {
    await this.initialize();
    return retrieveSageAudienceWithAudit(
      (sql) => this.stmt(sql),
      (event, data) => this.audit(event, data),
      context,
      limit,
      onTruncated,
      sessionId,
      includeAllSessions,
    );
  }

  async listMemories(opts?: {
    status?: SageStatus | 'all';
    kind?: string;
    limit?: number;
    offset?: number;
  }): Promise<Sage[]> {
    await this.initialize();
    return listSqliteMemories({ stmt: (sql) => this.stmt(sql) }, opts);
  }

  /**
   * Paginated, status-filtered listing (SQLite backend). Mirrors
   * `SageStore.listSagePage`: defaults to EXCLUDING `deleted`, returns a
   * bounded page plus an opaque `updatedAt`/`id` cursor, and reports total +
   * whole-store `statusCounts` for UI tab badges.
   *
   * Ordering: `updated_at DESC, id DESC`. Cursor pagination uses the tuple
   * comparison `(updated_at, id) < (cursorUpdatedAt, cursorId)` which the
   * composite DESC index can serve without scanning skipped pages.
   */
  async listSagePage(options: ListSagePageOptions = {}): Promise<ListSagePageResult> {
    await this.initialize();
    return listSqliteSagePage({ stmt: (sql) => this.stmt(sql) }, options);
  }

  async getStats(): Promise<SageStats> {
    await this.initialize();
    return getSqliteSageStats({ stmt: (sql) => this.stmt(sql) });
  }

  // ─── Graph ──────────────────────────────────────────────────────────

  async addGraphEdge(
    from: string,
    to: string,
    relation: MemoryGraphRelation,
    weight = 1,
  ): Promise<void> {
    return delegateAddGraphEdge(this.sqliteStoreGraphHost(), from, to, relation, weight);
  }

  async traverseGraph(
    starts: string[],
    opts?: { maxDepth?: number; limit?: number },
  ): Promise<MemoryGraphEdge[]> {
    await this.initialize();
    return traverseSqliteGraph({ stmt: (sql) => this.stmt(sql) }, starts, opts);
  }

  /**
   * Resolve a free-form graph query (a node id, a bare memory id, a project
   * path, or arbitrary text) into start nodes, then traverse. Restores the
   * host-facing `graphFor` surface the legacy JSONL store exposed and that the
   * `/memory graph` command and the webui graph handler still call.
   */
  async graphFor(query: string, maxDepth = 2, limit = 100): Promise<MemoryGraphEdge[]> {
    return delegateGraphFor(this.sqliteStoreGraphHost(), query, maxDepth, limit);
  }

  /**
   * Re-check the filesystem anchors of one memory (or every non-deleted memory)
   * and reconcile status: a memory whose anchors have vanished flips
   * active→stale; a stale memory whose anchors reappear flips back to active.
   * Restores the standalone `verify` surface the JSONL store exposed and that
   * `/memory verify` still calls. The SQLite hygiene pass runs the same probe
   * inline, but the host-facing surface needs it as a discrete operation.
   */
  async verify(memoryId?: string, signal?: AbortSignal): Promise<MemoryVerificationResult[]> {
    return verifyFromHost(this.sqliteStoreGraphWriteHost(), memoryId, signal);
  }

  // ─── Audit ──────────────────────────────────────────────────────────

  private audit(event: string, data?: Record<string, unknown>): void {
    auditFromHost(this.sqliteStoreGraphWriteHost(), event, data);
  }

  /** Delete all but the most recent {@link AUDIT_LOG_MAX_ROWS} audit rows. */
  private pruneAuditLog(): void {
    pruneSqliteAuditLog({ stmt: (sql) => this.stmt(sql) });
  }

  /**
   * Read the most recent audit events, newest first. Backs `/memory audit`.
   * Bounded by {@link AUDIT_LOG_MAX_ROWS} retention, so this is a rolling
   * window of recent activity, not a full history.
   */
  async readAudit(limit = 50): Promise<SageAuditRecord[]> {
    await this.initialize();
    return readSqliteAudit({ stmt: (sql) => this.stmt(sql) }, limit);
  }

  private eventPayload<T extends object>(
    payload: T,
  ): T & { traceId?: string | undefined; sessionId?: string | undefined } {
    const context = this.operationContext?.();
    const traceId = context?.traceId ?? this.traceId;
    return {
      ...payload,
      ...(traceId ? { traceId } : {}),
      ...(context?.sessionId ? { sessionId: context.sessionId } : {}),
    };
  }

  private candidateHost(): SqliteCandidateHost {
    return {
      projectRoot: this.projectRoot,
      paths: this.paths,
      stmt: (...args) => this.stmt(...args),
      nowIso: (...args) => this.nowIso(...args),
      runMutation: (...args) => this.runMutation(...args),
      rememberSage: (...args) => this.rememberSage(...args),
      updateSage: (...args) => this.updateSage(...args),
      upsertCandidate: (...args) => this.upsertCandidate(...args),
      audit: (...args) => this.audit(...args),
    };
  }

  // ─── Hygiene ────────────────────────────────────────────────────────

  async hygiene(opts?: SageHygieneOptions): Promise<SageHygieneReport> {
    return hygieneFromHost(this.sqliteStoreGraphWriteHost(), opts);
  }

  // ─── Candidates ─────────────────────────────────────────────────────

  async addCandidate(candidate: MemoryCandidate): Promise<void> {
    await this.initialize();
    return addCandidateOp(this.candidateHost(), candidate);
  }

  async createCandidate(input: CreateCandidateInput): Promise<MemoryCandidate> {
    await this.initialize();
    return createCandidateOp(this.candidateHost(), input);
  }

  async listCandidates(includeResolved = false): Promise<MemoryCandidate[]> {
    await this.initialize();
    return listCandidatesOp(this.candidateHost(), includeResolved);
  }

  async acceptCandidate(candidateId: string): Promise<Sage | undefined> {
    await this.initialize();
    return this.runCompositeOperation(() => acceptCandidateOp(this.candidateHost(), candidateId));
  }

  async rejectCandidate(candidateId: string, reason: string): Promise<boolean> {
    await this.initialize();
    return rejectCandidateOp(this.candidateHost(), candidateId, reason);
  }

  async resolveCandidate(
    candidateId: string,
    decision: CandidateDecision,
    reason?: string,
  ): Promise<MemoryCandidateResolution | undefined> {
    await this.initialize();
    return this.runCompositeOperation(() =>
      resolveCandidateOp(this.candidateHost(), candidateId, decision, reason),
    );
  }

  // ─── Legacy compat ──────────────────────────────────────────────────

  async importLegacy(raw: string): Promise<LegacyImportResult> {
    return this.runCompositeOperation(() =>
      importLegacySqliteMemory({ rememberSage: (input) => this.rememberSage(input) }, raw),
    );
  }

  async consolidateSession(input: SessionConsolidationInput): Promise<SessionConsolidationResult> {
    await this.initialize();
    return this.runCompositeOperation(() =>
      consolidateSqliteSession(
        {
          stmt: (sql) => this.stmt(sql),
          listCandidates: () => this.listCandidates(),
          createCandidate: (candidate) => this.createCandidate(candidate),
          acceptCandidate: (candidateId) => this.acceptCandidate(candidateId),
        },
        input,
      ),
    );
  }

  // ─── Alias methods matching SageStore's public API ──────────

  async unifiedSearchService(query: SearchQuery, options?: SearchOptions): Promise<SearchResult> {
    await this.initialize();
    return executeUnifiedSearch(this.adminHost(), query, options);
  }

  async stats(): Promise<SageStats> {
    return this.getStats();
  }

  async listSage(statuses?: SageStatus[]): Promise<Sage[]> {
    await this.initialize();
    return listCompatSage({ stmt: (sql) => this.stmt(sql) }, statuses);
  }

  async getSage(id: string): Promise<Sage | null> {
    await this.initialize();
    return getCompatSage(
      {
        stmt: (sql) => this.stmt(sql),
        nowIso: () => this.nowIso(),
        rowToMemory: (row) => this.rowToMemory(row),
      },
      id,
    );
  }

  async recoverSage(id: string, reason?: string): Promise<Sage> {
    await this.initialize();
    return this.runCompositeOperation(() => recoverAdminSage(this.adminHost(), id, reason));
  }
  async backfillRecoverable(options?: SageBackfillOptions): Promise<SageBackfillReport> {
    await this.initialize();
    return this.runCompositeOperation(() => backfillAdminSage(this.adminHost(), options));
  }
  async findMemoriesForFile(
    filePath: string,
    options?: FindMemoriesForFileOptions,
  ): Promise<FindMemoriesForFileResponse> {
    await this.initialize();
    return findAdminMemoriesForFile(this.adminHost(), filePath, options);
  }
  private adminHost(): SqliteAdminHost {
    return {
      projectRoot: this.projectRoot,
      now: (...args) => this.now(...args),
      nowIso: (...args) => this.nowIso(...args),
      stmt: (...args) => this.stmt(...args),
      runMutation: (...args) => this.runMutation(...args),
      upsertMemory: (...args) => this.upsertMemory(...args),
      syncAnchorEdges: (...args) => this.syncAnchorEdges(...args),
      audit: (...args) => this.audit(...args),
      emit: (event, payload) =>
        this.events?.emit(event as never, this.eventPayload(payload) as never),
      listCandidates: (...args) => this.listCandidates(...args),
    };
  }

  async search(
    query: string,
    scope: MemoryScope = 'project-memory',
    limit?: number,
  ): Promise<MemoryEntry[]> {
    return searchLegacySqliteMemory(
      { searchSage: (targetQuery, opts) => this.searchSage(targetQuery, opts) },
      query,
      scope,
      limit,
    );
  }

  async deleteSage(
    id: string,
    reason = 'Manually deleted via API.',
    options: { force?: boolean; neverInject?: boolean } = {},
  ): Promise<void> {
    return deleteSageFromHost(this.sqliteStoreGraphWriteHost(), id, reason, options);
  }

  async drainMutations(): Promise<void> {
    await drainSqliteStoreMutations(this.mutationQueue);
  }

  close(): void {
    closeSqliteStore(this.stmtCache, this.db);
  }

  private sqliteStoreGraphHost(): SqliteStoreGraphHost {
    return {
      stmt: (...args) => this.stmt(...args),
      nowIso: (...args) => this.nowIso(...args),
      initialize: (...args) => this.initialize(...args),
      events: this.events,
      eventPayload: (...args) => this.eventPayload(...args),
      projectRoot: this.projectRoot,
      searchSage: (...args) => this.searchSage(...args),
      traverseGraph: (...args) => this.traverseGraph(...args),
    };
  }

  private sqliteMemoryMutationsHost(): SqliteMemoryMutationsHost {
    // Preserve the owner's instance and check each member against the helper contract.
    void (this.initialize satisfies SqliteMemoryMutationsHost['initialize']);
    void (this.runMutation satisfies SqliteMemoryMutationsHost['runMutation']);
    void (this.stmt satisfies SqliteMemoryMutationsHost['stmt']);
    void (this.nowIso satisfies SqliteMemoryMutationsHost['nowIso']);
    void (this.upsertMemory satisfies SqliteMemoryMutationsHost['upsertMemory']);
    void (this.cascadeDeleteEdges satisfies SqliteMemoryMutationsHost['cascadeDeleteEdges']);
    void (this.audit satisfies SqliteMemoryMutationsHost['audit']);
    void (this.events satisfies SqliteMemoryMutationsHost['events']);
    void (this.syncAnchorEdges satisfies SqliteMemoryMutationsHost['syncAnchorEdges']);
    void (this.db satisfies SqliteMemoryMutationsHost['db']);
    void (this.projectRoot satisfies SqliteMemoryMutationsHost['projectRoot']);
    void (this.eventPayload satisfies SqliteMemoryMutationsHost['eventPayload']);
    void (this.deleteSage satisfies SqliteMemoryMutationsHost['deleteSage']);
    void (this.runCounterMutation satisfies SqliteMemoryMutationsHost['runCounterMutation']);
    return this as unknown as SqliteMemoryMutationsHost;
  }

  private sqliteStoreGraphWriteHost(): SqliteStoreGraphWriteHost {
    // Check the complete helper contract while preserving the owner's identity and receivers.
    void ({
      sqliteStoreGraphHost: this.sqliteStoreGraphHost,
      projectRoot: this.projectRoot,
      initialize: this.initialize,
      nowIso: this.nowIso,
      stmt: this.stmt,
      runMutation: this.runMutation,
      upsertMemory: this.upsertMemory,
      syncAnchorEdges: this.syncAnchorEdges,
      events: this.events,
      eventPayload: this.eventPayload,
      runCompositeOperation: this.runCompositeOperation,
      currentTraceId: this.currentTraceId,
      auditWritesSincePrune: this.auditWritesSincePrune,
      now: this.now,
      listMemories: this.listMemories,
      listCandidates: this.listCandidates,
      addCandidate: this.addCandidate,
      cascadeDeleteEdges: this.cascadeDeleteEdges,
      audit: this.audit,
      pruneAuditLog: this.pruneAuditLog,
    } satisfies SqliteStoreGraphWriteHost);
    return this as unknown as SqliteStoreGraphWriteHost;
  }
}
