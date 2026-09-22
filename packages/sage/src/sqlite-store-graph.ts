import type { DatabaseSync } from 'node:sqlite';

import { ulid } from '@wrongstack/core/utils';

import { syncSqliteAnchorEdges } from './sqlite-store-anchor-sync.js';

import { graphSqliteSageFor } from './sqlite-store-graph-for.js';

import { syncSqliteRelationshipEdges } from './sqlite-store-relationship-sync.js';

import type { MemoryGraphEdge, MemoryGraphRelation, Sage, SageSearchOptions } from './types.js';

export interface SqliteStoreGraphHost {
  stmt: (sql: string) => ReturnType<DatabaseSync['prepare']>;
  nowIso: () => string;
  initialize: () => Promise<void>;
  events: import('./types.js').SageStoreOptions['events'];
  eventPayload: <T extends object>(
    payload: T,
  ) => T & { traceId?: string | undefined; sessionId?: string | undefined };
  projectRoot: string;
  searchSage: (query: string, opts?: SageSearchOptions) => Promise<Sage[]>;
  traverseGraph: (
    starts: string[],
    opts?: { maxDepth?: number; limit?: number },
  ) => Promise<MemoryGraphEdge[]>;
}
export function syncAnchorEdges(host: SqliteStoreGraphHost, memory: Sage): void {
  const deps = { stmt: (sql: string) => host.stmt(sql), nowIso: () => host.nowIso() };
  syncSqliteAnchorEdges(deps, memory);
  // Same hook, so every writer that refreshes a memory's graph projection
  // (remember, update, hygiene, admin) also materializes its relationship
  // assertions. Insert-only — see syncSqliteRelationshipEdges.
  syncSqliteRelationshipEdges(deps, memory);
}

export async function addGraphEdge(
  host: SqliteStoreGraphHost,
  from: string,
  to: string,
  relation: MemoryGraphRelation,
  weight = 1,
): Promise<void> {
  await host.initialize();
  const edgeId = `edge_${ulid()}`;
  // Monotone merge policy (unified 2026-08-02): `MAX(weight, excluded.weight)`
  // — concurrent writers can never erode an edge and repeated identical
  // assertions are idempotent instead of inflating strength. See the policy
  // note beside the `edges` table in sqlite-store-schema.ts.
  host
    .stmt(
      `INSERT INTO edges (from_node, to_node, relation, weight, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(from_node, to_node, relation) DO UPDATE SET weight = MAX(weight, excluded.weight)`,
    )
    .run(from, to, relation, weight, host.nowIso());
  host.events?.emit(
    'memory.graph_edge_added',
    host.eventPayload({ edgeId, from, to, relation, weight }),
  );
}

export async function graphFor(
  host: SqliteStoreGraphHost,
  query: string,
  maxDepth = 2,
  limit = 100,
): Promise<MemoryGraphEdge[]> {
  await host.initialize();
  return graphSqliteSageFor(
    {
      projectRoot: host.projectRoot,
      stmt: (sql) => host.stmt(sql),
      searchSage: (targetQuery, opts) => host.searchSage(targetQuery, opts),
      traverseGraph: (starts, opts) => host.traverseGraph(starts, opts),
    },
    query,
    maxDepth,
    limit,
  );
}
