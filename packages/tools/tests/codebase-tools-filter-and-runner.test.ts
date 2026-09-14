/**
 * File-scoped call-graph queries, prefix-scoped context and the targeted-test
 * runner choice — each measured on a real index or a real project layout.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codebaseContextTool } from '../src/codebase-index/codebase-context-tool.js';
import { codebaseImpactAnalysisTool } from '../src/codebase-index/codebase-impact-analysis-tool.js';
import { codebaseIncomingCallsTool } from '../src/codebase-index/codebase-incoming-calls-tool.js';
import {
  codebaseTargetedTestTool,
  selectTestRunner,
} from '../src/codebase-index/codebase-targeted-test-tool.js';
import { runIndexer } from '../src/codebase-index/indexer.js';
import { indexStorePool } from '../src/codebase-index/writer.js';

const SOURCES: Record<string, string> = {
  'src/a.ts':
    "import { helper } from './b';\nexport function main(): number {\n  return helper(1);\n}\n",
  'src/b.ts': 'export function helper(v: number): number {\n  return v;\n}\n',
  'src/sub/other.ts': 'export class Other {\n  helper(): number {\n    return 2;\n  }\n}\n',
  'src/top.ts':
    "import { main } from './a';\nexport function top(): number {\n  return main();\n}\n",
};

describe('file-scoped queries on a real index', () => {
  let root: string;
  let indexDir: string;
  let previousInline: string | undefined;
  const ctx = () =>
    ({ projectRoot: root, cwd: root, meta: { codebaseIndexDir: indexDir } }) as never;
  const names = (calls: Array<{ symbol: { name: string } }>) =>
    [...new Set(calls.map((c) => c.symbol.name))].sort();

  beforeAll(async () => {
    previousInline = process.env['WRONGSTACK_INDEX_INLINE'];
    process.env['WRONGSTACK_INDEX_INLINE'] = '1';
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-filter-'));
    indexDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-filter-idx-'));
    for (const [rel, text] of Object.entries(SOURCES)) {
      await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await fs.writeFile(path.join(root, rel), text);
    }
    expect((await runIndexer({} as never, { projectRoot: root, indexDir })).errors).toEqual([]);
  });

  afterAll(async () => {
    if (previousInline === undefined) delete process.env['WRONGSTACK_INDEX_INLINE'];
    else process.env['WRONGSTACK_INDEX_INLINE'] = previousInline;
    indexStorePool.evict(root, indexDir);
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(indexDir, { recursive: true, force: true });
  });

  it('does not borrow callers bound to a same-named symbol in another file', async () => {
    for (const transitive of [false, true]) {
      const other = await codebaseIncomingCallsTool.execute(
        { symbol: 'helper', file: 'src/sub/other.ts', transitive },
        ctx(),
        {} as never,
      );
      expect(names(other.calls), `transitive=${transitive}`).toEqual([]);

      const real = await codebaseIncomingCallsTool.execute(
        { symbol: 'helper', file: 'src/b.ts', transitive },
        ctx(),
        {} as never,
      );
      expect(names(real.calls), `transitive=${transitive}`).toEqual(
        transitive ? ['main', 'top'] : ['main'],
      );
    }

    const impact = await codebaseImpactAnalysisTool.execute(
      { symbol: 'helper', file: 'src/sub/other.ts' },
      ctx(),
      {} as never,
    );
    expect(impact.totalCallSites).toBe(0);
  });

  it('counts only direct callers as call sites to update in impact analysis', async () => {
    const impact = await codebaseImpactAnalysisTool.execute(
      { symbol: 'helper', file: 'src/b.ts' },
      ctx(),
      {} as never,
    );
    expect(impact.totalCallSites).toBe(1);
    expect(impact.riskLevel).toBe('low');
    expect(impact.callSites.find((site) => site.callerName === 'main')?.indirect).toBeUndefined();
    expect(impact.callSites.find((site) => site.callerName === 'top')?.indirect).toBe(true);
    expect(impact.summary).not.toMatch(/Only the first/);
    expect(impact.recommendedActionPlan).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^Update 1 call site\(s\) across 1 production file\(s\): src\/a\.ts$/,
        ),
        expect.stringMatching(/^Re-verify 1 production file\(s\).*src\/top\.ts$/),
      ]),
    );
  });

  it('keeps a lexical hit nothing resolves to, inside a path prefix', async () => {
    const out = await codebaseContextTool.execute(
      { query: 'helper', pathPrefix: 'src/sub' },
      ctx(),
      {} as never,
    );
    expect(out.entries.map((e) => e.file)).toEqual(['src/sub/other.ts']);
  });
});

describe('selectTestRunner', () => {
  let root: string;
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-runner-'));
  });
  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('runs go suites by package, not by file', async () => {
    await expect(
      selectTestRunner(root, ['pkg/a_test.go', 'pkg/b_test.go', 'root_test.go']),
    ).resolves.toEqual({ cmd: 'go', args: ['test', './pkg', '.'] });
  });

  it('uses jest when the project depends on jest and not vitest', async () => {
    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ devDependencies: { jest: '^29.0.0' } }),
    );
    await expect(selectTestRunner(root, ['src/a.test.ts'])).resolves.toEqual({
      cmd: 'npx',
      args: ['jest', 'src/a.test.ts'],
    });
    await fs.rm(path.join(root, 'package.json'));
    await expect(selectTestRunner(root, ['src/a.test.ts'])).resolves.toEqual({
      cmd: 'npx',
      args: ['vitest', 'run', 'src/a.test.ts'],
    });
  });

  it('refuses suites that need different runners', async () => {
    await expect(selectTestRunner(root, ['src/a.test.ts', 'tests/test_a.py'])).rejects.toThrow(
      /different runners/,
    );
  });

  it('reports an unreadable index instead of "no tests found"', async () => {
    const previous = process.env['WRONGSTACK_INDEX_INLINE'];
    process.env['WRONGSTACK_INDEX_INLINE'] = '1';
    // A regular file where the index directory should be: the store cannot open.
    const blocker = path.join(root, 'not-a-dir');
    await fs.writeFile(blocker, 'x');
    try {
      await expect(
        codebaseTargetedTestTool.execute(
          { symbol: 'helper' },
          { projectRoot: root, meta: { codebaseIndexDir: path.join(blocker, 'idx') } } as never,
          { signal: new AbortController().signal } as never,
        ),
      ).rejects.toThrow(/index query failed/);
    } finally {
      if (previous === undefined) delete process.env['WRONGSTACK_INDEX_INLINE'];
      else process.env['WRONGSTACK_INDEX_INLINE'] = previous;
    }
  });
});
