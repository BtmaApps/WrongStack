/**
 * Writes and related-memory lookups must survive a corrupt sibling row.
 *
 * Covers two surfaces that call SQLite JSON functions, which RAISE on malformed
 * JSON:
 *  - the FTS triggers (`memories_ai/ad/au`) fired by every INSERT/UPDATE/DELETE;
 *  - the shared-tag candidate query in `sqlite-store-related-candidates.ts`
 *    (`json_each(m.tags)`), which reads the `tags` column of every candidate row.
 * The triggers are left in place (not dropped) so the production versions run.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

let directory: string;
let store: SqliteSageStore;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-trigtag-'));
  store = new SqliteSageStore({ projectRoot: directory });
  await store.initialize();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  store.close();
  await fs.rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const rawDb = (): DatabaseSync => (store as unknown as { db: DatabaseSync }).db;

describe('FTS triggers with a corrupt sibling row (production triggers kept)', () => {
  it('stores and updates a memory while a sibling row has invalid JSON data', async () => {
    const sibling = await store.rememberSage({ text: 'Sibling memory about release notes' });
    // Fires memories_au on the sibling itself — the guarded trigger must allow it.
    rawDb().prepare('UPDATE memories SET data = ? WHERE id = ?').run('{broken', sibling.id);

    const created = await store.rememberSage({ text: 'Fresh memory about the deploy pipeline' });
    expect((await store.getSage(created.id))?.status).toBe('active');

    const updated = await store.updateSage(created.id, { text: 'Fresh memory about deploy jobs' });
    expect(updated.text).toBe('Fresh memory about deploy jobs');
  });

  it('can delete a row whose data is invalid JSON', async () => {
    const sibling = await store.rememberSage({ text: 'Sibling memory about release notes' });
    rawDb().prepare('UPDATE memories SET data = ? WHERE id = ?').run('{broken', sibling.id);
    expect(() =>
      rawDb().prepare('DELETE FROM memories WHERE id = ?').run(sibling.id),
    ).not.toThrow();
  });
});

describe('shared-tag related lookup with a corrupt sibling tags column', () => {
  async function seed(): Promise<{ seedId: string; relatedId: string; badId: string }> {
    const seed = await store.rememberSage({ text: 'Seed memory about caching', tags: ['cache'] });
    const related = await store.rememberSage({
      text: 'Related memory about invalidation',
      tags: ['cache'],
    });
    const bad = await store.rememberSage({ text: 'Unrelated memory with bad tags' });
    return { seedId: seed.id, relatedId: related.id, badId: bad.id };
  }

  it('finds the related memory when no tags column is corrupt (control)', async () => {
    const { seedId, relatedId } = await seed();
    const found = await store.findRelatedSage([seedId]);
    expect(found.map((m) => m.id)).toContain(relatedId);
  });

  it('skips a row whose tags column is invalid JSON instead of throwing', async () => {
    const { seedId, relatedId, badId } = await seed();
    rawDb().prepare('UPDATE memories SET tags = ? WHERE id = ?').run('{broken', badId);
    const found = await store.findRelatedSage([seedId]);
    expect(found.map((m) => m.id)).toContain(relatedId);
    expect(found.map((m) => m.id)).not.toContain(badId);
  });
});
