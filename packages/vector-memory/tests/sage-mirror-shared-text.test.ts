/**
 * Regression: SAGE dedups on (scope, canonical text, audience), so the same
 * wording can be two SAGE memories (e.g. a project and a user memory). Both
 * mirror into vector scope 'project', and the store deduped on the text hash
 * alone: the second memory's mirror returned the FIRST memory's row, so it had
 * no vector row of its own, and deleting the first memory erased the only row.
 * A mirror write whose text slot belongs to another memory now gets its own
 * row under a sageId-keyed hash; plain rows and the UNIQUE index are unchanged.
 */
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SageSyncSource, VectorMemoryStore } from '../src/index.js';
import { FakeEmbeddingProvider } from './fake-provider.js';

const TEXT = 'Always run pnpm install before running the test suite';

describe('SAGE mirrors that share text', () => {
  let store: VectorMemoryStore;

  beforeEach(() => {
    store = new VectorMemoryStore({
      provider: new FakeEmbeddingProvider({ dimensions: 32 }),
      projectRoot: path.join(
        os.tmpdir(),
        `wrongstack-vm-shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ),
    });
  });
  afterEach(() => store.close());

  const mirror = (sageId: string) =>
    store.remember({ text: TEXT, scope: 'project', metadata: { source: 'sage', sageId } });

  it('gives each SAGE memory its own row, so deleting one keeps the other searchable', async () => {
    const a = await mirror('sage-A');
    const b = await mirror('sage-B');
    expect(b.id).not.toBe(a.id);
    expect(store.findBySageId('sage-B')?.id).toBe(b.id);

    await store.forget(a.id);
    const hits = await store.search(TEXT, { limit: 5 });
    expect(hits.map((hit) => hit.entry.metadata?.['sageId'])).toEqual(['sage-B']);
  });

  it('keeps plain-row dedup and mirror idempotency', async () => {
    const plain = await store.remember({ text: TEXT });
    const first = await mirror('sage-A');
    const second = await mirror('sage-A');
    expect(first.id).not.toBe(plain.id);
    expect(second.id).toBe(first.id);
    expect((await store.remember({ text: TEXT })).id).toBe(plain.id);
    expect(plain.contentHash).toBe(VectorMemoryStore.contentHash(TEXT));
    expect(store.stats().entries).toBe(2);
  });

  it('syncFromSage indexes a memory whose text is already mirrored for another id', async () => {
    await mirror('sage-A'); // what the old dedup left behind: B collapsed into A
    const source: SageSyncSource = {
      listActiveMemories: async () => [
        { id: 'sage-A', text: TEXT },
        { id: 'sage-B', text: TEXT },
      ],
    };
    expect(await store.syncFromSage(source)).toMatchObject({ indexed: 1, skipped: 1, failed: 0 });
    expect(store.findBySageId('sage-B')).toBeDefined();
    expect(await store.syncFromSage(source)).toMatchObject({ indexed: 0, skipped: 2, failed: 0 });
  });
});
