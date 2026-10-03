import type { DatabaseSync } from 'node:sqlite';
import { withFileLock } from '@wrongstack/core/utils';
import { VectorMemoryError } from './errors.js';
import { encodeVector } from './schema.js';
import { DEFAULT_LOCK_TIMEOUT_MS } from './store-values.js';
import type { VectorMemoryStoreOptions, VectorStoreStats } from './types.js';

/** Maximum entries to evict in a single LRU sweep. */
const CACHE_EVICT_BATCH = 256;

export interface VectorMaintenanceHost {
  assertOpen(): void;
  readonly lockPath: string;
  readonly db: DatabaseSync;
  readonly provider: VectorMemoryStoreOptions['provider'];
  cacheVector(text: string, vec: Float32Array, now: string): void;
}

export async function reindexVectorEntries(
  host: VectorMaintenanceHost,
  opts: { onlyMissing?: boolean } = {},
): Promise<{ processed: number; errors: number }> {
  host.assertOpen();
  if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
    throw new VectorMemoryError('VectorMemoryStore.reindexAll: options must be an object');
  }
  if (opts.onlyMissing !== undefined && typeof opts.onlyMissing !== 'boolean') {
    throw new VectorMemoryError('VectorMemoryStore.reindexAll: onlyMissing must be a boolean');
  }
  return withFileLock(
    host.lockPath,
    async () => {
      const rows = (
        opts.onlyMissing
          ? host.db
              .prepare(`SELECT e.id, e.text FROM entries e
              WHERE NOT EXISTS (SELECT 1 FROM vectors v WHERE v.entry_id = e.id
                AND v.provider_id = ? AND v.dimensions = ?)`)
              .all(host.provider.id, host.provider.dimensions)
          : host.db.prepare('SELECT id, text FROM entries').all()
      ) as Array<Record<string, unknown>>;
      let processed = 0;
      let errors = 0;
      for (const row of rows) {
        try {
          // Bypass the cache during reindex — the goal is to refresh
          // the per-entry vector, even if the cached text-vector is
          // already valid for the same content_hash.
          const result = await host.provider.embed([row.text as string]);
          const v = result[0];
          if (!v || v.length !== host.provider.dimensions || !v.every(Number.isFinite)) {
            errors++;
            continue;
          }
          const now = new Date().toISOString();
          host.db
            .prepare(
              `INSERT INTO vectors (entry_id, provider_id, dimensions, vector, created_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(entry_id, provider_id) DO UPDATE SET
                   vector = excluded.vector,
                   dimensions = excluded.dimensions,
                   created_at = excluded.created_at`,
            )
            .run(row.id as string, host.provider.id, v.length, encodeVector(v), now);
          // Also refresh the embedding cache so subsequent searches
          // for the same text skip the ONNX pass.
          host.cacheVector(row.text as string, v, now);
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

export function vectorStoreStats(host: VectorMaintenanceHost): VectorStoreStats {
  host.assertOpen();
  const entryCount = (host.db.prepare('SELECT COUNT(*) AS n FROM entries').get() as { n: number })
    .n;
  const vectorCount = (host.db.prepare('SELECT COUNT(*) AS n FROM vectors').get() as { n: number })
    .n;
  const providerRows = host.db.prepare('SELECT DISTINCT provider_id FROM vectors').all() as Array<{
    provider_id: string;
  }>;
  return {
    entries: entryCount,
    vectors: vectorCount,
    providers: providerRows.map((r) => r.provider_id),
    modelAvailable: true,
    modelId: host.provider.id,
    dimensions: host.provider.dimensions,
  };
}

export function vectorEmbeddingCoverage(host: VectorMaintenanceHost): {
  entries: number;
  covered: number;
  missing: number;
} {
  host.assertOpen();
  const row = host.db
    .prepare(`SELECT COUNT(*) AS entries,
      COALESCE(SUM(EXISTS(SELECT 1 FROM vectors v WHERE v.entry_id = e.id
        AND v.provider_id = ? AND v.dimensions = ?)), 0) AS covered
      FROM entries e`)
    .get(host.provider.id, host.provider.dimensions) as { entries: number; covered: number };
  return { ...row, missing: row.entries - row.covered };
}

export function vectorCacheStats(host: VectorMaintenanceHost): {
  entries: number;
  providers: number;
  totalUseCount: number;
  oldestLastUsedAt: string | null;
} {
  host.assertOpen();
  const entries = (
    host.db.prepare('SELECT COUNT(*) AS n FROM embedding_cache').get() as {
      n: number;
    }
  ).n;
  const providers = (
    host.db.prepare('SELECT COUNT(DISTINCT provider_id) AS n FROM embedding_cache').get() as {
      n: number;
    }
  ).n;
  const totalUseCount = (
    host.db.prepare('SELECT COALESCE(SUM(use_count), 0) AS n FROM embedding_cache').get() as {
      n: number;
    }
  ).n;
  const oldest = host.db.prepare('SELECT MIN(last_used_at) AS t FROM embedding_cache').get() as
    | { t: string | null }
    | undefined;
  return {
    entries,
    providers,
    totalUseCount,
    oldestLastUsedAt: oldest?.t ?? null,
  };
}

export async function evictVectorCache(
  host: VectorMaintenanceHost,
  keepMostRecent: number,
): Promise<{ removed: number }> {
  host.assertOpen();
  if (!Number.isSafeInteger(keepMostRecent) || keepMostRecent < 0) {
    throw new Error('evictCache: keepMostRecent must be >= 0 and a safe integer');
  }
  return withFileLock(
    host.lockPath,
    async () => {
      const total = (
        host.db.prepare('SELECT COUNT(*) AS n FROM embedding_cache').get() as { n: number }
      ).n;
      if (total <= keepMostRecent) return { removed: 0 };
      const toRemove = total - keepMostRecent;
      const stmt = host.db.prepare(
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
