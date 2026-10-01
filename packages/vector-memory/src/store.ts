/**
 * VectorMemoryStore — SQLite-backed storage for vector entries.
 *
 * Each `remember` embeds the text via the configured provider and persists
 * both the entry and its vector in a single transaction. `search` embeds
 * the query and ranks entries by cosine similarity in pure JS (O(n·d)),
 * matching the existing `packages/tools/src/codebase-index/vector-search.ts`
 * pattern. The store is deliberately separate from SAGE's SQLite database
 * so the two stores cannot contend on the same file lock.
 *
 * Persistence layers:
 *  - SQLite WAL — handles intra-process concurrency, crash recovery.
 *  - `withFileLock` (core/utils) — wraps mutating ops so two processes
 *    pointing at the same `.db` cannot interleave a read-modify-write.
 *  - Provider-level `embedding_cache` table — same text never re-runs the
 *    ONNX forward pass; keyed by (content_hash, provider_id, dimensions)
 *    so a model swap invalidates only the old provider rows.
 *  - UNIQUE index on `(entries.content_hash, entries.scope)` — defense-in-depth
 *    against races that bypass the per-scope idempotency check.
 */
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { withFileLock } from '@wrongstack/core/utils';
import { loadRuntimeDatabaseSync } from '@wrongstack/persistence';
import { cosineSimilarity, HashingEmbeddingProvider } from '@wrongstack/sage';
import { VectorMemoryError, VectorMemoryProviderUnavailableError } from './errors.js';

import {
  decodeVector,
  encodeVector,
  initVectorSchema,
  lookupEmbeddingCache,
  sageKeyedContentHash,
  upsertEmbeddingCache,
  VECTOR_DIMENSIONS_KEY,
  VECTOR_PROVIDER_KEY,
} from './schema.js';
import type {
  SageSyncReport,
  VectorEntry,
  VectorEntryInput,
  VectorEntryWithVector,
  VectorKind,
  VectorMemoryStoreOptions,
  VectorScope,
  VectorSearchHit,
  VectorSearchOptions,
  VectorStoreStats,
} from './types.js';

/** Default `search` result cap, per the tool schema and the public docs. */
const DEFAULT_SEARCH_LIMIT = 10;

/** Clamp a caller-supplied `limit` to a usable positive integer. */
function normalizeLimit(
  limit: number | undefined,
  defaultLimit: number = DEFAULT_SEARCH_LIMIT,
): number {
  if (limit === undefined || !Number.isFinite(limit)) return defaultLimit;
  const floored = Math.floor(limit);
  return floored < 1 ? defaultLimit : floored;
}

/**
 * Rank order for search results: score DESC, then entry id ASC. Cosine
 * scores tie whenever two entries embed identically (duplicate texts
 * across scopes, or a provider collapse), and without the tiebreak the
 * emitted order is SQLite scan order — not a contract. The id tiebreak
 * makes ranking a deterministic total order, which is what makes a
 * `(score, id)` cursor stable across pages.
 */
function ranksBefore(a: { id: string; score: number }, b: { id: string; score: number }): boolean {
  return a.score > b.score || (a.score === b.score && a.id < b.id);
}

/**
 * Validate a caller-supplied search cursor. Malformed cursors throw
 * `VectorMemoryError` instead of being ignored — a silently-dropped
 * cursor makes a paging caller believe it reached the end of the corpus.
 */
function normalizeSearchCursor(cursor: unknown): {
  score: number;
  id: string;
} {
  const candidate = cursor as { score?: unknown; id?: unknown } | null;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    typeof candidate.score !== 'number' ||
    !Number.isFinite(candidate.score) ||
    candidate.score < 0 ||
    candidate.score > 1 ||
    typeof candidate.id !== 'string' ||
    candidate.id.trim().length === 0
  ) {
    throw new VectorMemoryError(
      'Invalid search cursor: expected { score: number in [0, 1], id: non-empty string }.',
    );
  }
  return { score: candidate.score, id: candidate.id };
}

const DEFAULT_DIRECTORY = '.wrongstack/vector-memory';
const DEFAULT_FILENAME = 'vector-memory.db';
/** Default file-lock acquire timeout. 5s is enough for embedding + insert. */
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
/** Maximum entries to evict in a single LRU sweep. */
const CACHE_EVICT_BATCH = 256;
const VECTOR_SCOPES: ReadonlySet<string> = new Set(['project', 'user', 'session']);
const VECTOR_KINDS: ReadonlySet<string> = new Set(['note', 'fact', 'summary', 'snippet', 'link']);

function assertVectorScope(value: unknown, operation: string): asserts value is VectorScope {
  if (typeof value !== 'string' || !VECTOR_SCOPES.has(value)) {
    throw new VectorMemoryError(`${operation}: scope must be project, user, or session`);
  }
}

function assertVectorKind(value: unknown, operation: string): asserts value is VectorKind {
  if (typeof value !== 'string' || !VECTOR_KINDS.has(value)) {
    throw new VectorMemoryError(`${operation}: kind must be note, fact, summary, snippet, or link`);
  }
}

function cloneJsonMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  let serialized: string;
  try {
    serialized = JSON.stringify(metadata);
  } catch {
    throw new Error('VectorMemoryStore.remember: metadata must be JSON-serializable');
  }
  const cloned = JSON.parse(serialized) as Record<string, unknown>;
  if (!jsonValuesEqual(metadata, cloned)) {
    throw new Error('VectorMemoryStore.remember: metadata must contain lossless JSON values');
  }
  return cloned;
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left === 'number' && typeof right === 'number') return Object.is(left, right);
  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => index in left && jsonValuesEqual(value, right[index]))
    );
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(left);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const leftKeys = Object.keys(left as Record<string, unknown>);
  const rightRecord = right as Record<string, unknown>;
  return (
    leftKeys.length === Object.keys(rightRecord).length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(rightRecord, key) &&
        jsonValuesEqual((left as Record<string, unknown>)[key], rightRecord[key]),
    )
  );
}

export class VectorMemoryStore {
  private readonly db: DatabaseSync;
  private readonly dbPath: string;
  private readonly rootDir: string;
  private readonly provider;
  private closed = false;

  constructor(opts: VectorMemoryStoreOptions) {
    if (!opts.provider) throw new Error('VectorMemoryStore: provider is required');
    if (
      typeof opts.projectRoot !== 'string' ||
      opts.projectRoot.trim().length === 0 ||
      !path.isAbsolute(opts.projectRoot)
    ) {
      throw new Error('VectorMemoryStore: projectRoot must be a non-empty absolute path');
    }
    if (typeof opts.provider.embed !== 'function') {
      throw new Error('VectorMemoryStore: provider embed must be a function');
    }
    if (typeof opts.provider.id !== 'string' || opts.provider.id.trim().length === 0) {
      throw new Error('VectorMemoryStore: provider id must be a non-empty string');
    }
    if (!Number.isSafeInteger(opts.provider.dimensions) || opts.provider.dimensions < 1) {
      throw new Error('VectorMemoryStore: provider dimensions must be a positive safe integer');
    }
    this.provider = opts.provider;

    const dir = opts.directory === undefined ? DEFAULT_DIRECTORY : opts.directory;
    const filename = opts.filename === undefined ? DEFAULT_FILENAME : opts.filename;
    if (typeof dir !== 'string' || dir.trim().length === 0) {
      throw new Error('Vector memory directory must be a non-empty project-relative path.');
    }
    if (path.isAbsolute(dir)) {
      throw new Error('Vector memory directory must be project-relative.');
    }
    const rootDir = path.resolve(opts.projectRoot, dir);
    const rel = path.relative(path.resolve(opts.projectRoot), rootDir);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new Error('Vector memory directory must stay inside the project root.');
    }
    fs.mkdirSync(rootDir, { recursive: true });
    this.rootDir = rootDir;
    if (
      typeof filename !== 'string' ||
      filename.trim().length === 0 ||
      path.isAbsolute(filename) ||
      path.basename(filename) !== filename ||
      filename.includes('\0')
    ) {
      throw new Error(
        'Vector memory filename must be a non-empty file name without path segments.',
      );
    }
    this.dbPath = path.join(rootDir, filename);
    const dbRelative = path.relative(rootDir, this.dbPath);
    if (
      dbRelative === '..' ||
      dbRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(dbRelative)
    ) {
      throw new Error('Vector memory database must stay inside its data directory.');
    }
    const Database = loadRuntimeDatabaseSync();
    this.db = new Database(this.dbPath);
    initVectorSchema(this.db);
    this.recordActiveProvider();
  }

  /**
   * Absolute path of the store's data directory (the resolved
   * `opts.directory`, default `.wrongstack/vector-memory`). Hosts use this
   * to place sidecar state (e.g. the first-boot SAGE sync marker) next to
   * the db instead of re-deriving the path and drifting from it.
   */
  get directory(): string {
    return this.rootDir;
  }

  /**
   * Absolute path of the SQLite database file. Hosts use this to take a
   * file-level lock that covers all mutating operations (see
   * `withFileLock(this.dbPath + '.lock', …)`).
   */
  get databasePath(): string {
    return this.dbPath;
  }

  /** The lockfile path used to serialize mutating operations. */
  get lockPath(): string {
    return `${this.dbPath}.lock`;
  }

  get activeProviderId(): string {
    const row = this.db
      .prepare('SELECT value FROM schema_meta WHERE key = ?')
      .get(VECTOR_PROVIDER_KEY) as { value: string } | undefined;
    return row?.value ?? this.provider.id;
  }

  private recordActiveProvider(): void {
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO schema_meta (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(VECTOR_PROVIDER_KEY, this.provider.id);
      this.db
        .prepare(
          `INSERT INTO schema_meta (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(VECTOR_DIMENSIONS_KEY, String(this.provider.dimensions));
      this.db.exec('COMMIT');
    } catch (e) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // SQLite can end the transaction when a write or COMMIT fails.
        // Preserve the primary database error instead of masking it.
      }
      throw e;
    }
  }

  static contentHash(text: string): string {
    return createHash('sha256').update(text.normalize('NFKC').trim()).digest('hex');
  }

  /**
   * Look up a vector for `text` in the provider-level embedding cache.
   * Cache hit returns the cached vector (no ONNX pass). Miss returns
   * `undefined`.
   */
  private cachedVector(text: string, now: string): Float32Array | undefined {
    return lookupEmbeddingCache(
      this.db,
      VectorMemoryStore.contentHash(text),
      this.provider.id,
      this.provider.dimensions,
      now,
    );
  }

  /** Persist `vec` for `text` to the embedding cache. */
  private cacheVector(text: string, vec: Float32Array, now: string): void {
    upsertEmbeddingCache(this.db, {
      contentHash: VectorMemoryStore.contentHash(text),
      providerId: this.provider.id,
      dimensions: vec.length,
      vector: encodeVector(vec),
      text,
      now,
    });
  }

  /**
   * Embed `text`, hitting the provider-level cache first. Cache miss falls
   * through to the configured provider and writes the result back. Returns
   * `undefined` when the provider fails — the caller can persist the entry
   * without a vector (fail-open) — unless `strict`, which throws instead.
   */
  private async embedWithCache(text: string, strict = false): Promise<Float32Array | undefined> {
    const now = new Date().toISOString();
    let cached: Float32Array | undefined;
    try {
      cached = this.cachedVector(text, now);
    } catch {
      // A malformed advisory cache row is a miss; the provider call below
      // repairs it through the normal cache upsert.
    }
    if (cached && cached.length === this.provider.dimensions && cached.every(Number.isFinite)) {
      return cached;
    }
    try {
      const result = await this.provider.embed([text]);
      const vec = result[0];
      if (vec && vec.length !== this.provider.dimensions) {
        throw new Error(
          `Embedding provider "${this.provider.id}" returned ${vec.length} dimensions; expected ${this.provider.dimensions}.`,
        );
      }
      if (vec && !vec.every(Number.isFinite)) {
        throw new Error(`Embedding provider "${this.provider.id}" returned non-finite values.`);
      }
      if (vec) this.cacheVector(text, vec, now);
      return vec;
    } catch (err) {
      if (strict) {
        throw new VectorMemoryProviderUnavailableError(
          `Embedding provider "${this.provider.id}" failed: ${err instanceof Error ? err.message : String(err)}`,
          err,
        );
      }
      return undefined;
    }
  }

  /**
   * Look up an existing entry by `content_hash`, optionally within a scope.
   * Without a scope, retains the original first-match lookup behavior.
   */
  findByContentHash(contentHash: string, scope?: VectorScope): VectorEntryWithVector | undefined {
    this.assertOpen();
    if (typeof contentHash !== 'string' || !/^[a-f\d]{64}$/i.test(contentHash)) {
      throw new VectorMemoryError(
        'VectorMemoryStore.findByContentHash: contentHash must be a 64-character hex digest',
      );
    }
    if (scope !== undefined) assertVectorScope(scope, 'VectorMemoryStore.findByContentHash');
    const row = (
      scope === undefined
        ? this.db.prepare('SELECT * FROM entries WHERE content_hash = ? LIMIT 1').get(contentHash)
        : this.db
            .prepare('SELECT * FROM entries WHERE content_hash = ? AND scope = ? LIMIT 1')
            .get(contentHash, scope)
    ) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const vectorRow = this.db
      .prepare(
        `SELECT * FROM vectors WHERE entry_id = ?
          ORDER BY (provider_id = ?) DESC, created_at DESC LIMIT 1`,
      )
      .get(row.id as string, this.provider.id) as
      | { provider_id: string; dimensions: number; vector: Buffer | Uint8Array }
      | undefined;
    return this.rowToEntry(row, vectorRow);
  }

  /**
   * Look up the entry mirroring a given SAGE memory id (i.e. the entry
   * whose `metadata.sageId` equals `sageId`). Returns `undefined` when
   * no such entry exists. Used by the event-driven mirror to delete
   * vector entries on SAGE delete events (the emitter knows the SAGE
   * id, not the vector entry id).
   *
   * Index lookup is the `CASE WHEN json_valid(metadata) THEN
   * json_extract(metadata, '$.sageId') END` expression declared as an expression
   * index in `initVectorSchema` (schema.ts), so this avoids a full table scan.
   * The two spellings must stay byte-identical in structure: SQLite matches a
   * query against an expression index by comparing the expression trees, so
   * reverting either side to a bare `json_extract` silently drops the lookup
   * back to a whole-corpus walk — and `json_extract` alone also raises on a
   * corrupt `metadata` row instead of returning NULL.
   */
  findBySageId(sageId: string): VectorEntryWithVector | undefined {
    this.assertOpen();
    if (typeof sageId !== 'string' || sageId.trim().length === 0) {
      throw new VectorMemoryError('VectorMemoryStore.findBySageId: sageId must be non-empty');
    }
    const row = this.db
      .prepare(
        `SELECT * FROM entries
          WHERE CASE WHEN json_valid(metadata)
                     THEN json_extract(metadata, '$.sageId')
                END = ?
          ORDER BY updated_at DESC
          LIMIT 1`,
      )
      .get(sageId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const vectorRow = this.db
      .prepare(
        `SELECT * FROM vectors WHERE entry_id = ?
          ORDER BY (provider_id = ?) DESC, created_at DESC LIMIT 1`,
      )
      .get(row.id as string, this.provider.id) as
      | { provider_id: string; dimensions: number; vector: Buffer | Uint8Array }
      | undefined;
    return this.rowToEntry(row, vectorRow);
  }

  /**
   * Persist a new entry. Idempotent: if an entry with the same
   * `content_hash` already exists, that entry is returned unchanged
   * instead of inserting a duplicate. Mutating ops are wrapped in
   * `withFileLock` so two processes cannot race the dedup check.
   */
  async remember(input: VectorEntryInput): Promise<VectorEntryWithVector> {
    this.assertOpen();
    if (input.providerId !== undefined && input.providerId !== this.provider.id) {
      throw new VectorMemoryError(
        `Unsupported provider override "${input.providerId}"; active provider is "${this.provider.id}".`,
      );
    }
    if (typeof input.text !== 'string') {
      throw new Error('VectorMemoryStore.remember: text must be a string');
    }
    if (input.text.trim().length === 0) {
      throw new Error('VectorMemoryStore.remember: text must be non-empty');
    }
    if (input.summary !== undefined && typeof input.summary !== 'string') {
      throw new Error('VectorMemoryStore.remember: summary must be a string');
    }
    if (
      input.metadata !== undefined &&
      (typeof input.metadata !== 'object' ||
        input.metadata === null ||
        Array.isArray(input.metadata))
    ) {
      throw new Error('VectorMemoryStore.remember: metadata must be an object');
    }
    if (input.metadata !== undefined) {
      const prototype = Object.getPrototypeOf(input.metadata);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error('VectorMemoryStore.remember: metadata must be a plain object');
      }
    }
    if (
      input.tags !== undefined &&
      (!Array.isArray(input.tags) || !input.tags.every((tag) => typeof tag === 'string'))
    ) {
      throw new Error('VectorMemoryStore.remember: tags must be an array of strings');
    }
    if (input.scope !== undefined) assertVectorScope(input.scope, 'VectorMemoryStore.remember');
    if (input.kind !== undefined) assertVectorKind(input.kind, 'VectorMemoryStore.remember');
    const normalizedInput: VectorEntryInput = {
      ...input,
      ...(input.metadata !== undefined ? { metadata: cloneJsonMetadata(input.metadata) } : {}),
      ...(input.tags !== undefined ? { tags: [...input.tags] } : {}),
    };
    return withFileLock(this.lockPath, () => this.rememberUnlocked(normalizedInput), {
      timeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
    });
  }

  private async rememberUnlocked(input: VectorEntryInput): Promise<VectorEntryWithVector> {
    const now = new Date().toISOString();
    let contentHash = VectorMemoryStore.contentHash(input.text);
    const scope: VectorScope = input.scope ?? 'project';

    // Idempotent within each scope; the composite UNIQUE index is the
    // second line of defense across processes.
    let existing = this.findByContentHash(contentHash, scope);
    const sageId = input.metadata?.['sageId'];
    // Same text owned by ANOTHER SAGE memory (SAGE dedups per scope/audience) is not
    // this one's mirror: returning it left this memory row-less, so key its own row.
    if (existing && typeof sageId === 'string' && existing.metadata?.['sageId'] !== sageId) {
      contentHash = sageKeyedContentHash(input.text, sageId);
      existing = this.findByContentHash(contentHash, scope);
    }
    if (existing) {
      if (
        existing.providerId === this.provider.id &&
        existing.dimensions === this.provider.dimensions &&
        existing.vector
      ) {
        return existing;
      }
      const recoveredVector = await this.embedWithCache(input.text);
      if (!recoveredVector) return existing;
      const recoveredAt = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO vectors (entry_id, provider_id, dimensions, vector, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(entry_id, provider_id) DO UPDATE SET
             vector = excluded.vector,
             dimensions = excluded.dimensions,
             created_at = excluded.created_at`,
        )
        .run(
          existing.id,
          this.provider.id,
          recoveredVector.length,
          encodeVector(recoveredVector),
          recoveredAt,
        );
      return {
        ...existing,
        providerId: this.provider.id,
        dimensions: recoveredVector.length,
        vector: recoveredVector,
      };
    }

    const metadata = input.metadata ?? {};
    const tags = input.tags ?? [];
    const kind: VectorKind = input.kind ?? 'note';
    const id = randomUUID();

    const vector = await this.embedWithCache(input.text);
    const providerId = vector ? this.provider.id : undefined;

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO entries
            (id, text, summary, metadata, tags, scope, kind, content_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.text,
          input.summary ?? null,
          JSON.stringify(metadata),
          JSON.stringify(tags),
          scope,
          kind,
          contentHash,
          now,
          now,
        );
      if (vector && providerId) {
        this.db
          .prepare(
            `INSERT INTO vectors (entry_id, provider_id, dimensions, vector, created_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(entry_id, provider_id) DO UPDATE SET
               vector = excluded.vector,
               dimensions = excluded.dimensions,
               created_at = excluded.created_at`,
          )
          .run(id, providerId, vector.length, encodeVector(vector), now);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }

    const result: VectorEntryWithVector = {
      id,
      text: input.text,
      summary: input.summary ?? undefined,
      metadata,
      tags,
      scope,
      kind,
      contentHash,
      createdAt: now,
      updatedAt: now,
      providerId: providerId ?? '',
      dimensions: vector?.length ?? 0,
    };
    if (vector) result.vector = vector;
    return result;
  }

  get(id: string): VectorEntryWithVector | undefined {
    this.assertOpen();
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new VectorMemoryError('VectorMemoryStore.get: id must be a non-empty string');
    }
    const row = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    const vectorRow = this.db
      .prepare(
        `SELECT * FROM vectors WHERE entry_id = ?
          ORDER BY (provider_id = ?) DESC, created_at DESC LIMIT 1`,
      )
      .get(id, this.provider.id) as
      | { provider_id: string; dimensions: number; vector: Buffer | Uint8Array }
      | undefined;
    return this.rowToEntry(row, vectorRow);
  }

  /** Hard-delete an entry by id without acquiring the lock (caller must hold lock if needed). */
  private forgetUnlocked(id: string): boolean {
    this.db.exec('BEGIN');
    try {
      const info = this.db.prepare('DELETE FROM entries WHERE id = ?').run(id);
      this.db.exec('COMMIT');
      return info.changes > 0;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /** Hard-delete an entry by id. Wrapped in `withFileLock` for cross-process safety. */
  async forget(id: string): Promise<boolean> {
    this.assertOpen();
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new VectorMemoryError('VectorMemoryStore.forget: id must be a non-empty string');
    }
    return withFileLock(this.lockPath, async () => this.forgetUnlocked(id), {
      timeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
    });
  }

  async search(query: string, opts: VectorSearchOptions = {}): Promise<VectorSearchHit[]> {
    this.assertOpen();
    if (opts.providerId !== undefined && opts.providerId !== this.provider.id) {
      throw new VectorMemoryError(
        `Unsupported provider override "${opts.providerId}"; active provider is "${this.provider.id}".`,
      );
    }
    if (opts.scope !== undefined) assertVectorScope(opts.scope, 'VectorMemoryStore.search');
    if (opts.kind !== undefined) assertVectorKind(opts.kind, 'VectorMemoryStore.search');
    if (opts.threshold !== undefined && typeof opts.threshold !== 'number') {
      throw new VectorMemoryError('VectorMemoryStore.search: threshold must be a number');
    }
    if (opts.limit !== undefined && typeof opts.limit !== 'number') {
      throw new VectorMemoryError('VectorMemoryStore.search: limit must be a number');
    }
    // Normalize before use: the top-k loop below compares against `limit` and
    // assigns `top.length = limit`. A NaN defeats every comparison (n >= NaN
    // and n > NaN are both false), so neither the skip guard nor the
    // truncation fires and the whole corpus is returned; a negative value
    // makes that assignment throw RangeError. Both are reachable from the
    // model-facing `vector_memory_search` tool, whose schema advertises
    // `minimum: 1` but does not enforce it at runtime.
    const limit = normalizeLimit(opts.limit);
    const threshold = Number.isNaN(opts.threshold)
      ? 0
      : Math.max(0, Math.min(1, opts.threshold ?? 0));
    const includeVectors = opts.includeVectors === true;
    const cursor = opts.cursor === undefined ? undefined : normalizeSearchCursor(opts.cursor);
    if (typeof query !== 'string' || query.trim().length === 0) return [];

    // Embed the query through the same provider-level cache as writes —
    // repeated identical queries skip the ONNX pass entirely.
    const strict = opts.failOnEmbeddingError === true;
    const queryVec = await this.embedWithCache(query, strict);
    if (!queryVec || queryVec.length === 0) {
      if (strict) {
        throw new VectorMemoryProviderUnavailableError(
          `Embedding provider "${this.provider.id}" returned no vector for the query.`,
        );
      }
      return [];
    }

    const providerId = this.provider.id;
    const dimensions = this.provider.dimensions;

    const filters: string[] = ['v.provider_id = ?', 'v.dimensions = ?'];
    const params: Array<string | number> = [providerId, dimensions];
    if (opts.scope !== undefined) {
      filters.push('e.scope = ?');
      params.push(opts.scope);
    }
    if (opts.kind !== undefined) {
      filters.push('e.kind = ?');
      params.push(opts.kind);
    }

    // Two-phase scan. Cosine ranking is exhaustive by construction (there is
    // no ANN index), but only the top `limit` rows are ever returned — so
    // phase 1 reads the *narrowest* row shape that can produce a score
    // (id + vector blob) and phase 2 hydrates only the survivors.
    //
    // The single-phase version selected `e.text`, `e.summary`, `e.metadata`
    // and `e.tags` for every row in the store and ran `rowToEntry` (a
    // two-`JSON.parse` decode) on everything above the threshold — which, at
    // the default `threshold: 0`, means every row. On a mirrored SAGE corpus
    // those columns are the entire memory text: the query allocated the whole
    // corpus as JS strings and parsed every metadata blob to return ten hits.
    const scanRows = this.db
      .prepare(
        `SELECT e.id AS id, v.vector AS vec_blob
           FROM entries e
           JOIN vectors v ON v.entry_id = e.id
          WHERE ${filters.join(' AND ')}`,
      )
      .all(...params) as Array<{ id: string; vec_blob: Buffer | Uint8Array }>;

    // Bounded top-k by insertion into a small array kept in rank order
    // (score DESC, id ASC — `ranksBefore`). Sorting the full candidate
    // list would be O(n log n) on a list that is discarded except for its
    // head; `limit` is single-digit in every caller.
    const top: Array<{ id: string; score: number; vector: Float32Array }> = [];
    for (const row of scanRows) {
      let vec: Float32Array;
      try {
        vec = decodeVector(row.vec_blob);
      } catch {
        continue;
      }
      if (vec.length !== dimensions || !vec.every(Number.isFinite)) continue;
      const raw = cosineSimilarity(queryVec, vec);
      const score = Math.max(0, Math.min(1, raw));
      if (!Number.isFinite(score) || score < threshold) continue;
      // Ranked-cursor resume: skip everything the previous page already
      // returned — strictly better score, or the same score with an id at
      // or before the cursor id (rank order is score DESC, id ASC).
      if (cursor) {
        if (score > cursor.score) continue;
        if (score === cursor.score && row.id <= cursor.id) continue;
      }
      const candidate = { id: row.id, score };
      const last = top.length > 0 ? top[top.length - 1] : undefined;
      if (top.length >= limit && last && !ranksBefore(candidate, last)) continue;
      let at = top.length;
      while (at > 0 && ranksBefore(candidate, top[at - 1]!)) at--;
      top.splice(at, 0, { id: row.id, score, vector: vec });
      if (top.length > limit) top.length = limit;
    }
    if (top.length === 0) return [];

    // Phase 2 — hydrate the survivors in one statement, then re-emit in the
    // score order established above (SQL `IN` does not preserve it).
    const placeholders = top.map(() => '?').join(',');
    const hydrated = this.db
      .prepare(
        `SELECT id, text, summary, metadata, tags, scope, kind,
                content_hash, created_at, updated_at
           FROM entries WHERE id IN (${placeholders})`,
      )
      .all(...top.map((t) => t.id)) as Array<Record<string, unknown>>;
    const entryById = new Map<string, VectorEntry>();
    for (const row of hydrated) {
      entryById.set(row.id as string, this.rowToEntry(row) as VectorEntry);
    }

    const scored: VectorSearchHit[] = [];
    for (const candidate of top) {
      const entry = entryById.get(candidate.id);
      // A row deleted between the two phases simply drops out; search is
      // advisory and must not fail on a concurrent forget().
      if (!entry) continue;
      const hit: VectorSearchHit = { entry, score: candidate.score, providerId };
      if (includeVectors) hit.vector = candidate.vector;
      scored.push(hit);
    }
    return scored;
  }

  /**
   * Page through entries, newest first.
   *
   * Ordering is `(updated_at, id)` DESC — `updated_at` alone is not unique, so
   * without the id tiebreak two entries written in the same millisecond can
   * swap places between calls and a paging caller silently skips one.
   *
   * Pagination is keyset (`after`), not offset, because the only caller that
   * pages is `forgetStaleSageMirrors`, which *deletes as it walks*. Under
   * `OFFSET` every deletion shifts the remaining rows left and the next page
   * skips exactly as many entries as were removed. Keyset is immune: it
   * resumes from a position, and the rows a deletion removes are ones the
   * sweep has already passed.
   */
  list(
    opts: {
      limit?: number;
      scope?: VectorScope;
      kind?: VectorKind;
      /** Resume after this entry — pass the last row of the previous page. */
      after?: { updatedAt: string; id: string } | undefined;
    } = {},
  ): VectorEntry[] {
    this.assertOpen();
    if (opts.scope !== undefined) assertVectorScope(opts.scope, 'VectorMemoryStore.list');
    if (opts.kind !== undefined) assertVectorKind(opts.kind, 'VectorMemoryStore.list');
    if (opts.limit !== undefined && typeof opts.limit !== 'number') {
      throw new VectorMemoryError('VectorMemoryStore.list: limit must be a number');
    }
    if (
      opts.after !== undefined &&
      (typeof opts.after !== 'object' ||
        opts.after === null ||
        typeof opts.after.updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(opts.after.updatedAt)) ||
        typeof opts.after.id !== 'string' ||
        opts.after.id.trim().length === 0)
    ) {
      throw new VectorMemoryError(
        'VectorMemoryStore.list: after must contain a valid updatedAt and non-empty id',
      );
    }
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (opts.scope !== undefined) {
      where.push('scope = ?');
      params.push(opts.scope);
    }
    if (opts.kind !== undefined) {
      where.push('kind = ?');
      params.push(opts.kind);
    }
    if (opts.after) {
      where.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
      params.push(opts.after.updatedAt, opts.after.updatedAt, opts.after.id);
    }
    const sql = `SELECT * FROM entries ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY updated_at DESC, id DESC LIMIT ?`;
    params.push(normalizeLimit(opts.limit, 100));
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToEntry(r) as VectorEntry);
  }

  async reindexAll(
    opts: { onlyMissing?: boolean } = {},
  ): Promise<{ processed: number; errors: number }> {
    this.assertOpen();
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
      throw new VectorMemoryError('VectorMemoryStore.reindexAll: options must be an object');
    }
    if (opts.onlyMissing !== undefined && typeof opts.onlyMissing !== 'boolean') {
      throw new VectorMemoryError('VectorMemoryStore.reindexAll: onlyMissing must be a boolean');
    }
    return withFileLock(
      this.lockPath,
      async () => {
        const rows = (
          opts.onlyMissing
            ? this.db
                .prepare(`SELECT e.id, e.text FROM entries e
              WHERE NOT EXISTS (SELECT 1 FROM vectors v WHERE v.entry_id = e.id
                AND v.provider_id = ? AND v.dimensions = ?)`)
                .all(this.provider.id, this.provider.dimensions)
            : this.db.prepare('SELECT id, text FROM entries').all()
        ) as Array<Record<string, unknown>>;
        let processed = 0;
        let errors = 0;
        for (const row of rows) {
          try {
            // Bypass the cache during reindex — the goal is to refresh
            // the per-entry vector, even if the cached text-vector is
            // already valid for the same content_hash.
            const result = await this.provider.embed([row.text as string]);
            const v = result[0];
            if (!v || v.length !== this.provider.dimensions || !v.every(Number.isFinite)) {
              errors++;
              continue;
            }
            const now = new Date().toISOString();
            this.db
              .prepare(
                `INSERT INTO vectors (entry_id, provider_id, dimensions, vector, created_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(entry_id, provider_id) DO UPDATE SET
                   vector = excluded.vector,
                   dimensions = excluded.dimensions,
                   created_at = excluded.created_at`,
              )
              .run(row.id as string, this.provider.id, v.length, encodeVector(v), now);
            // Also refresh the embedding cache so subsequent searches
            // for the same text skip the ONNX pass.
            this.cacheVector(row.text as string, v, now);
            processed++;
          } catch {
            errors++;
          }
        }
        return { processed, errors };
      },
      { timeoutMs: 60_000 },
    );
  }

  stats(): VectorStoreStats {
    this.assertOpen();
    const entryCount = (this.db.prepare('SELECT COUNT(*) AS n FROM entries').get() as { n: number })
      .n;
    const vectorCount = (
      this.db.prepare('SELECT COUNT(*) AS n FROM vectors').get() as { n: number }
    ).n;
    const providerRows = this.db
      .prepare('SELECT DISTINCT provider_id FROM vectors')
      .all() as Array<{ provider_id: string }>;
    return {
      entries: entryCount,
      vectors: vectorCount,
      providers: providerRows.map((r) => r.provider_id),
      modelAvailable: true,
      modelId: this.provider.id,
      dimensions: this.provider.dimensions,
    };
  }

  /** Coverage usable by this store's search, excluding old providers/dimensions. */
  embeddingCoverage(): { entries: number; covered: number; missing: number } {
    this.assertOpen();
    const row = this.db
      .prepare(`SELECT COUNT(*) AS entries,
      COALESCE(SUM(EXISTS(SELECT 1 FROM vectors v WHERE v.entry_id = e.id
        AND v.provider_id = ? AND v.dimensions = ?)), 0) AS covered
      FROM entries e`)
      .get(this.provider.id, this.provider.dimensions) as { entries: number; covered: number };
    return { ...row, missing: row.entries - row.covered };
  }

  /**
   * Embedding-cache diagnostics — entries, hit/miss counters, oldest entry.
   * Useful for the WebUI's vector-memory panel and for diagnosing the
   * "why is search slow?" question.
   */
  cacheStats(): {
    entries: number;
    providers: number;
    totalUseCount: number;
    oldestLastUsedAt: string | null;
  } {
    this.assertOpen();
    const entries = (
      this.db.prepare('SELECT COUNT(*) AS n FROM embedding_cache').get() as {
        n: number;
      }
    ).n;
    const providers = (
      this.db.prepare('SELECT COUNT(DISTINCT provider_id) AS n FROM embedding_cache').get() as {
        n: number;
      }
    ).n;
    const totalUseCount = (
      this.db.prepare('SELECT COALESCE(SUM(use_count), 0) AS n FROM embedding_cache').get() as {
        n: number;
      }
    ).n;
    const oldest = this.db.prepare('SELECT MIN(last_used_at) AS t FROM embedding_cache').get() as
      | { t: string | null }
      | undefined;
    return {
      entries,
      providers,
      totalUseCount,
      oldestLastUsedAt: oldest?.t ?? null,
    };
  }

  /**
   * LRU-evict the embedding cache down to `keepMostRecent` rows. The
   * `embedding_cache` table is independent of `entries`, so a sweep here
   * only removes cached vectors — never stored entries. Called by hosts
   * that want to bound cache growth on long-lived processes.
   */
  async evictCache(keepMostRecent: number): Promise<{ removed: number }> {
    this.assertOpen();
    if (!Number.isSafeInteger(keepMostRecent) || keepMostRecent < 0) {
      throw new Error('evictCache: keepMostRecent must be >= 0 and a safe integer');
    }
    return withFileLock(
      this.lockPath,
      async () => {
        const total = (
          this.db.prepare('SELECT COUNT(*) AS n FROM embedding_cache').get() as { n: number }
        ).n;
        if (total <= keepMostRecent) return { removed: 0 };
        const toRemove = total - keepMostRecent;
        const stmt = this.db.prepare(
          `DELETE FROM embedding_cache
            WHERE rowid IN (
              SELECT rowid FROM embedding_cache
               ORDER BY last_used_at ASC
               LIMIT ?
            )`,
        );
        let removed = 0;
        while (removed < toRemove) {
          const info = stmt.run(Math.min(toRemove - removed, CACHE_EVICT_BATCH));
          const changed = Number(info.changes);
          removed += changed;
          if (changed === 0) break;
        }
        return { removed };
      },
      { timeoutMs: DEFAULT_LOCK_TIMEOUT_MS },
    );
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('VectorMemoryStore is closed');
  }

  private rowToEntry(
    row: Record<string, unknown>,
    vectorRow?: { provider_id: string; dimensions: number; vector: Buffer | Uint8Array },
  ): VectorEntryWithVector {
    const summaryValue = row.summary as string | null;
    const entry: VectorEntryWithVector = {
      id: row.id as string,
      text: row.text as string,
      summary: summaryValue ?? (undefined as string | undefined),
      metadata: safeParseMetadata(row.metadata),
      tags: safeParseTags(row.tags),
      scope:
        typeof row.scope === 'string' && VECTOR_SCOPES.has(row.scope)
          ? (row.scope as VectorEntry['scope'])
          : 'session',
      kind:
        typeof row.kind === 'string' && VECTOR_KINDS.has(row.kind)
          ? (row.kind as VectorEntry['kind'])
          : 'note',
      contentHash: row.content_hash as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      providerId: '',
      dimensions: 0,
    };
    if (vectorRow?.vector) {
      try {
        const vector = decodeVector(vectorRow.vector);
        if (vector.length === vectorRow.dimensions && vector.every(Number.isFinite)) {
          entry.providerId = vectorRow.provider_id;
          entry.dimensions = vectorRow.dimensions;
          entry.vector = vector;
        }
      } catch {
        // Corrupt advisory vectors are omitted; the entry itself remains readable.
      }
    }
    return entry;
  }

  async syncFromSage(sage: SageSyncSource): Promise<SageSyncReport> {
    this.assertOpen();
    // No upper bound: the cursor-walking `SageSyncSource` terminates on
    // `nextCursor: null` (and has its own defensive progress guard). The
    // historical `limit: 5000` silently truncated large projects; the
    // caller's source is now authoritative.
    const memories = await sage.listActiveMemories({ limit: Number.POSITIVE_INFINITY });
    let indexed = 0;
    let skipped = 0;
    let failed = 0;
    const errors: SageSyncReport['errors'] = [];

    for (const memory of memories) {
      try {
        if (typeof memory.id !== 'string' || memory.id.trim().length === 0) {
          throw new Error('SAGE memory id must be a non-empty string');
        }
        const hash = VectorMemoryStore.contentHash(memory.text);
        const expectedMetadata = {
          ...(memory.metadata ?? {}),
          source: 'sage',
          sageId: memory.id,
        };
        const expectedTags = memory.tags ?? [];
        const expectedSummary = memory.summary ?? undefined;
        // By SAGE id: a text match owned by another memory is not this mirror.
        const existing = this.findBySageId(memory.id);
        const sameState =
          existing !== undefined &&
          VectorMemoryStore.contentHash(existing.text) === hash &&
          existing.summary === expectedSummary &&
          jsonValuesEqual(existing.tags, expectedTags) &&
          jsonValuesEqual(existing.metadata, expectedMetadata);
        if (sameState) {
          skipped++;
          continue;
        }
        // The dedup-check → INSERT pair is a read-modify-write, so it runs
        // under the same host-OS file lock as `remember()` (see the class
        // header). Unlocked, two concurrent syncs (e.g. two surfaces
        // force-syncing) both pass the pre-check across the `await embed()`
        // gap and the loser dies on the UNIQUE (content_hash, scope) index — a
        // spurious partial-failure that keeps the first-boot sync marker
        // from ever completing. Per-entry (not whole-walk) locking keeps
        // live mirror writes responsive during a long corpus walk.
        //
        // If an entry for this sageId already existed with different text,
        // delete the stale entry before inserting to prevent leaking orphaned
        // ghosts (matching sage-event-mirror's update path).
        await withFileLock(
          this.lockPath,
          () => {
            if (existing && !sameState) {
              this.forgetUnlocked(existing.id);
            }
            return this.rememberUnlocked({
              text: memory.text,
              summary: expectedSummary,
              metadata: expectedMetadata,
              tags: expectedTags,
              scope: 'project',
              kind: 'note',
            });
          },
          { timeoutMs: DEFAULT_LOCK_TIMEOUT_MS },
        );
        indexed++;
      } catch (err) {
        failed++;
        errors.push({ memoryId: memory.id, message: errMsg(err) });
      }
    }
    return { scanned: memories.length, indexed, skipped, failed, errors };
  }
}

export interface SageSyncSource {
  listActiveMemories(opts: { limit: number }): Promise<
    Array<{
      id: string;
      text: string;
      summary?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }>
  >;
}

export function fallbackHashingProvider(dimensions: number): HashingEmbeddingProvider {
  return new HashingEmbeddingProvider({ dimensions });
}

function safeParseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function safeParseMetadata(value: unknown): Record<string, unknown> {
  const parsed = safeParseJson<unknown>(value, undefined);
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function safeParseTags(value: unknown): string[] {
  const parsed = safeParseJson<unknown>(value, undefined);
  return Array.isArray(parsed) && parsed.every((tag) => typeof tag === 'string') ? parsed : [];
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
