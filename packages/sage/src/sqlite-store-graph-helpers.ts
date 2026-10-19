import type { DatabaseSync } from 'node:sqlite';
import { sqliteRowToMemory } from './sqlite-store-codec.js';
import type { MemoryGraphEdge, MemoryGraphRelation, Sage } from './types.js';

/** Prefix used for graph node ids referencing memories. */
export const MEMORY_NODE_PREFIX = 'mem:';

/** SQL GLOB matching every graph node id owned by a memory. */
export const MEMORY_NODE_GLOB = `${MEMORY_NODE_PREFIX}*`;

/** Length of the graph node id prefix (e.g. "mem:" = 4). */
export const MEMORY_NODE_PREFIX_LEN = MEMORY_NODE_PREFIX.length;

/** Build the canonical graph node id for a memory. */
export function memoryNodeId(memoryId: string): string {
  return `${MEMORY_NODE_PREFIX}${memoryId}`;
}

/**
 * Reconstruct the human-readable structural evidence (`<anchorType>:<path>`)
 * for an `about_*` anchor edge from its relation and target node.
 */
function edgeEvidence(relation: string, toNode: string): { evidence: string[] } | undefined {
  const match = /^about_(\w+)$/.exec(relation);
  if (!match) return undefined;
  const anchorType = match[1];
  const anchorPath = toNode.replace(/^(file|dir|symbol|command|agent):/, '');
  return { evidence: [`${anchorType}:${anchorPath}`] };
}

export interface SqliteGraphEdgeRow {
  from_node: string;
  to_node: string;
  relation: MemoryGraphRelation;
  weight: number;
  created_at: string;
}

export function sqliteRowToGraphEdge(id: string, row: SqliteGraphEdgeRow): MemoryGraphEdge {
  return {
    id,
    from: row.from_node,
    to: row.to_node,
    relation: row.relation,
    weight: row.weight,
    createdAt: row.created_at,
    schemaVersion: 1,
    ...(edgeEvidence(row.relation, row.to_node) ?? {}),
  };
}

export interface SqliteReferenceCleanupContext {
  stmt: (sql: string) => ReturnType<DatabaseSync['prepare']>;
  nowIso: () => string;
  upsertMemory: (memory: Sage) => void;
}

/**
 * Remove references to a deleted memory (`targetId`) from other active/stale memories'
 * `supersedes`, `contradicts`, and `supersededBy` fields.
 */
export function cleanReferencingMemories(
  ctx: SqliteReferenceCleanupContext,
  targetId: string,
): void {
  cleanReferencingMemoriesBatch(ctx, [targetId]);
}

/**
 * {@link cleanReferencingMemories} for many targets in ONE table scan.
 *
 * The per-target form runs a `json_each` scan over every memory; hygiene's
 * session GC called it once per expired memory, which was 8.5s of a 14s pass
 * on a 16k-row store (225 targets x ~38ms) — all of it inside one mutation
 * that blocks every daemon client. Only rows that reference anything are
 * decoded here, and each is rewritten at most once.
 */
export function cleanReferencingMemoriesBatch(
  ctx: SqliteReferenceCleanupContext,
  targetIds: Iterable<string>,
): void {
  const targets = new Set(targetIds);
  if (targets.size === 0) return;
  const refs = ctx
    .stmt(
      `SELECT id, data FROM memories
       WHERE status != 'deleted'
         AND CASE WHEN json_valid(data) THEN (
           json_extract(data, '$.supersededBy') IS NOT NULL
           OR COALESCE(json_array_length(json_extract(data, '$.supersedes')), 0) > 0
           OR COALESCE(json_array_length(json_extract(data, '$.contradicts')), 0) > 0
         ) ELSE 0 END`,
    )
    .all() as Array<{ id: string; data: string }>;

  for (const ref of refs) {
    if (targets.has(ref.id)) continue;
    const other = sqliteRowToMemory(ref);
    const patch: Partial<Sage> = {};
    if (other.supersedes?.some((value) => targets.has(value))) {
      patch.supersedes = other.supersedes.filter((value) => !targets.has(value));
    }
    if (other.contradicts?.some((value) => targets.has(value))) {
      patch.contradicts = other.contradicts.filter((value) => !targets.has(value));
    }
    if (other.supersededBy !== undefined && targets.has(other.supersededBy)) {
      patch.supersededBy = undefined;
    }
    if (Object.keys(patch).length === 0) continue;
    ctx.upsertMemory({
      ...other,
      ...patch,
      revision: other.revision + 1,
      updatedAt: ctx.nowIso(),
    });
  }
}
