import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';
import type { Sage } from '../src/types.js';

/**
 * Anchorless `file_note`s written before structural kinds required an anchor
 * could not change status at all: `updateSage` re-checked the anchor rule on
 * every update, so a review resolution (archive/delete) on one threw and the
 * candidate reverted to pending. The live store had 119 such active notes;
 * 88 resolutions reverted in one Review-tab session.
 */
describe('lifecycle of legacy anchorless structural memories', () => {
  let tmpDir: string;
  let store: SqliteSageStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-legacy-anchorless-'));
    store = new SqliteSageStore({ projectRoot: tmpDir });
    await store.initialize();
  });

  afterEach(async () => {
    store.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function legacyFileNote(): Promise<Sage> {
    const seed = await store.rememberSage({
      text: 'The loader reads its retry budget from the gateway profile.',
      kind: 'fact',
    });
    // Rewrite it as the pre-rule shape: a file_note without anchors.
    const internals = store as unknown as {
      runMutation: <T>(work: () => T) => Promise<T>;
      upsertMemory: (memory: Sage) => void;
    };
    const legacy = { ...seed, kind: 'file_note' as const, anchors: [] };
    await internals.runMutation(() => internals.upsertMemory(legacy));
    return legacy;
  }

  it('resolves a review proposal that archives one', async () => {
    const legacy = await legacyFileNote();
    const proposal = await store.createCandidate({
      text: legacy.text,
      kind: 'memory_review',
      targetMemoryId: legacy.id,
      suggestedAction: 'archive',
      reviewReason: 'injected_never_used',
    });

    const resolution = await store.resolveCandidate(proposal.id, 'archive');

    expect(resolution?.applied).toBe(true);
    expect((await store.getSage(legacy.id))?.status).toBe('archived');
  });

  it('still refuses to set a structural kind or empty anchors without an anchor', async () => {
    const legacy = await legacyFileNote();
    await expect(store.updateSage(legacy.id, { anchors: [] })).rejects.toThrow(
      /requires at least one anchor/,
    );
    const fact = await store.rememberSage({
      text: 'Retries back off exponentially.',
      kind: 'fact',
    });
    await expect(store.updateSage(fact.id, { kind: 'file_note' })).rejects.toThrow(
      /requires at least one anchor/,
    );
  });
});
