import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

let directory: string;
let store: SqliteSageStore;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wrongstack-sage-graphfor-'));
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

describe('graphFor with a corrupt start memory row', () => {
  it('returns the graph for a healthy memory (control)', async () => {
    const good = await store.rememberSage({
      text: 'Healthy memory about the build script',
      kind: 'fact',
      anchors: [{ type: 'file', path: 'src/build.ts' }],
    });
    const edges = await store.graphFor(good.id);
    expect(edges.some((e) => e.to === 'file:src/build.ts')).toBe(true);
  });

  it('skips the corrupt row instead of throwing and still returns stored edges', async () => {
    const bad = await store.rememberSage({
      text: 'Memory whose row will be corrupted',
      kind: 'fact',
      anchors: [{ type: 'file', path: 'src/corrupt.ts' }],
    });
    corrupt(bad.id);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const edges = await store.graphFor(bad.id);
    expect(edges.some((e) => e.from === `mem:${bad.id}` && e.to === 'file:src/corrupt.ts')).toBe(
      true,
    );
  });

  it('still expands anchors of healthy memories reached by the same query', async () => {
    const good = await store.rememberSage({
      text: 'Healthy memory about the deploy script',
      kind: 'fact',
      anchors: [{ type: 'file', path: 'src/deploy.ts' }],
    });
    const bad = await store.rememberSage({
      text: 'Another memory whose row will be corrupted',
      kind: 'fact',
      anchors: [{ type: 'file', path: 'src/other.ts' }],
    });
    corrupt(bad.id);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(store.graphFor(`mem:${bad.id}`)).resolves.toEqual(expect.any(Array));
    const edges = await store.graphFor(good.id);
    expect(edges.some((e) => e.to === 'file:src/deploy.ts')).toBe(true);
  });
});
