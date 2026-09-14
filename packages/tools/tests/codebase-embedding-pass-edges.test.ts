import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type EmbeddingPort, embedFiles } from '../src/codebase-index/embedding-pass.js';
import { IndexStore } from '../src/codebase-index/writer.js';

describe('embedding pass', () => {
  let root: string;
  let indexDir: string;
  let store: IndexStore;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-embed-edges-'));
    indexDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-embed-edges-idx-'));
    store = new IndexStore(root, { indexDir });
    for (const name of ['a.ts', 'b.ts']) {
      store.upsertFile({
        file: path.join(root, name),
        lang: 'ts',
        mtimeMs: 1,
        symbolCount: 0,
        lastIndexed: 1,
        contentHash: name,
      });
    }
  });

  afterEach(async () => {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(indexDir, { recursive: true, force: true });
  });

  const port = (vectorFor: (text: string) => Float32Array): EmbeddingPort => ({
    id: 'test-model',
    dimensions: 2,
    embed: async (texts) => texts.map(vectorFor),
  });
  const relativeOf = (file: string) => path.basename(file);

  it('honours maxFiles 0 and survives a non-finite batch size', async () => {
    const good = port(() => Float32Array.from([1, 0]));
    expect((await embedFiles(store, good, relativeOf, { maxFiles: 0 })).embedded).toBe(0);
    expect((await embedFiles(store, good, relativeOf, { batchSize: Number.NaN })).embedded).toBe(2);
  });

  it('drops non-finite vectors and reports them', async () => {
    const result = await embedFiles(
      store,
      port((text) => Float32Array.from(text.startsWith('a.ts') ? [Number.NaN, 1] : [0, 1])),
      relativeOf,
    );
    expect(result.embedded).toBe(1);
    expect(result.errors.join('\n')).toMatch(/dropped 1 vector/);
    expect(store.countFileVectors()).toBe(1);
  });
});
