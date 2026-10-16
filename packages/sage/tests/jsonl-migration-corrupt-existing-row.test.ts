/**
 * The legacy JSONL replay must survive a corrupt row already in SQLite.
 *
 * `migrateSqliteLegacyJsonl` compares each replayed memory / candidate with the
 * row already stored under the same id by decoding it with a bare
 * `readSqliteSageRow` / `sqliteRowToCandidate`. A stored row whose JSON is
 * malformed threw inside the migration transaction, rolled it back and made
 * `initialize()` reject — the store could not open, and the migration marker
 * was never written so every later boot failed the same way.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

let directory: string;
let stores: SqliteSageStore[];

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-jsonlcorrupt-'));
  stores = [];
});

afterEach(async () => {
  for (const s of stores) s.close();
  await fs.rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function open(): SqliteSageStore {
  const s = new SqliteSageStore({ projectRoot: directory });
  stores.push(s);
  return s;
}

async function writeJsonl(relative: string, rows: object[]): Promise<void> {
  const file = path.join(directory, '.wrongstack', 'memories', relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

function memoryRecord(id: string, text: string): object {
  return {
    recordType: 'memory',
    schemaVersion: 1,
    op: 'update',
    memory: {
      id,
      revision: 1,
      status: 'active',
      kind: 'fact',
      scope: 'project',
      text,
      importance: 0.8,
      confidence: 0.8,
      freshness: 1,
      tags: [],
      anchors: [],
      sources: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

function corruptRow(s: SqliteSageStore, table: 'memories' | 'candidates', id: string): void {
  const db = (s as unknown as { db: DatabaseSync }).db;
  db.exec('DROP TRIGGER IF EXISTS memories_au');
  db.prepare(`UPDATE ${table} SET data = ? WHERE id = ?`).run('{broken', id);
}

describe('legacy JSONL migration with a corrupt row already in SQLite', () => {
  it('migrates cleanly when the stored row is healthy (control)', async () => {
    const first = open();
    const existing = await first.rememberSage({ text: 'Existing sqlite memory about builds' });
    first.close();

    await writeJsonl('memories.jsonl', [memoryRecord(existing.id, 'Replayed memory about builds')]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const second = open();
    await second.initialize();
    expect((await second.getSage(existing.id))?.status).toBe('active');
  });

  it('still opens the store when the stored candidate row for a replayed id is corrupt', async () => {
    const first = open();
    const existing = await first.createCandidate({ text: 'SQLite candidate about builds' });
    corruptRow(first, 'candidates', existing.id);
    first.close();

    await writeJsonl('candidates.jsonl', [
      {
        ...existing,
        text: 'Replayed candidate about builds',
        updatedAt: '2000-01-01T00:00:00.000Z',
      },
    ]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const second = open();
    await second.initialize();
    const db = (second as unknown as { db: DatabaseSync }).db;
    const row = db.prepare('SELECT data FROM candidates WHERE id = ?').get(existing.id) as {
      data: string;
    };
    expect(JSON.parse(row.data).text).toBe('Replayed candidate about builds');
  });
});
