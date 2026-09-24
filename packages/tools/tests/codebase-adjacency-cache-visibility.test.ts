import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearWiringSnapshot,
  getWiringSnapshot,
  prewarmWiringSnapshot,
  wiringSnapshotLastUsedAt,
} from '../src/codebase-index/graph-adjacency-cache.js';
import type { Symbol as IndexSymbol } from '../src/codebase-index/schema.js';
import { IndexStore } from '../src/codebase-index/writer.js';

const goSymbol = (name: string, file: string): IndexSymbol => ({
  id: 0,
  lang: 'go',
  kind: 'function',
  name,
  file,
  line: 1,
  col: 0,
  signature: `func ${name}()`,
  docComment: '',
  scope: '',
  text: name,
});

describe('wiring snapshot for personalised retrieval', () => {
  afterEach(() => clearWiringSnapshot());

  it('weights same-package Go references like the index-time rank pass', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-adjacency-'));
    const indexDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-adjacency-idx-'));
    const store = new IndexStore(root, { indexDir });
    try {
      const [caller, callee] = store.insertSymbols([
        goSymbol('Run', '/r/pkg/a.go'),
        goSymbol('Helper', '/r/pkg/b.go'),
        goSymbol('Util', '/r/lib/x.go'),
      ]);
      store.insertRefsBatch([
        {
          fromId: caller!.id,
          toName: 'Helper',
          toId: callee!.id,
          callType: 'call',
          line: 2,
          lang: 'go',
        },
        // a.go has resolved imports — of another package, not of b.go.
        {
          fromId: caller!.id,
          toName: 'lib',
          callType: 'import',
          line: 1,
          lang: 'go',
          module: 'example.com/lib',
          toFile: '/r/lib/x.go',
        },
      ]);

      const { graph } = getWiringSnapshot(store, root, indexDir);
      expect(graph.size).toBe(2);
      expect(Math.min(...graph.weights)).toBe(1);
    } finally {
      store.close();
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(indexDir, { recursive: true, force: true });
    }
  });

  it('prebuilds the graph for the next query without counting as a use', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-adjacency-'));
    const indexDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-adjacency-idx-'));
    const store = new IndexStore(root, { indexDir });
    try {
      store.insertSymbols([goSymbol('Run', '/r/pkg/a.go'), goSymbol('Helper', '/r/pkg/b.go')]);

      // Nobody has queried: the server's recency gate reads 0 and skips.
      expect(prewarmWiringSnapshot(store, root, indexDir)).toBe(true);
      expect(wiringSnapshotLastUsedAt()).toBe(0);
      // Already current: nothing to rebuild.
      expect(prewarmWiringSnapshot(store, root, indexDir)).toBe(false);

      const before = getWiringSnapshot(store, root, indexDir);
      expect(wiringSnapshotLastUsedAt()).toBeGreaterThan(0);
      // The query is served from the prebuilt graph, not a rebuild.
      expect(getWiringSnapshot(store, root, indexDir).graph).toBe(before.graph);
    } finally {
      store.close();
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(indexDir, { recursive: true, force: true });
    }
  });
});
