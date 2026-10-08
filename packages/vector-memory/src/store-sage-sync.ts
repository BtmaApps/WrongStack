import { withFileLock } from '@wrongstack/core/utils';
import {
  DEFAULT_LOCK_TIMEOUT_MS,
  errMsg,
  jsonValuesEqual,
  vectorContentHash,
} from './store-values.js';
import type { SageSyncReport, VectorEntryInput, VectorEntryWithVector } from './types.js';

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

export interface VectorSageSyncHost {
  assertOpen(): void;
  findBySageId(sageId: string): VectorEntryWithVector | undefined;
  readonly lockPath: string;
  forgetUnlocked(id: string): boolean;
  rememberUnlocked(input: VectorEntryInput): Promise<VectorEntryWithVector>;
}

export async function syncSageEntries(
  host: VectorSageSyncHost,
  sage: SageSyncSource,
): Promise<SageSyncReport> {
  host.assertOpen();
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
      const hash = vectorContentHash(memory.text);
      const expectedMetadata = {
        ...(memory.metadata ?? {}),
        source: 'sage',
        sageId: memory.id,
      };
      const expectedTags = memory.tags ?? [];
      const expectedSummary = memory.summary ?? undefined;
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
      const changed = await withFileLock(
        host.lockPath,
        async () => {
          // Re-read after waiting for the lock; another sync may have replaced the row.
          const existing = host.findBySageId(memory.id);
          const sameState =
            existing !== undefined &&
            vectorContentHash(existing.text) === hash &&
            existing.summary === expectedSummary &&
            jsonValuesEqual(existing.tags, expectedTags) &&
            jsonValuesEqual(existing.metadata, expectedMetadata);
          if (sameState) return false;
          if (existing) {
            host.forgetUnlocked(existing.id);
          }
          await host.rememberUnlocked({
            text: memory.text,
            summary: expectedSummary,
            metadata: expectedMetadata,
            tags: expectedTags,
            scope: 'project',
            kind: 'note',
          });
          return true;
        },
        { timeoutMs: DEFAULT_LOCK_TIMEOUT_MS },
      );
      if (changed) indexed++;
      else skipped++;
    } catch (err) {
      failed++;
      errors.push({ memoryId: memory.id, message: errMsg(err) });
    }
  }
  return { scanned: memories.length, indexed, skipped, failed, errors };
}
