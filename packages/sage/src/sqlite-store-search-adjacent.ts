import type { SQLInputValue } from 'node:sqlite';
import type { SearchHit, SearchQuery, SearchRanking } from './service-contract.js';
import { buildOrderBy } from './sqlite-search-cursor.js';
import type { SqliteAdminHost } from './sqlite-store-admin.js';
import { buildRetrievePathTargets } from './sqlite-store-retrieve-helpers.js';
import { ftsPrefixTerms, sqliteRowsToMemories } from './sqlite-store-search-helpers.js';
import type { Sage, SageStatus } from './types.js';

export const MAX_LIMIT = 200;

/**
 * Over-fetch factor for JS-side filters (audience/anchor) that cannot be
 * expressed against the JSON payload in SQL. The pre-filter LIMIT is scaled
 * by this factor and the filtered result is sliced back to the caller's
 * limit, so a narrow filter does not silently starve the result set.
 */
export const JS_FILTER_OVERFETCH = 5;

/**
 * Recency window for the non-FTS relevance component: a memory whose
 * `updatedAt` is inside the window scores `1 - age/window`; older memories
 * floor at 0. Fixed window keeps the score absolute (comparable across
 * result sets) rather than rank-relative.
 */
const RECENCY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Absolute quality score in [0, 1], comparable across result sets (design
 * doc search-and-suggest.md §6: the same formula runs for every query, so a
 * ≥0.5 threshold means the same thing everywhere).
 *
 * FTS hits: relevance = sigmoid(bm25) — SQLite's bm25 is ≤ 0, so a strong
 * match approaches 1 and a weak one approaches 0.5, independent of the
 * result-set size; the metadata factor (importance/confidence/freshness)
 * scales relevance within [0.75, 1.0].
 *
 * Non-FTS hits (no text query): an ADDITIVE blend, 0.6·recency + 0.4·metadata,
 * where recency = 1 - age/`RECENCY_WINDOW_MS` floored at 0. The additive
 * blend keeps an old-but-high-quality memory from scoring exactly 0 in every
 * ranking mode (a pure recency × metadata product did).
 *
 * Scores are NOT guaranteed to track the ORDER BY ranking: e.g. the
 * 'importance' ranking orders by importance while the score blends bm25 and
 * metadata, so an adjacent hit with far stronger metadata can edge out an
 * earlier one.
 */
