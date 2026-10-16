/**
 * Re-remembering text whose stored row is corrupt must not throw.
 *
 * `rememberSage` first looks for an exact canonical-text match through the
 * `canonical_text` COLUMN (which survives JSON corruption) and then decoded each
 * matching row with a bare `sqliteRowToMemory` inside `exactRows.find`. When the
 * matching row's `data` was malformed, that threw and the write failed, so the
 * same fact could never be stored again. Every other row scanner skips corrupt
 * rows; this one must too.
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
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-exactcorrupt-'));
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

const TEXT = 'Deploys run from the main branch only';

describe('rememberSage with a corrupt row holding the same canonical text', () => {
  it('merges into the stored memory when it is healthy (control)', async () => {
    const first = await store.rememberSage({ text: TEXT, kind: 'fact' });
    const again = await store.rememberSage({ text: TEXT, kind: 'fact' });
    expect(again.id).toBe(first.id);
  });

  it('stores the fact again instead of throwing when the matching row is corrupt', async () => {
    const first = await store.rememberSage({ text: TEXT, kind: 'fact' });
    corrupt(first.id);

    const again = await store.rememberSage({ text: TEXT, kind: 'fact' });
    expect(again.id).not.toBe(first.id);
    expect((await store.getSage(again.id))?.status).toBe('active');
  });
});
