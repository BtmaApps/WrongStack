import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Context } from '@wrongstack/core/agent';
import { describe, expect, it } from 'vitest';
import { runIndexer } from '../src/codebase-index/indexer.js';
import type { Symbol as IndexSymbol } from '../src/codebase-index/schema.js';
import { IndexStore } from '../src/codebase-index/writer.js';
import { StorePool } from '../src/codebase-index/writer-store-pool.js';

const ctx = {} as Context;

async function tempDirs(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const indexDir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}idx-`));
  const cleanup = async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(indexDir, { recursive: true, force: true });
  };
  return { root, indexDir, cleanup };
}

const sym = (name: string, file = '/p/a.ts'): IndexSymbol => ({
  id: 0,
  lang: 'ts',
  kind: 'function',
  name,
  file,
  line: 1,
  col: 0,
  signature: `function ${name}()`,
  docComment: '',
  scope: '',
  text: name,
});

describe('StorePool', () => {
  it('ignores a late release of an evicted handle', () => {
    class FakeStore {
      closed = false;
      close(): void {
        this.closed = true;
      }
    }
    const pool = new StorePool<FakeStore>(() => new FakeStore(), 1);
    const stale = pool.acquire('/p1');
    pool.evict('/p1');
    const fresh = pool.acquire('/p1');
    const other = pool.acquire('/p2');
    // The old handle's release used to drop the fresh entry's refcount to 0,
    // and the trim that follows closed it while it was still checked out.
    pool.release(stale);
    expect(fresh.closed).toBe(false);
    pool.release(other);
    expect(fresh.closed).toBe(false);
  });
});

describe('IndexStore symbol ids', () => {
  it('does not reuse ids when the id counter fell behind the table', async () => {
    const { root, indexDir, cleanup } = await tempDirs('ws-ids-');
    const store = new IndexStore(root, { indexDir });
    try {
      const first = store.insertSymbols([sym('alpha'), sym('beta')]);
      store.setMetadata('next_symbol_id', '1');
      const second = store.insertSymbols([sym('gamma')]);
      const ids = [...first, ...second].map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      store.close();
      await cleanup();
    }
  });
});

describe('IndexStore BM25 fallback corpus', () => {
  it('sees symbols another connection committed', async () => {
    const { root, indexDir, cleanup } = await tempDirs('ws-bm25-');
    const reader = new IndexStore(root, { indexDir });
    const writer = new IndexStore(root, { indexDir });
    try {
      writer.insertSymbols([sym('qxFirst')]);
      // A two-character query bypasses FTS and is scored by the BM25 corpus.
      const before = reader.searchRanked('qx', undefined, 10).results.map((r) => r.name);
      expect(before).toContain('qxFirst');
      writer.insertSymbols([sym('qxSecond', '/p/b.ts')]);
      const after = reader.searchRanked('qx', undefined, 10).results.map((r) => r.name);
      expect(after).toEqual(expect.arrayContaining(['qxFirst', 'qxSecond']));
    } finally {
      reader.close();
      writer.close();
      await cleanup();
    }
  });
});

describe('import resolution after a target is deleted', () => {
  it('clears the edge on a watcher run that only names the deleted file', async () => {
    const { root, indexDir, cleanup } = await tempDirs('ws-dangling-');
    const aPath = path.join(root, 'a.ts');
    const bPath = path.join(root, 'b.ts');
    await fs.writeFile(aPath, "import { b } from './b';\nexport const a = b;\n");
    await fs.writeFile(bPath, 'export const b = 1;\n');

    const importsOf = (): string[] => {
      const store = new IndexStore(root, { indexDir });
      try {
        const aStored = store.getAllFileMetas().find((m) => path.basename(m.file) === 'a.ts')?.file;
        return [...(store.getImportVisibility().get(aStored ?? '') ?? [])].map((f) =>
          path.basename(f),
        );
      } finally {
        store.close();
      }
    };

    try {
      await runIndexer(ctx, { projectRoot: root, indexDir });
      expect(importsOf()).toEqual(['b.ts']);

      await fs.rm(bPath);
      await runIndexer(ctx, { projectRoot: root, indexDir, files: [bPath] });
      expect(importsOf()).toEqual([]);

      // A full run keeps it cleared (unresolvable imports are rewritten as null).
      await runIndexer(ctx, { projectRoot: root, indexDir });
      expect(importsOf()).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});
