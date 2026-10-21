/**
 * One corrupt `memories.data` row must not block deleting unrelated memories.
 *
 * `cleanReferencingMemories` scans every non-deleted row for references to the
 * memory being deleted. Its SELECT used a bare `json_extract(data, ...)`, which
 * RAISES on malformed JSON, so a single corrupt row made every delete/forget/
 * clear of every other memory throw — the opposite of the package-wide
 * "one corrupt row must not hide the whole result" contract.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

let directory: string;
let store: SqliteSageStore;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-delcorrupt-'));
  store = new SqliteSageStore({ projectRoot: directory });
  await store.initialize();
});

afterEach(async () => {
  store.close();
  await fs.rm(directory, { recursive: true, force: true });
});

function corrupt(id: string): void {
  const db = (store as unknown as { db: DatabaseSync }).db;
  db.exec('DROP TRIGGER IF EXISTS memories_au');
  db.prepare('UPDATE memories SET data = ? WHERE id = ?').run('{broken', id);
}

describe('deleting a memory while another row is corrupt', () => {
  it('deletes a healthy memory when no row is corrupt (control)', async () => {
    const good = await store.rememberSage({
      text: 'Healthy memory about the release checklist',
      kind: 'fact',
    });
    await store.deleteSage(good.id, 'cleanup', { force: true });
    const row = await store.getSage(good.id);
    expect(row?.status).toBe('deleted');
  });

  it('still deletes a healthy memory when an unrelated row has corrupt JSON', async () => {
    const good = await store.rememberSage({
      text: 'Healthy memory about the deploy pipeline',
      kind: 'fact',
    });
    const bad = await store.rememberSage({
      text: 'Memory whose stored row will be corrupted',
      kind: 'fact',
    });
    corrupt(bad.id);

    await store.deleteSage(good.id, 'cleanup', { force: true });
    const row = await store.getSage(good.id);
    expect(row?.status).toBe('deleted');
  });

  it('still deletes when a referencing row is parseable JSON with a broken shape', async () => {
    // json_valid() passes this row into the reference scan; the strict decode
    // then rejects it (missing `text`), which must skip it, not abort.
    const good = await store.rememberSage({ text: 'Healthy memory about staging', kind: 'fact' });
    const bad = await store.rememberSage({ text: 'Memory that loses its text', kind: 'fact' });
    const db = (store as unknown as { db: DatabaseSync }).db;
    db.exec('DROP TRIGGER IF EXISTS memories_au');
    const data = JSON.parse(
      (db.prepare('SELECT data FROM memories WHERE id = ?').get(bad.id) as { data: string }).data,
    ) as Record<string, unknown>;
    delete data['text'];
    data['supersedes'] = ['some-old-id'];
    db.prepare('UPDATE memories SET data = ? WHERE id = ?').run(JSON.stringify(data), bad.id);

    await store.deleteSage(good.id, 'cleanup', { force: true });
    const row = await store.getSage(good.id);
    expect(row?.status).toBe('deleted');
  });
});
