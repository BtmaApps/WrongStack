import { randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { isStandaloneBinary } from '@wrongstack/persistence';
import { DefaultSecretScrubber } from '../security/secret-scrubber.js';
import {
  resolveSessionCatalogProjectServerUrl,
  SessionCatalogProjectClient,
} from '../session-catalog/client.js';
import type { Logger } from '../types/logger.js';
import type { SecretScrubber } from '../types/secret-scrubber.js';
import type {
  ForkedSession,
  ResumedSession,
  SessionArchiveIdleResult,
  SessionArchiveResult,
  SessionData,
  SessionEvent,
  SessionForkOptions,
  SessionLoadProgress,
  SessionMetadata,
  SessionMoveResult,
  SessionMoveTarget,
  SessionStoragePolicy,
  SessionStore,
  SessionSummary,
  SessionWriter,
  WorkspaceCheckpointRef,
} from '../types/session.js';
import { withFileLock } from '../utils/atomic-write.js';
import type { EventBus } from './event-bus-port.js';
import { SessionCheckpointCas } from './session-checkpoint-cas.js';
import {
  type CheckpointGcResult,
  collectReachableManifestHashes,
  sweepCheckpointCas,
} from './session-checkpoint-gc.js';
import { captureCheckpoint, materializeCheckpoint } from './session-helpers.js';
import { resolveSessionId, sessionIdResolutionError } from './session-id-resolver.js';
import { scrubPersistedSessionSummary } from './session-read-scrubber.js';
import { type CreateSessionHost, executeCreateSession } from './session-store/create-session.js';
import { deleteSessionArtifacts } from './session-store/delete-session-artifacts.js';
import { assertSessionCanBeDeleted } from './session-store/delete-session-guards.js';
import { collectSessionIds as collectSessionIdsFromDirectory } from './session-store/directory-session-files.js';
import { forkSession } from './session-store/fork-session.js';
import {
  executeListFilteredSessions,
  executeListSessions,
  type ListSessionsHost,
} from './session-store/list-sessions.js';
import { SessionLoadCache } from './session-store/load-cache.js';
import { executeLoadSession } from './session-store/load-session.js';
import { executeAdoptMovedSession } from './session-store/move-session.js';
import {
  ensureShardDir as ensureSessionShardDir,
  sessionPath as sessionStorePath,
  shardKeyForSessionId,
  shardManifestPath,
} from './session-store/paths.js';
import { executeResumeSession } from './session-store/resume-session.js';
import { searchSessionEvents } from './session-store/search-events.js';
import {
  executeArchive,
  executeEnsureHot,
  executeRehydrate,
  type SessionArchiveHost,
} from './session-store/session-archive.js';
import {
  type CachedShardManifest,
  listFromDirectoryScan,
  type ShardScanHost,
} from './session-store/shard-scan.js';
import { isStrictlyEmptySessionFile } from './session-store/strict-empty-check.js';
import { summarizeSessionFile } from './session-store/summary-builder.js';
import { readSessionSummaryHeader } from './session-store/summary-header.js';
import {
  executeSummaryFor,
  readSummaryManifestFile,
  type SummaryManifestHost,
} from './session-store/summary-manifest.js';
import { locateTranscript, type TranscriptLocation } from './session-store/transcript-location.js';
import type {
  IndexCacheEntry,
  SessionFileRef,
  SessionStoreOptions,
} from './session-store/types.js';
import {
  appendToIndexStrictFromState as appendToIndexStrictFromHost,
  compactIndex as compactIndexFromHost,
  compactIndexInnerFromState as compactIndexInnerFromHost,
  persistCatalogSummary as persistCatalogSummaryFromHost,
  readIndex as readIndexFromHost,
  rebuildIndex as rebuildIndexFromHost,
  type SessionStoreIndexHost,
  writeTombstoneFromState as writeTombstoneFromHost,
} from './session-store-index.js';
import type { SessionStoreRetentionHost } from './session-store-retention.js';
import {
  archiveIdle as archiveIdleFromHost,
  clearHistory as clearHistoryFromHost,
  move as moveFromHost,
  prune as pruneFromHost,
  rename as renameFromHost,
} from './session-store-retention.js';
import { assertRetentionDays } from './session-store-retention-support.js';

export type { SessionStoreOptions } from './session-store/types.js';

export class DefaultSessionStore implements SessionStore {
  private readonly dir: string;
  private readonly events?: EventBus | undefined;
  private readonly secretScrubber: SecretScrubber;
  private readonly projectRoot?: string | undefined;
  private readonly checkpointCas?: SessionCheckpointCas | undefined;
  private readonly isSessionInUse?: ((sessionId: string) => Promise<string | null>) | undefined;
  private readonly logger: Logger | undefined;
  private readonly onAppend?: ((event: SessionEvent) => void) | undefined;
  private readonly onAppendBatch?: ((events: SessionEvent[]) => void) | undefined;
  private readonly catalogClient: SessionCatalogProjectClient | undefined;
  private readonly maintenanceHolderId = randomUUID();
  private readonly storagePolicy: SessionStoragePolicy;
  private readonly autoArchive: boolean;
  /**
   * One idle-archive pass at a time. A second caller with the same policy
   * shares it; a different policy waits, then runs on its own. The promise
   * here is the inner pass, not the async wrapper, so a later policy cannot
   * be cleared by the earlier pass's `finally`.
   */
  private archiveIdleInFlight: {
    key: string;
    promise: Promise<SessionArchiveIdleResult>;
  } | null = null;

  private readonly _loadCache = new Map<
    string,
    import('./session-store/types.js').LoadCacheEntry
  >();
  private readonly loadCache = new SessionLoadCache(this._loadCache);
  private _indexCache: IndexCacheEntry | null = null;
  /**
   * Tombstoned ids — hidden even if their JSONL remains on disk.
   * Convention: readIndex() REASSIGNS this set from the parsed index file
   * MERGED with _manualTombstones; writeTombstone() adds in-place immediately
   * so an incremental cache rebuild can never resurrect a just-deleted
   * session.
   */
  private _indexDeletedIds = new Set<string>();
  /**
   * Tombstones added by THIS store between reads. Merged into every fresh
   * snapshot so a read racing writeTombstone cannot drop an in-flight
   * deletion; entries are pruned once the parsed index file itself carries
   * them.
   */
  private readonly _manualTombstones = new Set<string>();
  /**
   * File-truth tombstones from the last readIndex() parse (EXCLUDES
   * _manualTombstones additions). compactIndexInner persists THIS snapshot so
   * concurrent writeTombstones that landed after the parse are not written
   * prematurely — they persist through their own append path instead.
   */
  private _indexFileDeletedIds: ReadonlySet<string> = new Set<string>();
  private readonly shardManifestCache = new Map<string, CachedShardManifest>();
  private indexAppendCount = 0;

  constructor(opts: SessionStoreOptions) {
    this.dir = opts.dir;
    this.projectRoot = opts.projectRoot ? path.resolve(opts.projectRoot) : undefined;
    this.checkpointCas = this.projectRoot
      ? new SessionCheckpointCas({
          rootDir: path.join(this.dir, '_cas'),
          projectRoot: this.projectRoot,
        })
      : undefined;
    this.events = opts.events;
    this.secretScrubber = opts.secretScrubber ?? new DefaultSecretScrubber();
    this.isSessionInUse = opts.isSessionInUse;
    this.logger = opts.logger;
    this.onAppend = opts.onAppend;
    this.onAppendBatch = opts.onAppendBatch;
    this.storagePolicy = {
      hotKeepSessions: Math.min(
        10_000,
        Math.max(1, Math.floor(opts.storage?.hotKeepSessions ?? 20)),
      ),
      archiveAfterDays: Math.min(
        3_650,
        Math.max(0, Math.floor(opts.storage?.archiveAfterDays ?? 7)),
      ),
      includeSubagents: opts.storage?.includeSubagents !== false,
    };
    this.autoArchive = opts.storage?.autoArchive === true;
    // The standalone binary is a built runtime too, but its modules live at the
    // executable's virtual URL (no `/dist/`). Missing it here silently ran the
    // binary without the catalog daemon — and `/clear` then rewrote a session
    // file still open elsewhere, which Windows refuses (EPERM).
    const builtRuntime = isStandaloneBinary() || import.meta.url.includes('/dist/');
    this.catalogClient =
      this.projectRoot &&
      (builtRuntime || process.env['WRONGSTACK_SESSION_CATALOG_FORCE'] === '1') &&
      resolveSessionCatalogProjectServerUrl()
        ? new SessionCatalogProjectClient({
            projectDir: path.dirname(this.dir),
            projectRoot: this.projectRoot,
          })
        : undefined;
  }

  private logWarn(msg: string, ctx?: Record<string, unknown>): void {
    if (this.logger) {
      this.logger.warn(msg, ctx);
    } else {
      console.warn(JSON.stringify({ ...ctx, message: msg, timestamp: new Date().toISOString() }));
    }
  }

  private scrubSummaries(summaries: readonly SessionSummary[]): SessionSummary[] {
    return summaries.map((summary) => scrubPersistedSessionSummary(summary, this.secretScrubber));
  }

  clearLoadCache(sessionId?: string): void {
    this.loadCache.clear(sessionId);
  }

  async dispose(): Promise<void> {
    await this.catalogClient?.close();
    this.clearLoadCache();
  }

  private get indexFile(): string {
    return path.join(this.dir, '_index.jsonl');
  }

  private sessionPath(id: string, ext: '.jsonl' | '.jsonl.gz' | '.summary.json'): string {
    return sessionStorePath(this.dir, id, ext);
  }

  private async requireTranscript(id: string) {
    const located = await locateTranscript(this.dir, id);
    if (!located) throw new Error(`Session not found: ${id}`);
    return located;
  }

  private shardManifestPath(shardKey: string): string {
    return shardManifestPath(this.dir, shardKey);
  }

  private shardKeyForSessionId(id: string): string {
    return shardKeyForSessionId(id);
  }

  private async invalidateShardManifestBySessionId(id: string): Promise<void> {
    const shardKey = this.shardKeyForSessionId(id);
    const manifestPath = this.shardManifestPath(shardKey);
    await withFileLock(manifestPath, async () => {
      this.shardManifestCache.delete(shardKey);
      try {
        await fsp.unlink(manifestPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    });
  }

  private async ensureShardDir(id: string): Promise<string> {
    return ensureSessionShardDir(this.dir, id);
  }

  /**
   * Create a fresh session writer.
   *
   * @threadSafety Failure-prone steps (manifest invalidation, sidecar
   * removal, catalog upsert, the durable `{action:'create'}` index row)
   * run BEFORE the truncating `'w'` open, so no rejection path can destroy
   * prior bytes. Ordinary index summary rows never undelete a tombstone
   * (the parser only honors `{action:'create'}`), so a swallowed create-row
   * would leave a live writer whose id stays hidden forever — that append
   * is therefore required, not best-effort.
   */

  private asCreateHost(): CreateSessionHost {
    return {
      dir: this.dir,
      events: this.events,
      secretScrubber: this.secretScrubber,
      checkpointCas: this.checkpointCas,
      isSessionInUse: this.isSessionInUse,
      catalogClient: this.catalogClient,
      indexFile: this.indexFile,
      onAppend: this.onAppend,
      onAppendBatch: this.onAppendBatch,
      storagePolicy: this.storagePolicy,
      autoArchive: this.autoArchive,
      logWarn: (...args) => this.logWarn(...args),
      ensureShardDir: (...args) => this.ensureShardDir(...args),
      sessionPath: (...args) => this.sessionPath(...args),
      invalidateShardManifestBySessionId: (...args) =>
        this.invalidateShardManifestBySessionId(...args),
      readSummaryManifest: (...args) => this.readSummaryManifest(...args),
      persistCatalogSummary: (...args) => this.persistCatalogSummary(...args),
      archiveIdle: (...args) => this.archiveIdle(...args),
      onIndexAppendCreate: (id) => {
        this._manualTombstones.delete(id);
        this._indexDeletedIds.delete(id);
      },
      clearIndexCache: () => {
        this._indexCache = null;
      },
    };
  }

  private asArchiveHost(): SessionArchiveHost {
    return {
      dir: this.dir,
      storagePolicy: this.storagePolicy,
      isSessionInUse: this.isSessionInUse,
      catalogClient: this.catalogClient,
      maintenanceHolderId: this.maintenanceHolderId,
      secretScrubber: this.secretScrubber,
      clearLoadCache: (...args) => this.clearLoadCache(...args),
      sessionPath: (...args) => this.sessionPath(...args),
      summaryFor: (...args) => this.summaryFor(...args),
      readSummaryManifest: (...args) => this.readSummaryManifest(...args),
      invalidateShardManifestBySessionId: (...args) =>
        this.invalidateShardManifestBySessionId(...args),
      appendToIndex: (...args) => this.appendToIndex(...args),
    };
  }

  async create(meta: Omit<SessionMetadata, 'startedAt'>): Promise<SessionWriter> {
    const checkout = meta.checkout ?? this.projectRoot;
    return executeCreateSession(this.asCreateHost(), checkout ? { ...meta, checkout } : meta);
  }

  async fork(id: string, opts: SessionForkOptions = {}): Promise<ForkedSession> {
    // The child records this string as its parent. A leaf or prefix must be
    // the canonical id, or the fork tree cannot find the parent session.
    return forkSession(this, await this.resolveId(id), opts);
  }

  async readRawEvents(id: string): Promise<SessionEvent[]> {
    const hits = await this.searchEvents(id, () => true);
    return hits.map((hit) => hit.event);
  }

  async captureWorkspaceCheckpoint(sessionId: string, promptIndex: number) {
    return captureCheckpoint(this.checkpointCas, sessionId, promptIndex);
  }

  async materializeWorkspaceCheckpoint(checkpoint: WorkspaceCheckpointRef, targetRoot: string) {
    return materializeCheckpoint(this.checkpointCas, checkpoint, targetRoot);
  }

  /**
   * Reclaim workspace checkpoints no surviving transcript references.
   *
   * Deleting a session removed its transcript but never the manifest and blobs
   * that transcript pointed at, so the CAS only ever grew. This is explicit and
   * user-initiated (`/prune --checkpoints`) rather than part of boot: a full
   * reachability scan on a real store took 101 seconds.
   *
   * `maxAgeDays` is an age floor for the sweep, not a filter for what counts as
   * garbage — anything younger survives, so a mid-sweep capture is safe; an
   * unreadable transcript makes the sweep throw instead of guessing its refs.
   * A non-finite or negative age throws too: `mtime >= NaN` is never true, so
   * the floor would otherwise delete a checkpoint written moments ago.
   */
  async collectCheckpointGarbage(maxAgeDays = 30): Promise<CheckpointGcResult> {
    const ageDays = assertRetentionDays(maxAgeDays);
    const casRoot = path.join(this.dir, '_cas');
    const reachableManifestHashes = await collectReachableManifestHashes(this.dir);
    return sweepCheckpointCas({
      casRoot,
      reachableManifestHashes,
      keepNewerThanMs: Date.now() - ageDays * 86_400_000,
    });
  }

  async resolveId(query: string): Promise<string> {
    return this.resolveQuery(query, 'throw');
  }

  /**
   * Canonical id for a user-facing reference.
   *
   * `passthrough` keeps delete() idempotent for an unknown id: a missing
   * query is returned unchanged so the tombstone path can no-op, while an
   * ambiguous query still throws instead of picking a session.
   */
  private async resolveQuery(query: string, onMissing: 'throw' | 'passthrough'): Promise<string> {
    if (this.catalogClient) {
      try {
        return await this.catalogClient.call('resolve_id', { query });
      } catch (error) {
        if (onMissing === 'passthrough' && isMissingSessionError(error)) return query;
        throw error;
      }
    }
    const normalized = query.trim();
    if (!normalized) {
      if (onMissing === 'passthrough') return query;
      throw new Error('Session not found: (empty query)');
    }
    try {
      const located = await locateTranscript(this.dir, normalized);
      if (located) return normalized;
    } catch {
      // Fall through to exact-leaf / unique-prefix resolution.
    }
    const ids = await this.collectSessionIds(this.dir);
    const resolution = resolveSessionId(normalized, ids);
    if (resolution.status === 'resolved') return resolution.id;
    if (resolution.status === 'ambiguous' || onMissing === 'throw') {
      throw sessionIdResolutionError(
        resolution.status === 'ambiguous' ? resolution : { status: 'missing', query: normalized },
      );
    }
    return query;
  }

  async resume(
    id: string,
    onLoadProgress?: (progress: SessionLoadProgress) => void,
  ): Promise<ResumedSession> {
    const canonicalId = await this.resolveId(id);
    await executeEnsureHot(this.asArchiveHost(), canonicalId, false);
    const file = this.sessionPath(canonicalId, '.jsonl');
    return executeResumeSession({
      id,
      canonicalId,
      file,
      projectRoot: this.projectRoot,
      events: this.events,
      secretScrubber: this.secretScrubber,
      checkpointCas: this.checkpointCas,
      onAppend: this.onAppend,
      onAppendBatch: this.onAppendBatch,
      load: (loadId) => this.load(loadId, onLoadProgress),
      readSummaryManifest: (summaryId) => this.readSummaryManifest(summaryId),
      searchEvents: (searchId, pred) => this.searchEvents(searchId, pred),
      persistCatalogSummary: (sum) => this.persistCatalogSummary(sum),
      logWarn: (msg, ctx) => this.logWarn(msg, ctx),
      sessionsDir: this.dir,
    });
  }

  async load(
    id: string,
    onLoadProgress?: (progress: SessionLoadProgress) => void,
  ): Promise<SessionData> {
    return this.loadInternal(id, { full: true }, onLoadProgress);
  }

  async loadEventsOnly(id: string): Promise<SessionData> {
    return this.loadInternal(id, { full: false });
  }

  private async loadInternal(
    id: string,
    mode: { full: true } | { full: false },
    onLoadProgress?: (progress: SessionLoadProgress) => void,
  ): Promise<SessionData> {
    // Same reference rules as resume: a unique leaf or prefix names the
    // canonical transcript. An ambiguous or unknown reference throws.
    const canonical = await this.resolveId(id);
    const located = await this.requireTranscript(canonical);
    return executeLoadSession({
      id: canonical,
      file: located.filePath,
      full: mode.full,
      loadCache: this.loadCache,
      events: this.events,
      secretScrubber: this.secretScrubber,
      onLoadProgress,
    });
  }

  async searchEvents(
    id: string,
    predicate: (event: SessionEvent, eventIndex: number, ts: string) => boolean,
    opts?: { limit?: number | undefined; signal?: AbortSignal | undefined },
  ): Promise<Array<{ event: SessionEvent; eventIndex: number; ts: string }>> {
    // Missing stays an empty result. A unique leaf or prefix searches the
    // canonical transcript; an ambiguous reference still throws. The public
    // contract also accepts the id with a `.jsonl` / `.jsonl.gz` suffix.
    // Resolve before the limit cap: a non-positive limit is an empty hit
    // list, not a reason to hide an ambiguous id. The walker checks the cap
    // only after a push, so 0 and -1 used to return the first hit.
    const located = await this.locateSearchTranscript(id);
    if (!located) return [];
    const limit = opts?.limit;
    if (limit !== undefined && Number.isFinite(limit) && limit <= 0) return [];
    return searchSessionEvents({
      file: located.filePath,
      secretScrubber: this.secretScrubber,
      predicate,
      limit,
      signal: opts?.signal,
    });
  }

  /**
   * Resolve a search id, then the same id with one transcript suffix removed
   * when that file is not itself a session. An id that already ends in
   * `.jsonl` keeps the exact file.
   */
  private async locateSearchTranscript(id: string): Promise<TranscriptLocation | null> {
    const direct = await this.resolveQuery(id, 'passthrough');
    const located = await this.locateIfPossible(direct);
    if (located) return located;
    const stripped = stripSessionTranscriptQuery(id.trim());
    if (stripped === id.trim()) return null;
    const canonical = await this.resolveQuery(stripped, 'passthrough');
    return this.locateIfPossible(canonical);
  }

  private async locateIfPossible(id: string): Promise<TranscriptLocation | null> {
    try {
      return await locateTranscript(this.dir, id);
    } catch {
      return null;
    }
  }

  private asListSessionsHost(): ListSessionsHost {
    return {
      catalogClient: this.catalogClient,
      readIndex: (...args) => this.readIndex(...args),
      listFromDirectoryScan: (...args) => this.listFromDirectoryScan(...args),
      scrubSummaries: (...args) => this.scrubSummaries(...args),
      getIndexDeletedIds: () => this._indexDeletedIds,
    };
  }

  async list(limit = 20): Promise<SessionSummary[]> {
    return executeListSessions(this.asListSessionsHost(), limit);
  }

  async listFiltered(criteria: {
    since?: string | undefined;
    until?: string | undefined;
    provider?: string | undefined;
    model?: string | undefined;
    minTokens?: number | undefined;
    titleContains?: string | undefined;
    limit?: number | undefined;
  }): Promise<SessionSummary[]> {
    return executeListFilteredSessions(this.asListSessionsHost(), criteria);
  }

  private async appendToIndexStrict(summary: SessionSummary): Promise<void> {
    return appendToIndexStrictFromHost(this.sessionStoreIndexHost(), summary);
  }

  private async appendToIndex(summary: SessionSummary): Promise<void> {
    await this.appendToIndexStrict(summary).catch(() => undefined);
  }

  private async persistCatalogSummary(summary: SessionSummary): Promise<void> {
    return persistCatalogSummaryFromHost(this.sessionStoreIndexHost(), summary);
  }

  private async writeTombstone(id: string): Promise<void> {
    return writeTombstoneFromHost(this.sessionStoreIndexHost(), id);
  }

  private async compactIndex(): Promise<void> {
    return compactIndexFromHost(this.sessionStoreIndexHost());
  }

  /**
   * Compact the local index in place.
   *
   * Contract carried into the shared compactIndexInner helper
   * (session-store-index.ts): `entries` MUST already exclude tombstoned ids,
   * and the deleted-set argument is persisted VERBATIM — neither the helper
   * nor its callers may resurrect filtered rows or invent deletions.
   * Locking: callers MUST already hold the indexFile lock (both do:
   * compactIndex() below and the appendToIndexStrict compaction hook);
   * readIndex() inside reads that same locked file, so no second lock may
   * be taken here (non-reentrant → deadlock).
   *
   * That same lock is what makes the _indexFileDeletedIds snapshot safe to
   * pass across the await below: writeTombstone() appends under the identical
   * non-reentrant indexFile lock, so no tombstone can land between our
   * readIndex() and the snapshot handed to the helper. Compaction would
   * otherwise be racing a delete it cannot see.
   */
  private async compactIndexInner(): Promise<void> {
    return compactIndexInnerFromHost(this.sessionStoreIndexHost());
  }

  private async readIndex(): Promise<readonly SessionSummary[]> {
    return readIndexFromHost(this.sessionStoreIndexHost());
  }

  /**
   * Merge close-time index rows with directory-scan results, keyed by id.
   * Scanned entries win — their metadata is re-derived from the transcript,
   * so it reflects mid-session activity that index rows (written on close)
   * cannot know about. Indexed-only ids fill gaps; duplicates within the
   * index resolve last-wins, matching append order.
   */
  async rebuildIndex(): Promise<number> {
    return rebuildIndexFromHost(this.sessionStoreIndexHost());
  }

  private asShardScanHost(): ShardScanHost {
    return {
      dir: this.dir,
      shardManifestCache: this.shardManifestCache,
      shardManifestPath: (...args) => this.shardManifestPath(...args),
      readSummaryManifest: (...args) => this.readSummaryManifest(...args),
      summaryHeaderFor: (...args) => this.summaryHeaderFor(...args),
      summaryFor: (...args) => this.summaryFor(...args),
    };
  }

  private async listFromDirectoryScan(limit: number): Promise<SessionSummary[]> {
    return listFromDirectoryScan(this.asShardScanHost(), limit);
  }

  private async collectSessionIds(dir: string, prefix = '', depth = 0): Promise<string[]> {
    return collectSessionIdsFromDirectory(dir, prefix, depth);
  }

  private asSummaryManifestHost(): SummaryManifestHost {
    return {
      events: this.events,
      sessionPath: (...args) => this.sessionPath(...args),
      requireTranscript: (...args) => this.requireTranscript(...args),
      summarize: (...args) => this.summarize(...args),
      logWarn: (...args) => this.logWarn(...args),
    };
  }

  private async summaryFor(id: string): Promise<SessionSummary> {
    return executeSummaryFor(this.asSummaryManifestHost(), id);
  }

  private async readSummaryManifest(
    id: string,
    startTime = Date.now(),
  ): Promise<SessionSummary | null> {
    const manifest = this.sessionPath(id, '.summary.json');
    return readSummaryManifestFile(manifest, this.events, id, startTime);
  }

  private async summaryHeaderFor(ref: SessionFileRef): Promise<SessionSummary | null> {
    return readSessionSummaryHeader(ref, this.secretScrubber);
  }

  private async deleteSession(id: string): Promise<void> {
    const located = await locateTranscript(this.dir, id);
    const jsonlPath = located?.filePath ?? this.sessionPath(id, '.jsonl');
    await deleteSessionArtifacts({ rootDir: this.dir, id, jsonlPath });
    await this.writeTombstone(id);
  }

  async isEmpty(id: string): Promise<boolean> {
    const canonicalId = await this.resolveId(id);
    const located = await locateTranscript(this.dir, canonicalId);
    if (!located) return false;
    return isStrictlyEmptySessionFile(located.filePath);
  }

  async delete(id: string): Promise<void> {
    if (this.catalogClient) {
      const canonical = await this.resolveId(id);
      const lease = await this.catalogClient.call('acquire_maintenance', {
        sessionId: canonical,
        operation: 'delete',
        holderId: this.maintenanceHolderId,
      });
      try {
        await this.catalogClient.call('delete', { sessionId: canonical, lease });
      } catch (error) {
        await this.catalogClient.call('release_maintenance', { lease }).catch(() => undefined);
        throw error;
      }
      this.clearLoadCache(canonical);
      if (id !== canonical) this.clearLoadCache(id);
      return;
    }
    // Unknown ids stay idempotent. A unique leaf or prefix must delete the
    // canonical transcript — tombstoning the query itself leaves the session
    // on disk and still listed.
    const canonical = await this.resolveQuery(id, 'passthrough');
    await assertSessionCanBeDeleted(canonical, this.isSessionInUse);
    await this.deleteSession(canonical);
    if (id !== canonical) this.clearLoadCache(id);
  }

  get sessionsDir(): string {
    return this.dir;
  }

  async move(id: string, target: SessionMoveTarget): Promise<SessionMoveResult> {
    return moveFromHost.call(this.sessionStoreRetentionHost(), id, target);
  }

  adoptMovedSession(id: string, name: string | undefined): Promise<SessionSummary> {
    return executeAdoptMovedSession(this.asArchiveHost(), id, name);
  }

  async rename(id: string, name: string): Promise<SessionSummary> {
    return renameFromHost.call(this.sessionStoreRetentionHost(), id, name);
  }

  async prune(maxAgeDays = 30): Promise<number> {
    return pruneFromHost.call(this.sessionStoreRetentionHost(), maxAgeDays);
  }

  async clearHistory(id: string): Promise<void> {
    return clearHistoryFromHost.call(this.sessionStoreRetentionHost(), id);
  }

  async archive(id: string): Promise<SessionArchiveResult> {
    const canonical = await this.resolveId(id);
    return executeArchive(this.asArchiveHost(), canonical);
  }

  async rehydrate(id: string): Promise<SessionArchiveResult> {
    const canonical = await this.resolveId(id);
    return executeRehydrate(this.asArchiveHost(), canonical);
  }

  async archiveIdle(policy?: Partial<SessionStoragePolicy>): Promise<SessionArchiveIdleResult> {
    return archiveIdleFromHost.call(this.sessionStoreRetentionHost(), policy);
  }

  private async summarize(id: string, mtime: string): Promise<SessionSummary> {
    const located = await locateTranscript(this.dir, id);
    return summarizeSessionFile({
      id,
      file: located?.filePath ?? this.sessionPath(id, '.jsonl'),
      mtime,
      secretScrubber: this.secretScrubber,
    });
  }

  private sessionStoreRetentionHost(): SessionStoreRetentionHost {
    // Preserve the owner's instance and check each member against the helper contract.
    void (this.asArchiveHost satisfies SessionStoreRetentionHost['asArchiveHost']);
    void (this.projectRoot satisfies SessionStoreRetentionHost['projectRoot']);
    void (this.deleteSession satisfies SessionStoreRetentionHost['deleteSession']);
    void (this.resolveId satisfies SessionStoreRetentionHost['resolveId']);
    void (this._indexCache satisfies SessionStoreRetentionHost['_indexCache']);
    void (this.catalogClient satisfies SessionStoreRetentionHost['catalogClient']);
    void (this.secretScrubber satisfies SessionStoreRetentionHost['secretScrubber']);
    void (this.clearLoadCache satisfies SessionStoreRetentionHost['clearLoadCache']);
    void (this.sessionPath satisfies SessionStoreRetentionHost['sessionPath']);
    void (this.dir satisfies SessionStoreRetentionHost['dir']);
    void (this.events satisfies SessionStoreRetentionHost['events']);
    void (this.readSummaryManifest satisfies SessionStoreRetentionHost['readSummaryManifest']);
    void (this.summaryFor satisfies SessionStoreRetentionHost['summaryFor']);
    void (this.appendToIndexStrict satisfies SessionStoreRetentionHost['appendToIndexStrict']);
    void (this.isSessionInUse satisfies SessionStoreRetentionHost['isSessionInUse']);
    void (this.maintenanceHolderId satisfies SessionStoreRetentionHost['maintenanceHolderId']);
    void (this.compactIndex satisfies SessionStoreRetentionHost['compactIndex']);
    void (this.ensureShardDir satisfies SessionStoreRetentionHost['ensureShardDir']);
    void (this.storagePolicy satisfies SessionStoreRetentionHost['storagePolicy']);
    void (this.archiveIdleInFlight satisfies SessionStoreRetentionHost['archiveIdleInFlight']);
    void (this.archiveIdle satisfies SessionStoreRetentionHost['archiveIdle']);
    return this as unknown as SessionStoreRetentionHost;
  }

  private sessionStoreIndexHost(): SessionStoreIndexHost {
    // Check the complete helper contract while preserving the owner's identity and receivers.
    void ({
      dir: this.dir,
      indexFile: this.indexFile,
      invalidateShardManifestBySessionId: this.invalidateShardManifestBySessionId,
      _indexCache: this._indexCache,
      indexAppendCount: this.indexAppendCount,
      compactIndexInner: this.compactIndexInner,
      catalogClient: this.catalogClient,
      appendToIndex: this.appendToIndex,
      _manualTombstones: this._manualTombstones,
      _indexDeletedIds: this._indexDeletedIds,
      compactIndex: this.compactIndex,
      events: this.events,
      readIndex: this.readIndex,
      _indexFileDeletedIds: this._indexFileDeletedIds,
      collectSessionIds: this.collectSessionIds,
      summaryFor: this.summaryFor,
    } satisfies SessionStoreIndexHost);
    return this as unknown as SessionStoreIndexHost;
  }
}

function stripSessionTranscriptQuery(query: string): string {
  const lower = query.toLowerCase();
  if (lower.endsWith('.jsonl.gz')) return query.slice(0, -'.jsonl.gz'.length);
  if (lower.endsWith('.jsonl')) return query.slice(0, -'.jsonl'.length);
  return query;
}

function isMissingSessionError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Session not found:');
}
