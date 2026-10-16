/**
 * Replacing a memory row whose stored JSON is corrupt must not throw.
 *
 * The FTS maintenance triggers (`memories_au`, `memories_ad`) call bare
 * `json_extract(old.data, '$.text')`, which RAISES on malformed JSON. A corrupt
 * row therefore made any UPDATE/DELETE of that row fail inside SQLite, so the
 * legacy JSONL replay (which upserts a valid record over it) aborted
 * `initialize()` — the store could not open. `initSchema` recreates these
 * triggers on every open, so the failure persists across restarts.
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
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-triggercorrupt-'));
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

/** Corrupt a row, then let the next open() recreate the triggers like production. */
function corruptWithoutTrigger(s: SqliteSageStore, id: string): void {
  const db = (s as unknown as { db: DatabaseSync }).db;
  db.exec('DROP TRIGGER IF EXISTS memories_au');
  db.prepare('UPDATE memories SET data = ? WHERE id = ?').run('{broken', id);
}

async function writeMemoriesJsonl(id: string, text: string): Promise<void> {
  const file = path.join(directory, '.wrongstack', 'memories', 'memories.jsonl');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const record = {
    recordType: 'memory',
    schemaVersion: 1,
    op: 'update',
    memory: {
      id,
      revision: 5,
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
      updatedAt: '2030-01-01T00:00:00.000Z',
    },
  };
  await fs.writeFile(file, `${JSON.stringify(record)}\n`);
}

describe('legacy JSONL replay over a memory row with corrupt JSON', () => {
  it('replays over a healthy stored row (control)', async () => {
    const first = open();
    const existing = await first.rememberSage({ text: 'Stored memory about the build cache' });
    first.close();
    await writeMemoriesJsonl(existing.id, 'Replayed memory about the build cache');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const second = open();
    await second.initialize();
    expect((await second.getSage(existing.id))?.text).toBe('Replayed memory about the build cache');
  });

  it('opens the store and restores the row from the replayed record', async () => {
    const first = open();
    const existing = await first.rememberSage({ text: 'Stored memory about the build cache' });
    corruptWithoutTrigger(first, existing.id);
    first.close();
    await writeMemoriesJsonl(existing.id, 'Replayed memory about the build cache');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const second = open();
    await second.initialize();
    expect((await second.getSage(existing.id))?.text).toBe('Replayed memory about the build cache');
    // The full-text index must stay usable and find the restored row.
    const hits = await second.searchSage('replayed build cache');
    expect(hits.map((m) => m.id)).toContain(existing.id);
  });
});
