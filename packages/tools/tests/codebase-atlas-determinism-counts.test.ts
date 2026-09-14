import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAtlasBrief } from '../src/codebase-index/atlas-brief.js';
import { buildAtlas } from '../src/codebase-index/atlas-projection.js';
import { IndexStore } from '../src/codebase-index/writer.js';

describe('atlas projection', () => {
  let root: string;
  let indexDir: string;
  let store: IndexStore;
  const abs = (rel: string) => path.join(root, rel);

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-atlas-det-'));
    indexDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-atlas-det-idx-'));
    store = new IndexStore(root, { indexDir });
    const ranks: Record<string, number> = {
      'src/x.ts': 1,
      'src/y.ts': 0.5,
      'lib/z.ts': 0.5,
      'B/one.ts': 0.2,
      'a/two.ts': 0.2,
    };
    for (const rel of Object.keys(ranks)) {
      store.upsertFile({
        file: abs(rel),
        lang: 'ts',
        mtimeMs: 1,
        symbolCount: 0,
        lastIndexed: 1,
        contentHash: rel,
      });
    }
    store.replaceRanks(
      [],
      Object.entries(ranks).map(([rel, rank]) => ({ file: abs(rel), rank, inDeg: 0, outDeg: 0 })),
    );
  });

  afterEach(async () => {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(indexDir, { recursive: true, force: true });
  });

  it('counts files per displayed package and orders ties by code unit', () => {
    const { document } = buildAtlas(store, root);
    expect(document.packages.map((p) => [p.name, p.files])).toEqual([
      ['src', 2],
      ['lib', 1],
      // Equal rank: code-unit order ('B' < 'a'), independent of the host locale.
      ['B', 1],
      ['a', 1],
    ]);
  });

  it('keeps markdown tables intact when a label contains a pipe', () => {
    store.setFilePackages(new Map([[abs('lib/z.ts'), 'x|y']]));
    const { markdown } = buildAtlas(store, root);
    expect(markdown).toContain('| x\\|y | 1 |');
  });

  it('brief counts packages by displayed name', async () => {
    const brief = await buildAtlasBrief(store, root);
    expect(brief.counts.packages).toBe(4);
    expect(brief.packages.find((p) => p.name === 'src')?.files).toBe(2);
  });
});
