import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { removeProjectFixtureDirectory } from '../../core/tests/helpers/project-server-harness.js';
import { SqliteSageStore } from '../src/sqlite-store.js';

/**
 * A passing anchor check confirms a memory; it does not change it.
 *
 * Verification used to route every passing check through
 * `applySemanticChange`, which bumps `revision` and re-dates `updatedAt`. The
 * daemon runs hygiene every 6h, so on the live store 72% of active memories
 * carried the same `updatedAt` (the last hygiene run), the median revision was
 * ~20, and the HQ sync clock had advanced 92k times for 15k records. Retention
 * aging (`lastAccessedAt ?? updatedAt`) never saw a never-injected anchored
 * memory grow old. Real store, real tempdir, production `hygiene()`/`verify()`.
 */

const temps: Array<{ dir: string; store: SqliteSageStore }> = [];

async function newStore(): Promise<{ dir: string; store: SqliteSageStore }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-verify-stamp-'));
  const store = new SqliteSageStore({ projectRoot: dir });
  await store.initialize();
  const entry = { dir, store };
  temps.push(entry);
  return entry;
}

const VERIFY_ONLY = {
  verify: true,
  verifyDepth: 'existence',
  retentionDays: 3650,
  archiveLowConfidenceAfterDays: 3650,
  archiveUnusedAfterDays: 3650,
  unusedMinInjections: 100,
} as const;

afterEach(async () => {
  for (const entry of temps.splice(0)) {
    entry.store.close();
    await removeProjectFixtureDirectory(entry.dir, { maxRetries: 5, retryDelay: 50 });
  }
});

async function anchoredMemory(dir: string, store: SqliteSageStore) {
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  return store.rememberSage({
    text: 'src/a.ts exports the constant a used by the loader',
    kind: 'file_note',
    anchors: [{ type: 'file', path: 'src/a.ts' }],
  });
}

describe('verification stamps without rewriting the memory', () => {
  it('hygiene keeps revision, updatedAt and the HQ clock when the anchor still holds', async () => {
    const { dir, store } = await newStore();
    const memory = await anchoredMemory(dir, store);
    const clock = await store.getHqSyncVersion();

    await store.hygiene(VERIFY_ONLY);
    await store.hygiene(VERIFY_ONLY);

    const after = await store.getSage(memory.id);
    expect(after?.status).toBe('active');
    expect(after?.revision).toBe(memory.revision);
    expect(after?.updatedAt).toBe(memory.updatedAt);
    expect(after?.lastVerifiedAt).toBeTruthy();
    expect(await store.getHqSyncVersion()).toBe(clock);
  });

  it('verify() keeps revision and updatedAt when nothing changed', async () => {
    const { dir, store } = await newStore();
    const memory = await anchoredMemory(dir, store);

    await store.verify(memory.id);

    const after = await store.getSage(memory.id);
    expect(after?.revision).toBe(memory.revision);
    expect(after?.updatedAt).toBe(memory.updatedAt);
    expect(after?.lastVerifiedAt).toBeTruthy();
  });

  it('a failing anchor is still a semantic change that advances revision and HQ', async () => {
    const { dir, store } = await newStore();
    const memory = await anchoredMemory(dir, store);
    const clock = await store.getHqSyncVersion();
    await fs.rm(path.join(dir, 'src', 'a.ts'));

    await store.hygiene(VERIFY_ONLY);

    const after = await store.getSage(memory.id);
    expect(after?.status).toBe('stale');
    expect(after?.revision).toBe(memory.revision + 1);
    expect(await store.getHqSyncVersion()).not.toBe(clock);
  });

  it('verify() and hygiene() do not advance the HQ clock when stamping freshness < 1 back to 1', async () => {
    const { dir, store } = await newStore();
    const memory = await anchoredMemory(dir, store);
    await store.updateSage(memory.id, { freshness: 0.75 });
    const before = (await store.getSage(memory.id))!;
    const clock = await store.getHqSyncVersion();

    await store.verify(memory.id);

    const after = (await store.getSage(memory.id))!;
    expect(after.freshness).toBe(1);
    expect(after.revision).toBe(before.revision);
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(await store.getHqSyncVersion()).toBe(clock);
  });

  it('hygiene contradiction pass re-reads live rows inside runMutation before linking contradictions', async () => {
    const { store } = await newStore();
    const state = store as unknown as {
      runMutation: <T>(work: () => T) => Promise<T>;
      upsertMemory: (m: import('../src/types.js').Sage) => void;
    };
    const older = await store.rememberSage({
      text: 'Automatic schema migration is enabled on startup for the billing service database.',
      kind: 'fact',
      tags: ['billing'],
    });
    const newer = await store.rememberSage({
      text: 'Automatic schema migration is not enabled on startup for the billing service database.',
      kind: 'fact',
      tags: ['billing'],
    });
    const originalRunMutation = state.runMutation.bind(store);
    let mutationStep = 0;
    state.runMutation = (async <T>(work: () => T): Promise<T> => {
      mutationStep++;
      if (mutationStep === 2) {
        const current = (await store.getSage(newer.id))!;
        state.upsertMemory({
          ...current,
          revision: current.revision + 1,
          tags: ['billing', 'concurrent-tag'],
          useCount: 5,
        });
      }
      return originalRunMutation(work);
    }) as never;

    await store.hygiene({ verify: false, nearDedup: false });
    state.runMutation = originalRunMutation;

    const after = await store.getSage(newer.id);
    expect(after?.revision).toBe(newer.revision + 2);
    expect(after?.tags).toContain('concurrent-tag');
    expect(after?.useCount).toBe(5);
    expect(after?.contradicts).toEqual([older.id]);
  });
});