export function computeAbsoluteScores(
  memories: Sage[],
  bm25Ranks: ReadonlyArray<number | undefined>,
  nowMs: number,
): number[] {
  return memories.map((memory, index) => {
    const rank = bm25Ranks[index];
    const metadata =
      (memory.importance ?? 0.5) * 0.5 +
      (memory.confidence ?? 0.5) * 0.3 +
      (memory.freshness ?? 0.5) * 0.2;
    if (rank !== undefined) {
      return (1 / (1 + Math.exp(rank))) * (0.75 + 0.25 * metadata);
    }
    const age = nowMs - Date.parse(memory.updatedAt);
    const recency = Number.isFinite(age) ? clamp01(1 - age / RECENCY_WINDOW_MS) : 0;
    return 0.6 * recency + 0.4 * metadata;
  });
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Append SQL-side freshness filters (createdAfter/verifiedAfter) to a clause
 * list, keeping params in lock-step. `prefix` is the memories-table alias
 * ('' for unaliased, 'm.' for FTS joins).
 */
export function appendFreshnessClauses(
  query: SearchQuery,
  clauses: string[],
  params: SQLInputValue[],
  prefix: string,
): void {
  if (query.freshness?.createdAfter !== undefined) {
    clauses.push(`${prefix}created_at >= ?`);
    params.push(query.freshness.createdAfter);
  }
  if (query.freshness?.verifiedAfter !== undefined) {
    clauses.push(`json_extract(${prefix}data, '$.lastVerifiedAt') >= ?`);
    params.push(query.freshness.verifiedAfter);
  }
}

/**
 * Build an EXISTS subquery restricting the search to memories whose anchor
 * graph points at one of `query.paths` (file/dir nodes plus symbol globs),
 * reusing the same target normalization as `retrieveForPath` so path
 * matching is consistent across surfaces.
 */
export function buildPathExistsClause(
  projectRoot: string,
  query: SearchQuery,
  prefix: string,
): { clause: string; params: string[] } | undefined {
  if (!query.paths || query.paths.length === 0) return undefined;
  const { targetList, symbolGlobs } = buildRetrievePathTargets(projectRoot, query.paths, true);
  const conditions: string[] = [];
  if (targetList.length > 0) {
    const targetPlaceholders = targetList.map(() => '?').join(',');
    conditions.push(`e.to_node IN (${targetPlaceholders})`);
  }
  if (symbolGlobs.length > 0) {
    conditions.push(symbolGlobs.map(() => 'e.to_node GLOB ?').join(' OR '));
  }
  if (conditions.length === 0) {
    // `query.paths` was provided, but every entry resolved OUTSIDE the project
    // root: `buildRetrievePathTargets` drops such paths ("no stored anchor can
    // match it") and `normalizeAnchors` refuses to store an anchor that
    // escapes the root, so nothing can ever satisfy this filter. Returning
    // `undefined` here meant "no path filter requested", which silently
    // dropped the caller's restriction and returned the UNFILTERED corpus —
    // the opposite of the request. Match nothing instead, matching the sibling
    // `retrieveSqliteSageForPath` (`if (relPaths.length === 0) return [];`).
    conditions.push('0');
  }
  return {
    clause: `EXISTS (SELECT 1 FROM edges e WHERE e.from_node = 'mem:' || ${prefix}id AND (${conditions.join(' OR ')}))`,
    params: [...targetList, ...symbolGlobs],
  };
}

interface SuggestLexicalAdjacentInput {
  host: SqliteAdminHost;
  query: SearchQuery;
  matchExpr: string | undefined;
  limit: number;
  hits: SearchHit[];
  statuses: SageStatus[];
  ranking: SearchRanking;
  ftsSession: { clause: string; params: string[] };
  /** Same audience/anchor filters as the primary query — suggestions must honor them too. */
  jsFilters: Array<(memory: Sage) => boolean>;
}

/**
 * Design-doc v1 suggestions: lexical adjacency. When the primary query found
 * nothing (or 'always' is requested), re-run the same filters (kinds, scopes,
 * importance, freshness, paths, session, audience/anchor) with an OR-expanded
 * FTS expression so memories sharing any query term surface as neighbors.
 * Graph-adjacency BFS is the documented v2 method (deferred). Sorted by the
 * same ranking policy as `hits` and scored with the same absolute formula.
 */
export function suggestLexicalAdjacent(input: SuggestLexicalAdjacentInput): SearchHit[] {
  const { host, query, matchExpr, limit, hits, statuses, ranking, ftsSession, jsFilters } = input;
  if (!matchExpr) return []; // filters-only query: no lexical neighborhood
  const terms = ftsPrefixTerms(query.text ?? '');
  if (terms.length < 2) return []; // a single term has no meaningful OR expansion
  const excluded = new Set(hits.map((hit) => hit.id));
  const orExpr = terms.join(' OR ');
  const statusPlaceholders = statuses.map(() => '?').join(',');

  const clauses: string[] = ['m.status IN (' + statusPlaceholders + ')', 'memories_fts MATCH ?'];
  const params: SQLInputValue[] = [...statuses, orExpr];
  if (query.kinds && query.kinds.length > 0) {
    clauses.push(`m.kind IN (${query.kinds.map(() => '?').join(',')})`);
    params.push(...query.kinds);
  }
  if (query.scopes && query.scopes.length > 0) {
    clauses.push(`m.scope IN (${query.scopes.map(() => '?').join(',')})`);
    params.push(...query.scopes);
  }
  if (query.importanceAtLeast !== undefined) {
    clauses.push('m.importance >= ?');
    params.push(query.importanceAtLeast);
  }
  appendFreshnessClauses(query, clauses, params, 'm.');
  const pathClause = buildPathExistsClause(host.projectRoot, query, 'm.');
  if (pathClause) {
    clauses.push(pathClause.clause);
    params.push(...pathClause.params);
  }
  if (ftsSession.clause) {
    clauses.push(ftsSession.clause.replace(/^\s*AND\s+/i, ''));
    params.push(...ftsSession.params);
  }

  const whereSql = ' WHERE ' + clauses.join(' AND ');
  // Scale the fetch window when JS-side filters are active so the filtered
  // suggestion set can still reach the caller's limit (mirrors the primary
  // path's JS_FILTER_OVERFETCH).
  const suggestionSqlLimit =
    jsFilters.length > 0
      ? Math.min(limit * JS_FILTER_OVERFETCH, MAX_LIMIT * 5)
      : Math.min(Math.max(limit * 2, 10), MAX_LIMIT);
  const rows = host
    .stmt(
      // `m.id` rides along with `m.data` purely so the bm25-by-id map below can
      // be built without a second JSON.parse of every returned row.
      `SELECT m.id AS id, m.data, bm25(memories_fts) AS bm25 FROM memories_fts f CROSS JOIN memories m ON m.rowid = f.rowid` +
        whereSql +
        ` ORDER BY ${buildOrderBy(ranking).fts}` +
        ` LIMIT ${suggestionSqlLimit}`,
    )
    .all(...params) as Array<{ id?: string; data: string; bm25?: number }>;

  // Keyed off the SQL-projected `id` column — see the primary search path for
  // why this is not a re-parse of `row.data`.
  const bm25ById = new Map<string, number | undefined>();
  for (const row of rows) {
    if (row.id !== undefined) bm25ById.set(row.id, row.bm25);
  }
  const kept = sqliteRowsToMemories(rows).filter(
    (memory) =>
      !excluded.has(memory.id) &&
      (jsFilters.length === 0 || jsFilters.every((filter) => filter(memory))),
  );
  const chosen = kept.slice(0, limit);
  const chosenBm25 = chosen.map((memory) => bm25ById.get(memory.id));
  const scores = computeAbsoluteScores(chosen, chosenBm25, host.now().getTime());
  return chosen.map((memory, index) => ({
    id: memory.id,
    kind: memory.kind,
    scope: memory.scope,
    tags: memory.tags,
    anchors: memory.anchors,
    audience: memory.audience,
    text: memory.text,
    importance: memory.importance,
    confidence: memory.confidence,
    status: memory.status,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    verifiedAt: memory.lastVerifiedAt,
    score: scores[index]!,
    // Raw source score, mirroring the primary path: FTS channel ≤ 0,
    // null only if the row's bm25 could not be recovered.
    bm25: chosenBm25[index] ?? null,
    matchReason: 'lexical' as const,
  }));
}
