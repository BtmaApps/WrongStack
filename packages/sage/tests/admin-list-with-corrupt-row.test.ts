/**
 * Admin read paths must tolerate an unrelated corrupt `memories.data` row.
 *
 * `findMemoriesForFile`, `recoverSage` and `backfillRecoverable` all scan the
 * whole table through the admin `listMemories`, which decoded every row with a
 * bare `sqliteRowToMemory`. One malformed row therefore made each of them throw
 * instead of skipping it, contradicting the package-wide "one corrupt row must
 * not hide the whole result" contract (see `sqliteRowsToMemories`).
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
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-admincorrupt-'));
  store = new SqliteSageStore({ projectRoot: directory });
  await store.initialize();
});

afterEach(async () => {
  store.close();
  await fs.rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function corrupt(id: string): void {
  const db = (store as unknown as { db: DatabaseSync }).db;
  db.exec('DROP TRIGGER IF EXISTS memories_au');
  db.prepare('UPDATE memories SET data = ? WHERE id = ?').run('{broken', id);
}

async function seed(): Promise<{ goodId: string; badId: string }> {
  await fs.mkdir(path.join(directory, 'src'), { recursive: true });
  await fs.writeFile(path.join(directory, 'src', 'probe.ts'), 'export const probe = 1;\n');
  const good = await store.rememberSage({
    text: 'Probe module exports a constant used by the build',
    kind: 'file_note',
    anchors: [{ type: 'file', path: 'src/probe.ts' }],
  });
  const bad = await store.rememberSage({
    text: 'Unrelated convention about commit message style',
    kind: 'convention',
  });
  return { goodId: good.id, badId: bad.id };
}

describe('findMemoriesForFile with a corrupt row elsewhere in the table', () => {
  it('returns the anchored memory when no row is corrupt (control)', async () => {
    const { goodId } = await seed();
    const res = await store.findMemoriesForFile('src/probe.ts');
    expect(res.primaryMatches.map((m) => m.memory.id)).toContain(goodId);
  });

  it('skips the corrupt row instead of throwing', async () => {
    const { goodId, badId } = await seed();
    corrupt(badId);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await store.findMemoriesForFile('src/probe.ts');
    expect(res.primaryMatches.map((m) => m.memory.id)).toContain(goodId);
  });
});
