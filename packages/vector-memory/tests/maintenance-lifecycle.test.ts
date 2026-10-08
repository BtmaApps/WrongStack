import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withFileLock } from '@wrongstack/core/utils';
import { describe, expect, it } from 'vitest';
import { VectorMemoryStore } from '../src/store.js';

describe('reindex ownership after close', () => {
  it.each(['vector', 'empty', 'failure', 'invalid'] as const)(
    'stops after a gated %s embedding completes on a closed store',
    async (outcome) => {
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      let reindexing = false;
      let calls = 0;
      const provider = {
        id: 'reindex-lifecycle',
        dimensions: 2,
        async embed() {
          if (!reindexing) return [new Float32Array([1, 0])];
          if (++calls === 1) {
            entered.resolve();
            await release.promise;
          }
          if (outcome === 'failure') throw new Error('provider outage');
          return outcome === 'empty'
            ? []
            : [new Float32Array(outcome === 'invalid' ? [1] : [1, 0])];
        },
      };
      const store = new VectorMemoryStore({
        provider,
        projectRoot: mkdtempSync(join(tmpdir(), 'wrongstack-reindex-lifecycle-')),
      });
      let pending: Promise<unknown> | undefined;
      try {
        await store.remember({ text: 'first entry' });
        await store.remember({ text: 'second entry' });
        reindexing = true;
        const reindex = store.reindexAll();
        pending = reindex.catch(() => {});
        await entered.promise;
        store.close();
        release.resolve();
        await expect(reindex).rejects.toThrow('VectorMemoryStore is closed');
        expect(calls).toBe(1);
      } finally {
        release.resolve();
        await pending;
        store.close();
      }
    },
  );

  it.each([false, true])(
    'rechecks liveness after acquiring a queued lock (close=%s)',
    async (close) => {
      const held = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const store = new VectorMemoryStore({
        provider: {
          id: 'queued-reindex',
          dimensions: 2,
          embed: async () => [new Float32Array([1, 0])],
        },
        projectRoot: mkdtempSync(join(tmpdir(), 'wrongstack-queued-reindex-lifecycle-')),
      });
      let blocker: Promise<unknown> | undefined;
      let pending: Promise<unknown> | undefined;
      try {
        await store.remember({ text: 'queued entry' });
        blocker = withFileLock(store.lockPath, async () => {
          held.resolve();
          await release.promise;
        });
        await held.promise;
        const reindex = store.reindexAll();
        pending = reindex.catch(() => {});
        if (close) store.close();
        release.resolve();
        await blocker;
        if (close) await expect(reindex).rejects.toThrow('VectorMemoryStore is closed');
        else await expect(reindex).resolves.toEqual({ processed: 1, errors: 0 });
      } finally {
        release.resolve();
        await Promise.all([blocker, pending]);
        store.close();
      }
    },
  );
});
