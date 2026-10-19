/**
 * Implementation of `unifiedSearchService` for the SAGE IPC op `unifiedSearch`.
 *
 * Wired 2026-07-28 (commit 1.5). See `packages/sage/docs/search-and-suggest.md`
 * for the design contract.
 *
 * Supports: text prefix-match (FTS5), kinds/scopes/status/importance/freshness/
 * path-anchor filters, audience + anchor post-filters, configurable limit,
 * status selection, and four ranking modes:
 * - 'relevance': bm25 ASC, importance DESC, updated_at DESC (lexical-first)
 * - 'recency': updated_at DESC, importance DESC
 * - 'importance': importance DESC, updated_at DESC
 * - 'hybrid' (default): bm25 ASC, importance DESC, updated_at DESC
 *
 * Scores are absolute in [0, 1] — the same formula runs for every query
 * (sigmoid-bm25 × metadata for FTS, additive recency + metadata otherwise),
 * so a ≥0.5 threshold means the same thing across result sets (design doc §6).
 * Suggestions implement the design doc's v1
 * lexical-adjacency method: 'never' / 'empty' (default) / 'always' via an
 * OR-expanded FTS query (graph BFS is the documented v2 method, deferred).
 *
 * Cursor pagination (B3/B4): `query.cursor` is an opaque keyset token from
 * `SearchResult.nextCursor`, bound to the exact query/filters/ranking/
 * session context that minted it. Malformed or mismatched tokens throw
 * `InvalidSearchCursorError` — boundary handlers map that to HTTP 400;
 * pagination never silently restarts. The walk is deterministic per corpus
 * state, but bm25 depends on corpus statistics, so concurrent writes can
 * reorder or rescore pages (no snapshot guarantee). Suggestions are emitted
 * only on cursor-less (first-page) requests.
 *
 * Single-owner-of-state invariant preserved — read-only, composes against
 * FTS5 + the existing memories join.
 */
import type { SQLInputValue } from 'node:sqlite';
import { normalizeProjectPath, normalizeSlashes } from './paths.js';
import type {
  SearchHit,
  SearchMatchReason,
  SearchOptions,
  SearchQuery,
  SearchRanking,
  SearchResult,
} from './service-contract.js';
import { InvalidSearchCursorError } from './service-contract.js';
import {
  buildKeysetPredicate,
  buildOrderBy,
  computeCursorBinding,
  decodeSearchCursor,
  encodeSearchCursor,
  rankingSortKeys,
} from './sqlite-search-cursor.js';
import type { SqliteAdminHost } from './sqlite-store-admin.js';
import {
  appendFreshnessClauses,
  buildPathExistsClause,
  computeAbsoluteScores,
  JS_FILTER_OVERFETCH,
  MAX_LIMIT,
  suggestLexicalAdjacent,
} from './sqlite-store-search-adjacent.js';
import {
  buildSessionClause,
  ftsPrefixTerms,
  sqliteRowsToMemories,
} from './sqlite-store-search-helpers.js';
import type { MemoryAnchor, MemoryAudienceSelector, Sage, SageStatus } from './types.js';

const DEFAULT_LIMIT = 50;

