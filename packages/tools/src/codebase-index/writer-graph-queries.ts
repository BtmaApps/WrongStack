import type { DatabaseSync } from 'node:sqlite';
import type { WriterSymbolGraphRow } from './writer-graph-helpers.js';
import {
  indexedFileMatchArgs,
  indexedFileMatchSql,
  inListChunks,
  padToInBucket,
  placeholders,
} from './writer-helpers.js';

type Statement = ReturnType<DatabaseSync['prepare']>;
export type PrepareStatement = (sql: string) => Statement;

/** Stay under typical SQLite SQLITE_MAX_VARIABLE_NUMBER (often 999). */
export const MAX_SQL_VARS = 900;

/**
 * Run a query that takes a list of IDs, chunking the IDs so the total
 * placeholder count never exceeds SQLite's variable limit.
 *
 * IMPORTANT: the SQL built by `buildSql` MUST NOT include a `LIMIT` clause.
 * Applying LIMIT per-chunk would silently cap results at the chunk boundary
 * rather than the caller's ceiling. Callers must slice the returned array
 * to enforce their own limit after merge.
 *
 * P4.12: chunk sizes and each chunk's placeholder count come from a
 * powers-of-two ladder + padToInBucket, so `buildSql` resolves to a small
 * fixed set of SQL strings instead of one per distinct id count.
 */
export function chunkedIdQuery(
  stmt: PrepareStatement,
  ids: readonly number[],
  buildSql: (placeholders: string) => string,
  extraArgs: readonly (string | number)[] = [],
): unknown[] {
  const results: unknown[] = [];
  let cursor = 0;
  for (const take of inListChunks(ids.length, MAX_SQL_VARS)) {
    const chunk = padToInBucket(ids.slice(cursor, cursor + take));
    cursor += take;
    const sql = buildSql(placeholders(chunk.length));
    results.push(...(stmt(sql).all(...chunk, ...extraArgs) as unknown[]));
  }
  return results;
}

/** {@link chunkedIdQuery} for a list of string keys (file paths). Same no-LIMIT contract. */
export function chunkedValueQuery(
  stmt: PrepareStatement,
  values: readonly string[],
  buildSql: (placeholders: string) => string,
): unknown[] {
  const results: unknown[] = [];
  let cursor = 0;
  for (const take of inListChunks(values.length, MAX_SQL_VARS)) {
    const chunk = padToInBucket(values.slice(cursor, cursor + take));
    cursor += take;
    results.push(...(stmt(buildSql(placeholders(chunk.length))).all(...chunk) as unknown[]));
  }
  return results;
}

type RefCountRow = { from_id: number; to_id: number; call_type: string; n: number };

/**
 * Resolved ref counts touching `localIds` (as source OR target), grouped by
 * `(from_id, to_id, call_type)`.
 *
 * The graph readers used to bind every scoped file path — twice — in a single
 * `file IN (…)` statement, which overflowed SQLite's bound-variable limit on a
 * broad package filter in a large repository. Two id-partitioned passes stay
 * under it: every group whose source is local lands in exactly one chunk of
 * the first pass, and the second pass keeps only groups whose source is NOT
 * local, so no group is counted twice. (The symbol graph's former
 * `UNION ALL` counted every file-internal ref twice, doubling its weight.)
 */
export function refCountsTouching(
  stmt: PrepareStatement,
  localIds: readonly number[],
): RefCountRow[] {
  const local = new Set(localIds);
  const outgoing = chunkedIdQuery(
    stmt,
    localIds,
    (ph) =>
      `SELECT from_id, to_id, call_type, COUNT(*) AS n FROM refs
        WHERE from_id IN (${ph}) AND to_id IS NOT NULL
        GROUP BY from_id, to_id, call_type`,
  ) as RefCountRow[];
  const incoming = (
    chunkedIdQuery(
      stmt,
      localIds,
      (ph) =>
        `SELECT from_id, to_id, call_type, COUNT(*) AS n FROM refs
          WHERE to_id IN (${ph})
          GROUP BY from_id, to_id, call_type`,
    ) as RefCountRow[]
  ).filter((row) => !local.has(row.from_id));
  return [...outgoing, ...incoming];
}

/**
 * Hydrate symbol rows for an arbitrary id list.
 *
 * The personalised retrieval walk scores dense graph indices and then needs
 * the declarations behind the winners; this is that lookup. Chunked because
 * the id list is unbounded — the caller decides how many nodes to hydrate.
 */
export function getSymbolsByIdsWithStatement(
  stmt: PrepareStatement,
  ids: readonly number[],
): WriterSymbolGraphRow[] {
  if (ids.length === 0) return [];
  return chunkedIdQuery(
    stmt,
    ids,
    (ph) =>
      `SELECT id, name, kind, lang, file, line, signature, scope FROM symbols WHERE id IN (${ph})`,
  ) as WriterSymbolGraphRow[];
}

export function resolveIndexedFiles(stmt: PrepareStatement, file: string): string[] {
  const rows = stmt(
    `SELECT DISTINCT file FROM symbols WHERE ${indexedFileMatchSql('file')} ORDER BY length(file), file`,
  ).all(...indexedFileMatchArgs(file)) as Array<{ file: string }>;
  return rows.map((row) => row.file);
}
