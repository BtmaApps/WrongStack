/**
 * One corrupt `memories.data` row must not block writing new memories.
 *
 * `findNearDuplicate` scans the highest-importance rows of the scope (the
 * `importance` column survives JSON corruption) and decoded each with a bare
 * `sqliteRowToMemory`, which throws on malformed JSON. Every other row scanner
 * in the package skips corrupt rows ("one corrupt row must not hide the whole
 * result"); this one made every later `rememberSage` throw instead.
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
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-remembercorrupt-'));
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

describe('rememberSage while another row is corrupt', () => {
  it('stores a new memory when no row is corrupt (control)', async () => {
    await store.rememberSage({
      text: 'The release checklist lives in docs/release.md',
      kind: 'fact',
    });
    const created = await store.rememberSage({
      text: 'Deploys run from the main branch only',
      kind: 'fact',
    });
    expect((await store.getSage(created.id))?.status).toBe('active');
  });

  it('still stores a new memory when an unrelated row has corrupt JSON', async () => {
    const bad = await store.rememberSage({
      text: 'The release checklist lives in docs/release.md',
      kind: 'fact',
    });
    corrupt(bad.id);

    const created = await store.rememberSage({
      text: 'Deploys run from the main branch only',
      kind: 'fact',
    });
    expect((await store.getSage(created.id))?.status).toBe('active');
  });
});
