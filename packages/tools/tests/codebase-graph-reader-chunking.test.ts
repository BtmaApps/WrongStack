import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Symbol as IndexSymbol } from '../src/codebase-index/schema.js';
import { IndexStore } from '../src/codebase-index/writer.js';

let store: IndexStore;
let tmpDir: string;

const sym = (name: string, file: string, line = 1): IndexSymbol => ({
  id: 0,
  lang: 'ts',
  kind: 'function',
  name,
  file,
  line,
  col: 0,
  signature: `${name}()`,
  docComment: '',
  scope: '',
  text: `${name} function`,
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-graph-chunk-'));
  store = new IndexStore(tmpDir, { indexDir: path.join(tmpDir, '.idx') });
});

afterEach(async () => {
  store.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function idsByName(): Map<string, number> {
  return new Map(store.search('', {}, { limit: 100_000 }).map((s) => [s.name, s.id]));
}

describe('graph readers — bound-variable chunking', () => {
  it('builds a file graph over more files than one SQL statement may bind', () => {
    // 1 200 files exceeds the 900-variable chunk: the old reader bound every
    // path TWICE in one statement.
    const count = 1_200;
    store.insertSymbols(
      Array.from({ length: count }, (_, i) => sym(`chainFn${i}`, `/p/src/f${i}.ts`)),
    );
    const ids = idsByName();
    for (let i = 0; i < count - 1; i++) {
      const fromId = ids.get(`chainFn${i}`) as number;
      store.insertRefs(fromId, [{ fromId, toName: `chainFn${i + 1}`, callType: 'call', line: 2 }]);
    }
    store.resolveRefs();

    const graph = store.getFileGraph('src');
    expect(graph.nodes.filter((n) => n.kind === 'file')).toHaveLength(count);
    expect(graph.edges).toHaveLength(count - 1);
    expect(graph.edges.every((e) => e.weight === 1)).toBe(true);
  });

  it('counts a file-internal ref once in the symbol graph (no UNION ALL double count)', () => {
    store.insertSymbols([sym('outer', '/p/one.ts', 1), sym('inner', '/p/one.ts', 5)]);
    const ids = idsByName();
    const fromId = ids.get('outer') as number;
    store.insertRefs(fromId, [{ fromId, toName: 'inner', callType: 'call', line: 2 }]);
    store.resolveRefs();

    const graph = store.getSymbolGraph('/p/one.ts');
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.weight).toBe(1);
  });
});
