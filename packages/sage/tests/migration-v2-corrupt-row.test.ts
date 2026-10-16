/**
 * Upgrading a v1 database must survive one corrupt `memories.data` row.
 *
 * `migrateSchemaV2` backfills `canonical_text` by decoding every row with a
 * bare `sqliteRowToMemory`. A single malformed row threw inside the migration
 * transaction, rolled it back, and made `initialize()` reject — so the store
 * could not open at all. The v3 migration right after it already skips corrupt
 * rows ("Skip corrupt rows"); v2 must do the same.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { loadRuntimeDatabaseSync } from '@wrongstack/persistence';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

const DatabaseSync = loadRuntimeDatabaseSync();

let directory: string;
let store: SqliteSageStore | undefined;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-v2corrupt-'));
  store = undefined;
});

afterEach(async () => {
  store?.close();
  await fs.rm(directory, { recursive: true, force: true });
});

function memoryJson(id: string, text: string): string {
  return JSON.stringify({
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
  });
}

async function seedV1(rows: Array<{ id: string; data: string }>): Promise<void> {
  const root = path.join(directory, '.wrongstack', 'memories');
  await fs.mkdir(root, { recursive: true });
  const db = new DatabaseSync(path.join(root, 'sage.db'));
  db.exec(`
    CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    INSERT INTO schema_meta (key, value) VALUES ('version', 1);
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      status TEXT NOT NULL,
      kind TEXT NOT NULL,
      scope TEXT NOT NULL,
      importance REAL NOT NULL,
      confidence REAL NOT NULL,
      freshness REAL NOT NULL,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      audience TEXT,
      tags TEXT
    );
  `);
  const insert = db.prepare(
    `INSERT INTO memories
      (id, data, status, kind, scope, importance, confidence, freshness,
       updated_at, created_at, audience, tags)
     VALUES (?, ?, 'active', 'fact', 'project', 0.8, 0.8, 1, ?, ?, NULL, '[]')`,
  );
  for (const row of rows) {
    insert.run(row.id, row.data, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  }
  db.exec(`
    CREATE VIRTUAL TABLE memories_fts USING fts5(
      text, tags, audience, content='memories', content_rowid='rowid'
    );
  `);
  db.close();
}

function canonicalOf(s: SqliteSageStore, id: string): string {
  const db = (s as unknown as { db: DatabaseSyncType }).db;
  return (
    db.prepare('SELECT canonical_text AS value FROM memories WHERE id = ?').get(id) as {
      value: string;
    }
  ).value;
}

describe('v1 → current migration with a corrupt row', () => {
  it('backfills canonical text for healthy rows when nothing is corrupt (control)', async () => {
    await seedV1([{ id: 'good', data: memoryJson('good', '  Canonical   Good ') }]);
    store = new SqliteSageStore({ projectRoot: directory });
    await store.initialize();
    expect(canonicalOf(store, 'good')).toBe('canonical good');
  });

  it('still opens the store and backfills healthy rows when one row is corrupt', async () => {
    await seedV1([
      { id: 'good', data: memoryJson('good', '  Canonical   Good ') },
      { id: 'bad', data: '{broken' },
    ]);
    store = new SqliteSageStore({ projectRoot: directory });
    await store.initialize();
    expect(canonicalOf(store, 'good')).toBe('canonical good');
    expect((await store.getSage('good'))?.status).toBe('active');
  });
});
