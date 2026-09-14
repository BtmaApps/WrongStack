import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSymbols } from '../src/codebase-index/ts-parser.js';
import { IndexStore } from '../src/codebase-index/writer.js';

const parse = (content: string) => parseSymbols({ file: '/p/a.ts', content, lang: 'ts' });

describe('ts-parser — non-identifier declaration names', () => {
  it('indexes #private members and keeps the calls inside them', async () => {
    const out = await parse(
      'function helper(): void {}\nexport class Job {\n  #run(): void {\n    helper();\n  }\n}\n',
    );
    expect(out.symbols.map((s) => s.name)).toContain('#run');
    expect(
      out.refs?.some((r) => r.toName === 'helper' && r.callType === 'call' && r.line === 4),
    ).toBe(true);
  });

  it('indexes declarations inside `declare module "x"`', async () => {
    const out = await parse(
      "declare module 'lib' {\n  export interface Options { a: string }\n}\n",
    );
    expect(out.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(['lib', 'Options']));
  });

  it('indexes each destructured binding and the initializer call', async () => {
    const out = await parse('export const { alpha, beta: [gamma] } = makeThing();\n');
    expect(out.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(['alpha', 'gamma']));
    expect(out.refs?.some((r) => r.toName === 'makeThing')).toBe(true);
  });

  it('indexes string-literal method names', async () => {
    const out = await parse(
      "export class K {\n  'kebab-name'(): number {\n    return 1;\n  }\n}\n",
    );
    expect(out.symbols.map((s) => s.name)).toContain('kebab-name');
  });

  it('reads the JSDoc of an exported const from its variable statement', async () => {
    const out = await parse('/** Retry budget in ms. */\nexport const RETRY_MS = 500;\n');
    expect(out.symbols.find((s) => s.name === 'RETRY_MS')?.docComment).toBe('Retry budget in ms.');
  });

  it('still skips members of anonymous containers', async () => {
    const out = await parse('export default class {\n  hidden(): void {}\n}\n');
    expect(out.symbols.map((s) => s.name)).not.toContain('hidden');
  });
});

describe('file vector search — cosine, not raw dot product', () => {
  it('scores unnormalised vectors by direction', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-vec-cos-'));
    const store = new IndexStore(tmp, { indexDir: path.join(tmp, '.idx') });
    try {
      store.upsertFileVectors([
        {
          file: '/p/aligned.ts',
          vector: Float32Array.from([2, 0]),
          sourceHash: 'a',
          provider: 't',
        },
        {
          file: '/p/orthogonal.ts',
          vector: Float32Array.from([0, 3]),
          sourceHash: 'b',
          provider: 't',
        },
      ]);
      // A raw dot product scored the aligned file 10 and let magnitude, not
      // direction, decide the 0.5 floor.
      const hits = store.searchFileVectors(Float32Array.from([5, 0]), 10, 0.5);
      expect(hits).toEqual([{ file: '/p/aligned.ts', score: 1 }]);
    } finally {
      store.close();
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
