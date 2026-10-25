import type { DatabaseSync } from 'node:sqlite';

/**
 * Record that a verification pass confirmed a memory without changing what it
 * says. Like the injection/use counters this is bookkeeping, not a semantic
 * rewrite: `revision` and `updated_at` stay untouched.
 *
 * Routing a passing check through `applySemanticChange` re-dated every
 * anchored memory on each scheduled hygiene run (every 6h): `updatedAt` stopped
 * meaning "content changed", so retention aging (`lastAccessedAt ?? updatedAt`)
 * and recency ranking saw the whole verified corpus as written today, and each
 * pass advanced the logical revision HQ synchronization resolves conflicts by.
 * A status flip (active ↔ stale) IS semantic and must keep using
 * `applySemanticChange`.
 */
export function stampSqliteVerification(
  stmt: (sql: string) => ReturnType<DatabaseSync['prepare']>,
  memoryId: string,
  lastVerifiedAt: string,
  freshness?: number,
): void {
  if (freshness === undefined) {
    stmt(
      `UPDATE memories SET data = json_set(data, '$.lastVerifiedAt', ?)
       WHERE id = ? AND json_valid(data)`,
    ).run(lastVerifiedAt, memoryId);
    return;
  }
  stmt(
    `UPDATE memories SET data = json_set(data, '$.lastVerifiedAt', ?, '$.freshness', ?), freshness = ?
     WHERE id = ? AND json_valid(data)`,
  ).run(lastVerifiedAt, freshness, freshness, memoryId);
}
