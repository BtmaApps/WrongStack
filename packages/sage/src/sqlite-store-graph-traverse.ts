import type { DatabaseSync } from 'node:sqlite';
import { ulid } from '@wrongstack/core/utils';

import { boundedLimit } from './shared/pagination.js';
import { type SqliteGraphEdgeRow, sqliteRowToGraphEdge } from './sqlite-store-graph-helpers.js';
import type { MemoryGraphEdge, MemoryGraphRelation } from './types.js';

interface SqliteGraphTraverseContext {
  stmt: (sql: string) => ReturnType<DatabaseSync['prepare']>;
}

/**
 * Degree above which a node is a hub: it is reported when reached but never
 * expanded through, and a hub start contributes only its strongest edges.
 *
 * A hub links everything to everything, so walking through it carries no
 * relatedness signal — it is the graph's stop word. The live store had eight
 * legacy memories with ~750 `same_topic` in-edges each (and a `file:.` node
 * with ~190): one hop through any of them flooded `findRelatedSage` with the
 * hub's whole neighbourhood, filled the result cap with it, and made the
 * call scale with hub size (331 daemon slow-op reports over 1s in 3 days).
 */
export const GRAPH_HUB_DEGREE = 64;

/**
 * Relations that carry no structure of their own: only these make a node a
 * hub, and only these are pruned at one.
 *
 * The doctor counts a hub the SAME way (`HUB_NODES_SQL` in
 * `sqlite-store-doctor.ts`) - the report and the expansion have to describe
 * the same set of nodes, or the health report is blind to half of the
 * damping. A node whose degree comes from STRUCTURAL edges (`about_file`,
 * `about_symbol`, …) carries real evidence, and dropping it silently loses
 * the memories behind it.
 */
export const SOFT_RELATIONS: readonly MemoryGraphRelation[] = ['same_topic', 'related_to'];

/** True when the relation is one of the structure-free relations. */
export function isSoftRelation(relation: MemoryGraphRelation): boolean {
  return SOFT_RELATIONS.includes(relation);
}

export function traverseSqliteGraph(
  ctx: SqliteGraphTraverseContext,
  starts: string[],
  opts?: { maxDepth?: number; limit?: number },
): MemoryGraphEdge[] {
  const maxDepth = boundedLimit(opts?.maxDepth, 2, 6);
  const limit = boundedLimit(opts?.limit, 100, 1000);

  const startSet = new Set(starts);
  const visitedNodes = new Set(starts);
  const visitedEdges = new Set<string>();
  const result: MemoryGraphEdge[] = [];
  let frontier = [...startSet];
  let depth = 0;

  while (frontier.length > 0 && result.length < limit && depth < maxDepth) {
    const nextFrontier: string[] = [];
    const CHUNK = 200;
    for (let i = 0; i < frontier.length; i += CHUNK) {
      const chunk = frontier.slice(i, i + CHUNK);
      const ph = chunk.map(() => '?').join(',');
      const rows = ctx
        .stmt(
          `SELECT from_node, to_node, relation, weight, created_at FROM edges
           WHERE from_node IN (${ph}) OR to_node IN (${ph})`,
        )
        .all(...chunk, ...chunk) as unknown as SqliteGraphEdgeRow[];
      const frontierSet = new Set(chunk);
      for (const r of capHubRows(rows, frontierSet, startSet)) {
        if (result.length >= limit) break;
        const edgeKey = `${r.from_node}\u0000${r.to_node}\u0000${r.relation}`;
        if (visitedEdges.has(edgeKey)) continue;
        visitedEdges.add(edgeKey);
        result.push(sqliteRowToGraphEdge(ulid(), r));
        const next =
          frontierSet.has(r.from_node) && !frontierSet.has(r.to_node)
            ? r.to_node
            : frontierSet.has(r.to_node) && !frontierSet.has(r.from_node)
              ? r.from_node
              : null;
        if (next && !visitedNodes.has(next)) {
          visitedNodes.add(next);
          nextFrontier.push(next);
        }
      }
    }
    frontier = nextFrontier;
    depth += 1;
  }
  return result;
}

/**
 * Drops a reached hub's edges entirely and trims a hub start to its
 * {@link GRAPH_HUB_DEGREE} strongest edges. Rows are attributed to the
 * frontier node they were fetched for (`from` first), so an edge between two
 * frontier nodes is judged once.
 */
function capHubRows(
  rows: SqliteGraphEdgeRow[],
  frontierSet: ReadonlySet<string>,
  startSet: ReadonlySet<string>,
): SqliteGraphEdgeRow[] {
  if (rows.length <= GRAPH_HUB_DEGREE) return rows;
  const byOwner = new Map<string, SqliteGraphEdgeRow[]>();
  for (const row of rows) {
    const owner = frontierSet.has(row.from_node) ? row.from_node : row.to_node;
    const bucket = byOwner.get(owner);
    if (bucket) bucket.push(row);
    else byOwner.set(owner, [row]);
  }
  const kept: SqliteGraphEdgeRow[] = [];
  for (const [owner, bucket] of byOwner) {
    // A hub is a node flooded by STRUCTURE-FREE edges - the same count the
    // doctor reports. Counting every incident row here would damp nodes
    // whose degree is structural evidence, and drop that evidence silently.
    const softCount = bucket.reduce((sum, row) => sum + (isSoftRelation(row.relation) ? 1 : 0), 0);
    if (softCount <= GRAPH_HUB_DEGREE) {
      kept.push(...bucket);
    } else if (startSet.has(owner)) {
      kept.push(...[...bucket].sort((a, b) => b.weight - a.weight).slice(0, GRAPH_HUB_DEGREE));
    }
  }
  return kept;
}