export function executeUnifiedSearch(
  host: SqliteAdminHost,
  query: SearchQuery,
  options?: SearchOptions | undefined,
): SearchResult {
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const statusFilter = options?.includeStatuses ?? (['active'] as SageStatus[]);
  const ranking: SearchRanking = options?.ranking ?? 'hybrid';
  // Session isolation: session-scoped memories must only be visible to their
  // owning session (or to administrative callers that opt out explicitly).
  const session = buildSessionClause(options);
  const ftsSession = buildSessionClause(options, 'm.');
  // WebUI discovery policy (docs/plans/unified-sage-search-backend-contract.md):
  // when opted in, exclude ALL session-scoped rows — including legacy
  // unowned ones — from rows AND counts. The WebUI access token carries no
  // authenticated agent-session identity, so a client-provided `sessionId`
  // (or the `includeAllSessions` admin opt-out) must never surface a
  // session-scoped record through this surface. Stacked on top of the
  // shared per-session visibility clause, not a replacement for it.
  // `scope` is NOT NULL in the schema, so `!= 'session'` drops nothing else.
  const excludeSessionScoped = options?.excludeSessionScoped === true;
  const sessionExclusionParams: SQLInputValue[] = excludeSessionScoped ? ['session'] : [];

  // Cursor contract (B3/B4): strict, query/filter-bound keyset pagination.
  // A token is only valid for the exact request shape that minted it;
  // anything else is a client error (InvalidSearchCursorError → HTTP 400
  // at the boundary), never a silent first page.
  if (
    query.cursor !== undefined &&
    (typeof query.cursor !== 'string' || query.cursor.length === 0)
  ) {
    throw new InvalidSearchCursorError(
      'Search cursor must be a non-empty opaque token from SearchResult.nextCursor.',
    );
  }

  // Match clause: build a safe FTS5 MATCH expression from the query text.
  // Computed before the cursor decode so the token's channel binding can be
  // validated against the channel this request will actually run on.
  const matchExpr = buildMatchExpr(query);
  const channel: 'fts' | 'plain' = matchExpr !== undefined ? 'fts' : 'plain';
  const binding = computeCursorBinding(query, statusFilter, ranking, options);
  const cursorValues =
    query.cursor !== undefined
      ? decodeSearchCursor(query.cursor, { binding, ranking, channel })
      : undefined;

  if (statusFilter.length === 0) {
    return {
      hits: [],
      suggestions: [],
      totalCandidates: 0,
      rankingApplied: ranking,
      queryEcho: {},
      nextCursor: null,
      matchChannel: channel,
    };
  }

  // JS-side filters (audience/anchor) live in the JSON payload and cannot be
  // expressed cleanly in the SQL WHERE clause, so they run post-fetch inside
  // an over-fetch window that keeps the pre-filter LIMIT from starving them.
  const jsFilters: Array<(memory: Sage) => boolean> = [];
  if (query.audience) {
    jsFilters.push((memory) => audienceSelectorMatches(query.audience!, memory.audience));
  }
  if (query.anchor) {
    jsFilters.push((memory) => anchorMatches(query.anchor!, memory.anchors, host.projectRoot));
  }
  const sqlLimit =
    jsFilters.length > 0 ? Math.min(limit * JS_FILTER_OVERFETCH, MAX_LIMIT * 5) : limit;

  // WHERE filters — built inline in the FTS and non-FTS query paths below.
  const statusPlaceholders = statusFilter.map(() => '?').join(',');

  // ORDER BY clause per ranking mode
  const orderBy = buildOrderBy(ranking);

  // Two query paths, mirroring `searchSqliteSage`. FTS5 requires
  // MATCH + bm25 to both be present. Split paths let both be tested
  // independently. The FTS path additionally selects the raw bm25 rank so
  // hits can be scored absolutely (see computeAbsoluteScores).
  let dataRows: Array<{ id?: string; data: string; bm25?: number }>;
  let totalRow: { n: number };
  let matchReason: SearchMatchReason;

  if (matchExpr !== undefined) {
    // FTS path — JOIN memories_fts, MATCH, ORDER BY ranking.
    const ftsFilterClauses: string[] = [
      'm.status IN (' + statusPlaceholders + ')',
      'memories_fts MATCH ?',
    ];
    const ftsParams: SQLInputValue[] = [...statusFilter, matchExpr];
    if (query.kinds && query.kinds.length > 0) {
      ftsFilterClauses.push(`m.kind IN (${query.kinds.map(() => '?').join(',')})`);
      ftsParams.push(...query.kinds);
    }
    if (query.scopes && query.scopes.length > 0) {
      ftsFilterClauses.push(`m.scope IN (${query.scopes.map(() => '?').join(',')})`);
      ftsParams.push(...query.scopes);
    }
    if (query.importanceAtLeast !== undefined) {
      ftsFilterClauses.push('m.importance >= ?');
      ftsParams.push(query.importanceAtLeast);
    }
    appendFreshnessClauses(query, ftsFilterClauses, ftsParams, 'm.');
    const pathClause = buildPathExistsClause(host.projectRoot, query, 'm.');
    if (pathClause) {
      ftsFilterClauses.push(pathClause.clause);
      ftsParams.push(...pathClause.params);
    }
    if (ftsSession.clause) {
      ftsFilterClauses.push(ftsSession.clause.replace(/^\s*AND\s+/i, ''));
      ftsParams.push(...ftsSession.params);
    }
    if (excludeSessionScoped) {
      ftsFilterClauses.push('m.scope != ?');
      ftsParams.push(...sessionExclusionParams);
    }

    // The keyset predicate rides ONLY on the data query: `totalCandidates`
    // reports the whole-corpus match count for the query + filters, not the
    // remaining page tail, so every page of one walk reports the same total.
    const ftsBaseWhereSql = ' WHERE ' + ftsFilterClauses.join(' AND ');
    let ftsDataWhereSql = ftsBaseWhereSql;
    let ftsDataParams: SQLInputValue[] = ftsParams;
    if (cursorValues) {
      const keyset = buildKeysetPredicate(rankingSortKeys(ranking, true), cursorValues, true);
      ftsDataWhereSql = ' WHERE ' + [...ftsFilterClauses, keyset.clause].join(' AND ');
      ftsDataParams = [...ftsParams, ...keyset.params];
    }
    const ftsDataSql =
      // `m.id` rides along with `m.data` purely so the bm25-by-id map below can
      // be built without a second JSON.parse of every returned row.
      // CROSS JOIN with `memories_fts` first pins the join order so the MATCH
      // drives the scan — see the note in sqlite-store-search-sage.ts.
      `SELECT m.id AS id, m.data, bm25(memories_fts) AS bm25 FROM memories_fts f CROSS JOIN memories m ON m.rowid = f.rowid` +
      ftsDataWhereSql +
      ` ORDER BY ${orderBy.fts}` +
      // +1 probe row: when no JS-side filter shrinks the page, fetching one
      // row past the page size is the only way to distinguish "last page"
      // from "exactly one more page exists" without a second query.
      ` LIMIT ${sqlLimit + 1}`;
    const ftsCountSql =
      `SELECT COUNT(*) AS n FROM memories_fts f CROSS JOIN memories m ON m.rowid = f.rowid` +
      ftsBaseWhereSql;

    dataRows = host.stmt(ftsDataSql).all(...ftsDataParams) as Array<{
      id?: string;
      data: string;
      bm25?: number;
    }>;
    totalRow = host.stmt(ftsCountSql).get(...ftsParams) as unknown as { n: number };
    matchReason = 'lexical';
  } else {
    // Non-FTS path — plain SELECT on memories, ORDER BY ranking.
    const sharedWhere: string[] = [`status IN (${statusPlaceholders})`];
    const params: SQLInputValue[] = [...statusFilter];
    if (query.kinds && query.kinds.length > 0) {
      sharedWhere.push(`kind IN (${query.kinds.map(() => '?').join(',')})`);
      params.push(...query.kinds);
    }
    if (query.scopes && query.scopes.length > 0) {
      sharedWhere.push(`scope IN (${query.scopes.map(() => '?').join(',')})`);
      params.push(...query.scopes);
    }
    if (query.importanceAtLeast !== undefined) {
      sharedWhere.push('importance >= ?');
      params.push(query.importanceAtLeast);
    }
    appendFreshnessClauses(query, sharedWhere, params, '');
    const pathClause = buildPathExistsClause(host.projectRoot, query, '');
    if (pathClause) {
      sharedWhere.push(pathClause.clause);
      params.push(...pathClause.params);
    }
    if (session.clause) {
      sharedWhere.push(session.clause.replace(/^\s*AND\s+/i, ''));
      params.push(...session.params);
    }
    if (excludeSessionScoped) {
      sharedWhere.push('scope != ?');
      params.push(...sessionExclusionParams);
    }

    const baseWhereSql = sharedWhere.length > 0 ? ' WHERE ' + sharedWhere.join(' AND ') : '';
    // Keyset on the data query only — see the FTS path for why the count
    // query stays whole-corpus.
    let dataWhereSql = baseWhereSql;
    let dataParams: SQLInputValue[] = params;
    if (cursorValues) {
      const keyset = buildKeysetPredicate(rankingSortKeys(ranking, false), cursorValues, false);
      dataWhereSql = ' WHERE ' + [...sharedWhere, keyset.clause].join(' AND ');
      dataParams = [...params, ...keyset.params];
    }

    const dataSql =
      `SELECT data FROM memories` +
      dataWhereSql +
      ` ORDER BY ${orderBy.nonFts}` +
      // +1 probe row — see the FTS path for why.
      ` LIMIT ${sqlLimit + 1}`;
    const countSql = `SELECT COUNT(*) AS n FROM memories` + baseWhereSql;

    dataRows = host.stmt(dataSql).all(...dataParams) as Array<{ data: string }>;
    totalRow = host.stmt(countSql).get(...params) as unknown as { n: number };
    matchReason = 'recency';
  }

  // Decode rows, carry the per-row bm25 rank alongside, apply JS-side
  // filters (audience/anchor) index-aligned, then slice to the caller's
  // limit. Corrupt rows are skipped leniently by sqliteRowsToMemories, so
  // bm25 is looked up by memory id instead of by position.
  const decodedMemories = sqliteRowsToMemories(dataRows);
  // bm25 is only selected on the FTS path — skip the map build otherwise.
  // Keyed off the SQL-projected `id` column rather than a re-parse of
  // `row.data`: the ids are identical (both come from the same row) and the
  // over-fetch window here reaches several hundred rows, so a second
  // JSON.parse per row was pure waste.
  const bm25ById = new Map<string, number | undefined>();
  if (matchExpr !== undefined) {
    for (const row of dataRows) {
      if (row.id !== undefined) bm25ById.set(row.id, row.bm25);
    }
  }
  let kept: Sage[] = decodedMemories;
  if (jsFilters.length > 0) {
    kept = kept.filter((memory) => jsFilters.every((filter) => filter(memory)));
  }
  const finalMemories = kept.slice(0, limit);
  const finalBm25 = finalMemories.map((memory) => bm25ById.get(memory.id));

  // Compute absolute quality scores (comparable across result sets).
  const scores = computeAbsoluteScores(finalMemories, finalBm25, host.now().getTime());

  const hits: SearchHit[] = finalMemories.map((memory, index) => ({
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
    // Raw source score: present (and ≤ 0) on the FTS channel, null when the
    // plain channel ranked without a text query. See SearchHit.bm25.
    bm25: finalBm25[index] ?? null,
    matchReason,
  }));

  // ─── Keyset anchor: mint the next page's cursor ────────────────────────
  // The cursor encodes the total-order position of the LAST row the caller
  // has now consumed:
  //  - Overflow page (kept > limit): anchor at the last RETURNED hit. The
  //    un-returned kept rows sort after it and are re-fetched on the next
  //    page — advancing to the window end instead would SKIP them.
  //  - Full fetch window with kept ≤ limit (audience/anchor JS filters can
  //    drop rows): anchor at the last DECODED window row so the next page
  //    does not re-scan rows this call already examined.
  //  - Partial window: the walk is exhausted → null.
  // A window whose rows were ALL corrupt cannot mint a position (no decoded
  // anchor exists); pagination stops instead of looping on the same corrupt
  // window forever. The +1 probe row makes "window exhausted" observable:
  // a full window is `dataRows.length > sqlLimit`.
  const windowExhausted = dataRows.length > sqlLimit;
  const anchorMemory =
    kept.length > limit
      ? finalMemories[finalMemories.length - 1]
      : windowExhausted
        ? decodedMemories[decodedMemories.length - 1]
        : undefined;
  const sortKeys = rankingSortKeys(ranking, matchExpr !== undefined);
  let nextCursor: string | null = null;
  if (anchorMemory) {
    const anchorBm25 = bm25ById.get(anchorMemory.id);
    // Only the bm25-first rankings (relevance/hybrid on the FTS channel)
    // carry the bm25 key in their cursor tuple; for every other mode the
    // value is irrelevant and the token must NOT carry it (decode rejects
    // a stray bm25 slot so a token minted by one mode cannot be replayed
    // against another's tuple shape).
    const needsBm25 = sortKeys.includes('bm25');
    if (!needsBm25 || typeof anchorBm25 === 'number') {
      nextCursor = encodeSearchCursor({
        binding,
        ranking,
        channel,
        values: {
          ...(needsBm25 ? { bm25: anchorBm25 as number } : {}),
          importance: anchorMemory.importance ?? 0,
          updatedAt: anchorMemory.updatedAt,
          id: anchorMemory.id,
        },
      });
    }
  }

  // Suggestions: design-doc v1 lexical adjacency. 'never' disables; 'empty'
  // (default) populates only when the hits set is empty; 'always' populates
  // whenever an OR-expanded FTS query finds neighbors. Cursor pages are
  // excluded: suggestions are derived from the query, not the page, so
  // emitting them per page would repeat the same set on every request.
  let suggestions: SearchHit[] = [];
  const suggestMode = options?.suggest ?? 'empty';
  if (
    query.cursor === undefined &&
    suggestMode !== 'never' &&
    (suggestMode === 'always' || hits.length === 0)
  ) {
    suggestions = suggestLexicalAdjacent({
      host,
      query,
      matchExpr,
      limit,
      hits,
      statuses: statusFilter,
      ranking,
      ftsSession,
      jsFilters,
      excludeSessionScoped,
    });
  }

  // Echo the parsed query back so callers can confirm input parsing.
  const queryEcho: SearchResult['queryEcho'] = {};
  if (query.text !== undefined) queryEcho.text = query.text;
  if (query.kinds !== undefined) queryEcho.kinds = query.kinds;
  if (query.scopes !== undefined) queryEcho.scopes = query.scopes;
  if (query.importanceAtLeast !== undefined) queryEcho.importanceAtLeast = query.importanceAtLeast;
  if (query.freshness !== undefined) queryEcho.freshness = query.freshness;
  if (query.paths !== undefined) queryEcho.paths = query.paths;
  if (query.audience !== undefined) queryEcho.audience = query.audience;
  if (query.anchor !== undefined) queryEcho.anchor = query.anchor;

  return {
    hits,
    suggestions,
    // SQL-level match count — before JS-side audience/anchor filters are
    // applied, so it can overstate when query.audience / query.anchor are set.
    totalCandidates: totalRow.n,
    rankingApplied: ranking,
    queryEcho,
    nextCursor,
    matchChannel: channel,
  };
}

