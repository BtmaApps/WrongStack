/**
 * Applying a remote HQ record over a corrupt local row, and deleting one, must
 * not throw. Covers `applySageHqSync` (upsert + delete branches) with the
 * production FTS and HQ triggers left in place.
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
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-hqcorrupt-'));
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

function remote(
  id: string,
  text: string,
  revision: number,
): Parameters<SqliteSageStore['applyHqSync']>[0][number] {
  return {
    id,
    revision,
    changeId: 'a'.repeat(32),
    memory: {
      id,
      scope: 'project',
      kind: 'fact',
      status: 'active',
      text,
      importance: 0.7,
      confidence: 0.8,
      freshness: 1,
      revision: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      tags: [],
      anchors: [],
      sources: [],
    },
  };
}

describe('HQ sync apply with a corrupt local row', () => {
  it('applies a remote record over a healthy local row (control)', async () => {
    const local = await store.rememberSage({ text: 'Local memory about releases' });
    await store.applyHqSync([remote(local.id, 'Remote memory about releases', 50)]);
    expect((await store.getSage(local.id))?.text).toBe('Remote memory about releases');
  });

  it('applies a remote record over a corrupt local row', async () => {
    const local = await store.rememberSage({ text: 'Local memory about releases' });
    rawDb().prepare('UPDATE memories SET data = ? WHERE id = ?').run('{broken', local.id);
    await store.applyHqSync([remote(local.id, 'Remote memory about releases', 50)]);
    expect((await store.getSage(local.id))?.text).toBe('Remote memory about releases');
  });

  it('applies a remote delete over a corrupt local row', async () => {
    const local = await store.rememberSage({ text: 'Local memory about releases' });
    rawDb().prepare('UPDATE memories SET data = ? WHERE id = ?').run('{broken', local.id);
    await store.applyHqSync([
      { id: local.id, revision: 50, changeId: 'b'.repeat(32), memory: null },
    ]);
    expect(await store.getSage(local.id)).toBeNull();
  });
});
