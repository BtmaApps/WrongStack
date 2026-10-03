import type { DatabaseSync } from 'node:sqlite';
import { cosineSimilarity } from '@wrongstack/sage';
import { VectorMemoryError, VectorMemoryProviderUnavailableError } from './errors.js';
import { decodeVector } from './schema.js';
import {
  assertVectorKind,
  assertVectorScope,
  safeParseMetadata,
  safeParseTags,
  VECTOR_KINDS,
  VECTOR_SCOPES,
} from './store-values.js';
import type {
  VectorEntry,
  VectorEntryWithVector,
  VectorKind,
  VectorMemoryStoreOptions,
  VectorScope,
  VectorSearchHit,
  VectorSearchOptions,
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

export interface VectorQueryHost {
  assertOpen(): void;
  readonly provider: VectorMemoryStoreOptions['provider'];
  embedWithCache(text: string, strict?: boolean): Promise<Float32Array | undefined>;
  readonly db: DatabaseSync;
  rowToEntry(
    row: Record<string, unknown>,
    vectorRow?: { provider_id: string; dimensions: number; vector: Buffer | Uint8Array },
  ): VectorEntryWithVector;
}

export async function searchVectorEntries(
  host: VectorQueryHost,
  query: string,
  opts: VectorSearchOptions = {},
): Promise<VectorSearchHit[]> {
  host.assertOpen();
  if (opts.providerId !== undefined && opts.providerId !== host.provider.id) {
    throw new VectorMemoryError(
      `Unsupported provider override "${opts.providerId}"; active provider is "${host.provider.id}".`,
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
  const queryVec = await host.embedWithCache(query, strict);
  if (!queryVec || queryVec.length === 0) {
    if (strict) {
      throw new VectorMemoryProviderUnavailableError(
        `Embedding provider "${host.provider.id}" returned no vector for the query.`,
      );
    }
    return [];
  }

  const providerId = host.provider.id;
  const dimensions = host.provider.dimensions;

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
  const scanRows = host.db
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
  const hydrated = host.db
    .prepare(
      `SELECT id, text, summary, metadata, tags, scope, kind,
                content_hash, created_at, updated_at
           FROM entries WHERE id IN (${placeholders})`,
    )
    .all(...top.map((t) => t.id)) as Array<Record<string, unknown>>;
  const entryById = new Map<string, VectorEntry>();
  for (const row of hydrated) {
    entryById.set(row.id as string, host.rowToEntry(row) as VectorEntry);
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

export function listVectorEntries(
  host: VectorQueryHost,
  opts: {
    limit?: number;
    scope?: VectorScope;
    kind?: VectorKind;
    /** Resume after this entry — pass the last row of the previous page. */
    after?: { updatedAt: string; id: string } | undefined;
  } = {},
): VectorEntry[] {
  host.assertOpen();
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
  const rows = host.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => host.rowToEntry(r) as VectorEntry);
}

export function decodeVectorEntry(
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
