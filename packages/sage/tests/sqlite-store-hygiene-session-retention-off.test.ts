/**
 * Regression (F405): `sessionRetentionDays: 0` turns AGE-based session GC off,
 * like `purgeDeletedAfterDays: 0`. Read as a day count, 0 made every session
 * memory without `expiresAt` "aged out", so hygiene tombstoned notes written
 * seconds earlier. An explicit `expiresAt` must still be collected.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteMemoryPort } from '../src/memory-port.js';

const DAY_MS = 86_400_000;
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup().catch(() => undefined);
});

async function statusOf(store: SqliteMemoryPort, id: string): Promise<string> {
  for (const status of ['active', 'stale', 'deleted'] as const) {
    const page = await store.listSagePage({
      statuses: [status],
      limit: 200,
      includeAllSessions: true,
    });
    if ((page.memories ?? []).some((memory) => memory.id === id)) return status;
  }
  return 'missing';
}

describe('hygiene sessionRetentionDays = 0', () => {
  it.each([0, -1])(
    'keeps fresh session memories and still collects expired ones (%s)',
    async (days) => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-session-retention-off-'));
      const store = new SqliteMemoryPort({ projectRoot: dir });
      cleanups.push(async () => {
        await store.dispose?.();
        await fs.rm(dir, { recursive: true, force: true });
      });
      const base = {
        scope: 'session' as const,
        ownerSessionId: 'sess-off',
        kind: 'fact' as const,
        importance: 0.5,
        confidence: 0.5,
      };
      const fresh = await store.rememberSage({
        ...base,
        text: 'Fresh session note that a disabled retention must keep.',
      });
      const expired = await store.rememberSage({
        ...base,
        text: 'Session note whose explicit expiresAt already passed.',
        expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
      });

      await store.hygiene({ sessionRetentionDays: days, verify: false });

      expect(await statusOf(store, fresh.id)).toBe('active');
      expect(await statusOf(store, expired.id)).toBe('deleted');
    },
  );
});