/**
 * Build a safe FTS5 MATCH expression from the query text. The terms
 * emitted by `ftsPrefixTerms` are pre-sanitized. Joining with `AND`
 * ensures all terms must match.
 *
 * Returns `undefined` for empty / whitespace / sanitized-to-empty
 * queries, signalling "no FTS constraint".
 */
function buildMatchExpr(query: SearchQuery): string | undefined {
  if (query.text === undefined || query.text === null) return undefined;
  const trimmed = query.text.trim();
  if (trimmed.length === 0) return undefined;
  const terms = ftsPrefixTerms(trimmed);
  if (terms.length === 0) return undefined;
  return terms.join(' AND ');
}

/**
 * True when a memory's audience selector is satisfied by the caller's
 * selector. Mirrors the canonical `retrieveSqliteSageForAudience` semantics:
 * every dimension the MEMORY specifies (roles/taskTypes/modes) must be
 * satisfied by at least one of the requested values for that dimension, and
 * values are normalized the same way the store normalizes them at write time
 * (NFKC, trimmed, lowercased) so case/format never leaks into matching.
 */
function audienceSelectorMatches(
  wanted: MemoryAudienceSelector,
  have: MemoryAudienceSelector | undefined,
): boolean {
  if (!have) return false;
  const normalize = (values?: string[]): string[] | undefined =>
    values?.map((value) => value.normalize('NFKC').trim().toLowerCase());
  const want = {
    roles: normalize(wanted.roles),
    taskTypes: normalize(wanted.taskTypes),
    modes: normalize(wanted.modes),
  };
  const memoryAudience = {
    roles: normalize(have.roles),
    taskTypes: normalize(have.taskTypes),
    modes: normalize(have.modes),
  };
  const intersects = (a?: string[], b?: string[]): boolean =>
    a !== undefined && b !== undefined && a.some((value) => b.includes(value));
  if (memoryAudience.roles && !intersects(want.roles, memoryAudience.roles)) return false;
  if (memoryAudience.taskTypes && !intersects(want.taskTypes, memoryAudience.taskTypes))
    return false;
  if (memoryAudience.modes && !intersects(want.modes, memoryAudience.modes)) return false;
  return true;
}

