/**
 * Every codebase-* result carries next-step guidance, and codebase-ast-replace
 * never writes a file it just broke. Driven against a real index.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codebaseAstReplaceTool } from '../src/codebase-index/codebase-ast-replace-tool.js';
import { codebaseContextTool } from '../src/codebase-index/codebase-context-tool.js';
import { codebaseFlowTraceTool } from '../src/codebase-index/codebase-flow-trace-tool.js';
import { codebaseIncomingCallsTool } from '../src/codebase-index/codebase-incoming-calls-tool.js';
import { codebaseReadSymbolTool } from '../src/codebase-index/codebase-read-symbol-tool.js';
import { codebaseSearchTool } from '../src/codebase-index/codebase-search-tool.js';
import { codebaseSkeletonTool } from '../src/codebase-index/codebase-skeleton-tool.js';
import { parseTestCounts } from '../src/codebase-index/codebase-targeted-test-tool.js';
import { runIndexer } from '../src/codebase-index/indexer.js';
import { indexStorePool } from '../src/codebase-index/writer.js';
import { displayIndexPath } from '../src/codebase-index/writer-helpers.js';

const B_TS = [
  'export function helper(value: number): number {',
  '  return value + 1;',
  '}',
  '',
  'export class Store {',
  '  size(): number {',
  '    return 0;',
  '  }',
  '}',
  '',
  'export function unused(): void {}',
  '',
].join('\n');

const SOURCES: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'probe', main: 'src/a.ts' }, null, 2),
  'src/a.ts': [
    "import { helper, Store } from './b';",
    'export function main(): number {',
    '  return helper(new Store().size());',
    '}',
    '',
  ].join('\n'),
  'src/b.ts': B_TS,
  'tool/util.py': 'def greet(name):\n    return "hi " + name\n',
};

describe('codebase-* next-step notes and safe AST edits', () => {
  let root: string;
  let indexDir: string;
  let previousInline: string | undefined;
  const ctx = () =>
    ({ projectRoot: root, cwd: root, meta: { codebaseIndexDir: indexDir } }) as never;
  const read = (rel: string) => fs.readFile(path.join(root, rel), 'utf8');

  beforeAll(async () => {
    previousInline = process.env['WRONGSTACK_INDEX_INLINE'];
    process.env['WRONGSTACK_INDEX_INLINE'] = '1';
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ws-notes-')));
    indexDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-notes-idx-'));
    for (const [rel, text] of Object.entries(SOURCES)) {
      await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await fs.writeFile(path.join(root, rel), text);
    }
    const run = await runIndexer({} as never, { projectRoot: root, indexDir });
    expect(run.errors).toEqual([]);
  });

  afterAll(async () => {
    if (previousInline === undefined) delete process.env['WRONGSTACK_INDEX_INLINE'];
    else process.env['WRONGSTACK_INDEX_INLINE'] = previousInline;
    indexStorePool.evict(root, indexDir);
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(indexDir, { recursive: true, force: true });
  });

  it('points a search hit at read-symbol with a project-relative path', async () => {
    const out = await codebaseSearchTool.execute({ query: 'helper' }, ctx(), {} as never);
    expect(out.note).toContain('codebase-read-symbol({ file: "src/b.ts", symbol: "helper" })');
  });

  it('returns project-relative paths from search and call-graph results', async () => {
    const search = await codebaseSearchTool.execute({ query: 'helper' }, ctx(), {} as never);
    expect(search.results.map((r) => r.file)).toEqual(['src/b.ts']);
    const callers = await codebaseIncomingCallsTool.execute(
      { symbol: 'helper' },
      ctx(),
      {} as never,
    );
    expect(callers.calls.length).toBeGreaterThan(0);
    for (const call of callers.calls) expect(call.symbol.file).toBe('src/a.ts');
  });

  it('keeps an in-root ..-prefixed directory relative and an escape absolute', () => {
    const rootDir = path.resolve('/proj');
    expect(displayIndexPath(rootDir, path.join(rootDir, '..configs', 'x.ts'))).toBe(
      '..configs/x.ts',
    );
    const outside = path.resolve('/elsewhere/y.ts');
    expect(displayIndexPath(rootDir, outside)).toBe(outside.replace(/\\/g, '/'));
  });

  it('does not send a config-key hit to read-symbol or the call graph', async () => {
    const out = await codebaseSearchTool.execute(
      { query: 'name', lang: 'json' },
      ctx(),
      {} as never,
    );
    expect(out.results[0]?.lang).toBe('json');
    expect(out.note).toContain('documentation/config, not code');
    expect(out.note).not.toContain('codebase-incoming-calls');
  });

  it('explains an empty search and names the filters to drop', async () => {
    const out = await codebaseSearchTool.execute(
      { query: 'zzqqnothing', kind: 'class' },
      ctx(),
      {} as never,
    );
    expect(out.results).toEqual([]);
    expect(out.note).toMatch(/No indexed symbol matched "zzqqnothing".*Drop the kind filter/);
  });

  it('guides skeleton, read-symbol, calls and context results', async () => {
    const skeleton = await codebaseSkeletonTool.execute({ path: 'src' }, ctx(), {} as never);
    expect(skeleton.note).toMatch(/codebase-read-symbol\(\{ file: "src\/(a|b)\.ts"/);

    const symbol = await codebaseReadSymbolTool.execute(
      { file: 'src/b.ts', symbol: 'helper' },
      ctx(),
      {} as never,
    );
    expect(symbol.note).toContain('codebase-impact-analysis({ symbol: "helper" })');

    const callers = await codebaseIncomingCallsTool.execute(
      { symbol: 'unused' },
      ctx(),
      {} as never,
    );
    expect(callers.calls).toEqual([]);
    expect(callers.note).toContain('No indexed callers of "unused"');

    const context = await codebaseContextTool.execute({ query: 'zzqqnothing' }, ctx(), {} as never);
    expect(context.note).toContain('Nothing in the index matched');
  });

  it('traces code, not a same-named package.json key, and explains a missing symbol', async () => {
    const out = await codebaseFlowTraceTool.execute({ symbol: 'main' }, ctx(), {} as never);
    expect(out.entryPoints.map((e) => e.file)).toEqual(['src/a.ts']);
    const miss = await codebaseFlowTraceTool.execute({ symbol: 'nope' }, ctx(), {} as never);
    expect(miss.note).toContain('"nope" is not an indexed entry point');
  });

  it('promotes a complete declaration given as body to a full replacement', async () => {
    const out = await codebaseAstReplaceTool.execute(
      {
        file: 'src/b.ts',
        symbol: 'Store.size',
        newBody: 'size(): number {\n  return 1;\n}',
      },
      ctx(),
      {} as never,
    );
    expect(out.appliedTarget).toBe('full');
    expect(out.note).toContain('replaced the whole declaration');
    // Re-indented to the method's column, not nested inside the old body.
    expect(await read('src/b.ts')).toContain(
      'export class Store {\n  size(): number {\n    return 1;\n  }\n}',
    );
  });

  it('refuses a body that breaks the file syntax and writes nothing', async () => {
    const before = await read('src/b.ts');
    await expect(
      codebaseAstReplaceTool.execute(
        { file: 'src/b.ts', symbol: 'helper', newBody: 'return value;\n}\n}' },
        ctx(),
        {} as never,
      ),
    ).rejects.toThrow(/would leave 'src\/b\.ts' unparseable .*nothing was written/);
    expect(await read('src/b.ts')).toBe(before);

    const pyBefore = await read('tool/util.py');
    await expect(
      codebaseAstReplaceTool.execute(
        { file: 'tool/util.py', symbol: 'greet', newBody: 'return (' },
        ctx(),
        {} as never,
      ),
    ).rejects.toThrow(/unparseable/);
    expect(await read('tool/util.py')).toBe(pyBefore);
  });

  it('counts a vitest run whose suites never loaded as zero tests', () => {
    expect(parseTestCounts(' Test Files  1 failed (1)\n      Tests  no tests\n')).toEqual({
      passed: 0,
      failed: 0,
    });
  });
});
