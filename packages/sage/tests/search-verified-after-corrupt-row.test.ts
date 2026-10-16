/**
 * `freshness.verifiedAfter` search must tolerate an unrelated corrupt row.
 *
 * The filter used a bare `json_extract(data, '$.lastVerifiedAt')`, which RAISES
 * on malformed JSON, so one corrupt `memories.data` row made every search that
 * sets `verifiedAfter` throw instead of skipping that row (the package-wide
 * "one corrupt row must not hide the whole result" contract).
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

let directory: string;
let store: SqliteSageStore;
let clock = new Date('2026-01-01T00:00:00.000Z');

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-verifiedcorrupt-'));
  clock = new Date('2026-01-01T00:00:00.000Z');
  store = new SqliteSageStore({ projectRoot: directory, now: () => clock });
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

async function seed(): Promise<{ goodId: string; badId: string }> {
  await fs.mkdir(path.join(directory, 'src'), { recursive: true });
  await fs.writeFile(path.join(directory, 'src', 'probe.ts'), 'export const probe = 1;\n');
  const good = await store.rememberSage({
    text: 'verified probe memory alpha',
    kind: 'file_note',
    anchors: [{ type: 'file', path: 'src/probe.ts' }],
  });
  const bad = await store.rememberSage({
    text: 'unrelated memory that will be corrupted',
    kind: 'fact',
  });
  clock = new Date('2026-03-01T00:00:00.000Z');
  await store.verify(good.id);
  return { goodId: good.id, badId: bad.id };
}

describe('unified search with freshness.verifiedAfter and a corrupt row', () => {
  it('returns the verified memory when no row is corrupt (control)', async () => {
    const { goodId } = await seed();
    const result = await store.unifiedSearchService({
      freshness: { verifiedAfter: '2026-02-01T00:00:00.000Z' },
    });
    expect(result.hits.map((hit) => hit.id)).toContain(goodId);
  });

  it('skips the corrupt row instead of throwing (recency path)', async () => {
    const { goodId, badId } = await seed();
    corrupt(badId);
    const result = await store.unifiedSearchService({
      freshness: { verifiedAfter: '2026-02-01T00:00:00.000Z' },
    });
    expect(result.hits.map((hit) => hit.id)).toContain(goodId);
    expect(result.hits.map((hit) => hit.id)).not.toContain(badId);
  });
});