/** True when a memory carries an anchor matching the caller's `anchor` filter. */
function anchorMatches(
  wanted: MemoryAnchor,
  anchors: MemoryAnchor[],
  projectRoot: string,
): boolean {
  let wantedPath: string | undefined;
  if (wanted.path) {
    try {
      wantedPath = normalizeProjectPath(projectRoot, wanted.path).toLowerCase();
    } catch {
      return false;
    }
  }
  const wantedSymbol = wanted.symbol !== undefined ? wanted.symbol.trim() : undefined;
  const wantedCommand =
    wanted.command !== undefined ? wanted.command.trim().replace(/\s+/g, ' ') : undefined;
  const wantedRole = wanted.role !== undefined ? wanted.role.trim().toLowerCase() : undefined;
  return anchors.some((anchor) => {
    if (anchor.type !== wanted.type) return false;
    if (wantedPath !== undefined) {
      const havePath = anchor.path ? normalizeSlashes(anchor.path).toLowerCase() : undefined;
      if (havePath !== wantedPath) return false;
    }
    if (wantedSymbol !== undefined && (anchor.symbol?.trim() ?? '') !== wantedSymbol) return false;
    if (
      wantedCommand !== undefined &&
      (anchor.command?.trim().replace(/\s+/g, ' ') ?? '') !== wantedCommand
    ) {
      return false;
    }
    if (wantedRole !== undefined && (anchor.role?.trim().toLowerCase() ?? '') !== wantedRole) {
      return false;
    }
    return true;
  });
}
