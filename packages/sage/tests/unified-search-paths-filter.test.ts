import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteSageStore } from '../src/sqlite-store.js';

/**
 * Regression: `unifiedSearchService({ paths })` must never silently drop the
 * path filter.
 *
 * `buildPathExistsClause` used to return `undefined` — meaning "no path filter
 * requested" — when `query.paths` was non-empty but no entry resolved inside
 * the project root. The caller's restriction then vanished and the UNFILTERED
 * corpus came back. Nothing can match such a path: `normalizeAnchors` refuses
 * to store an anchor that escapes the root, and the sibling
 * `retrieveSqliteSageForPath` returns `[]` for the same input.
 */
describe('unifiedSearch paths filter', () => {
  const stores: SqliteSageStore[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(stores.splice(0).map((store) => store.close()));
    await Promise.all(
      directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
    );
  });

  async function createStore(): Promise<SqliteSageStore> {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-paths-filter-'));
    directories.push(projectRoot);
    const store = new SqliteSageStore({ projectRoot });
    stores.push(store);
    await store.initialize();
    return store;
  }

  const OUTSIDE = '../outside-project/file.ts';

  it('returns nothing for a paths filter that cannot resolve inside the root', async () => {
    const store = await createStore();
    const anchored = await store.rememberSage({
      text: 'Memory anchored to the in-project source file.',
      kind: 'file_note',
      scope: 'file',
      anchors: [{ type: 'file', path: 'src/inside.ts' }],
    });
    await store.rememberSage({
      text: 'Unrelated memory about the deploy pipeline and its rollback order.',
      kind: 'fact',
    });

    // The filter is unsatisfiable: such an anchor cannot even be stored.
    await expect(
      store.rememberSage({
        text: 'Outside anchor must be refused at write time.',
        anchors: [{ type: 'file', path: OUTSIDE }],
      }),
    ).rejects.toThrow(/inside the project root/i);

    // Non-FTS branch (no text) and FTS branch (text present) must both honor it.
    const noText = await store.unifiedSearchService({ paths: [OUTSIDE] });
    expect(noText.hits).toEqual([]);
    expect(noText.totalCandidates).toBe(0);

    const withText = await store.unifiedSearchService({ text: 'deploy', paths: [OUTSIDE] });
    expect(withText.hits).toEqual([]);
    expect(withText.totalCandidates).toBe(0);

    // Control: a resolvable path still filters normally.
    const inside = await store.unifiedSearchService({ paths: ['src/inside.ts'] });
    expect(inside.hits.map((hit) => hit.id)).toEqual([anchored.id]);
  });

  it('keeps filtering by the resolvable half of a mixed paths list', async () => {
    const store = await createStore();
    const anchored = await store.rememberSage({
      text: 'Memory anchored to the in-project source file.',
      kind: 'file_note',
      scope: 'file',
      anchors: [{ type: 'file', path: 'src/inside.ts' }],
    });
    await store.rememberSage({
      text: 'Unrelated memory about the deploy pipeline and its rollback order.',
      kind: 'fact',
    });

    const mixed = await store.unifiedSearchService({ paths: [OUTSIDE, 'src/inside.ts'] });

    expect(mixed.hits.map((hit) => hit.id)).toEqual([anchored.id]);
  });

  it('still treats an omitted or empty paths list as "no path filter"', async () => {
    const store = await createStore();
    await store.rememberSage({
      text: 'Memory anchored to the in-project source file.',
      kind: 'file_note',
      scope: 'file',
      anchors: [{ type: 'file', path: 'src/inside.ts' }],
    });
    await store.rememberSage({
      text: 'Unrelated memory about the deploy pipeline and its rollback order.',
      kind: 'fact',
    });

    expect((await store.unifiedSearchService({})).hits).toHaveLength(2);
    expect((await store.unifiedSearchService({ paths: [] })).hits).toHaveLength(2);
  });
});
