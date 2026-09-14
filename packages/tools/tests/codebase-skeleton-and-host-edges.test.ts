import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resetIndexStateForTesting } from '../src/codebase-index/background-indexer.js';
import { IndexCircuitBreaker } from '../src/codebase-index/circuit-breaker.js';
import { codebaseContextTool } from '../src/codebase-index/codebase-context-tool.js';
import { codebaseIndexTool } from '../src/codebase-index/codebase-index-tool.js';
import { extractFileSkeleton } from '../src/codebase-index/index.js';
import { indexStorePool } from '../src/codebase-index/writer.js';

process.env['WRONGSTACK_INDEX_INLINE'] = '1';

const skeleton = async (
  file: string,
  content: string,
  options: Parameters<typeof extractFileSkeleton>[0]['options'] = {},
) => (await extractFileSkeleton({ file, content, options })).skeleton;

describe('skeleton extractor — TS options', () => {
  it('includeDocs: false removes JSDoc blocks', async () => {
    const out = await skeleton(
      'a.ts',
      '/** Adds. */\nexport function add(): number {\n  return 1;\n}\n',
      {
        includeDocs: false,
      },
    );
    expect(out).not.toContain('Adds.');
    expect(out).toContain('export function add(): number');
  });

  it('exportsOnly keeps list-exported declarations and drops private consts with their docs', async () => {
    const code = [
      'function listed(): void {}',
      '/** private helper */',
      'const helper = () => 1;',
      'export const pub = () => 2;',
      'export { listed };',
      '',
    ].join('\n');
    const out = await skeleton('b.ts', code, { exportsOnly: true });
    expect(out).toContain('function listed(): void');
    expect(out).toContain('export const pub');
    expect(out).not.toContain('helper');
  });
});

describe('skeleton extractor — tree-sitter languages', () => {
  it('Python keeps the docstring and still stubs the rest of the body', async () => {
    const out = await skeleton(
      'm.py',
      'def run(x):\n    """Run it."""\n    y = x * 2\n    return y\n',
    );
    expect(out).toContain('"""Run it."""');
    expect(out).toContain('... # L2-L4');
    expect(out).not.toContain('y = x * 2');
  });

  it('exportsOnly drops Python `_private`, Go lower-case and Rust non-pub items', async () => {
    const py = await skeleton('p.py', 'def public():\n    pass\n\ndef _hidden():\n    pass\n', {
      exportsOnly: true,
    });
    expect(py).toContain('def public');
    expect(py).not.toContain('_hidden');

    const go = await skeleton('g.go', 'package p\n\nfunc Public() {}\n\nfunc hidden() {}\n', {
      exportsOnly: true,
    });
    expect(go).toContain('func Public');
    expect(go).not.toContain('hidden');

    const rs = await skeleton('r.rs', 'pub fn open() {}\n\nfn closed() {}\n', {
      exportsOnly: true,
    });
    expect(rs).toContain('pub fn open');
    expect(rs).not.toContain('closed');
  });

  it('strips Java constructor bodies and names C functions correctly', async () => {
    const java = await skeleton(
      'A.java',
      'class A {\n  int x;\n  A(int x) {\n    this.x = x;\n  }\n}\n',
    );
    expect(java).not.toContain('this.x = x');

    const c = await extractFileSkeleton({
      file: 'm.c',
      content: 'int add(int a, int b) {\n    return a + b;\n}\n',
    });
    expect(c.symbols?.map((s) => s.name)).toContain('add');
  });
});

describe('index host — inline mode', () => {
  it('serves codebase-context without a worker (no "unknown index op")', {
    timeout: 120_000,
  }, async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctx-inline-'));
    const indexDir = path.join(tempDir, '.codebase-index');
    resetIndexStateForTesting();
    try {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'calc.ts'),
        'export function addNumbers(a: number, b: number): number { return a + b; }\n',
      );
      const ctx = { projectRoot: tempDir, meta: { codebaseIndexDir: indexDir } } as never;
      const opts = { signal: new AbortController().signal };
      await codebaseIndexTool.execute({ force: true }, ctx, opts);
      const out = await codebaseContextTool.execute({ query: 'addNumbers' }, ctx, opts);
      expect(out.entries.some((e) => e.file.includes('calc.ts'))).toBe(true);
    } finally {
      indexStorePool.evict(tempDir, indexDir);
      resetIndexStateForTesting();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('circuit breaker — abandoned probe', () => {
  it('releases a half-open probe so the next request is admitted', () => {
    let now = 0;
    const cb = new IndexCircuitBreaker({ failureThreshold: 1, cooldownMs: 10, now: () => now });
    cb.recordFailure(new Error('x'));
    now = 20;
    expect(cb.allowRequest()).toBe(true); // half-open probe
    expect(cb.allowRequest()).toBe(false); // probe in flight
    cb.abandonProbe();
    expect(cb.allowRequest()).toBe(true);
  });
});
