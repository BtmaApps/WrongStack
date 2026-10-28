/**
 * Transitive call trees on a real index: bounded depth, nearest-first order
 * (a limit never cuts a direct caller), and only runnable files as suites.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  codebaseImpactAnalysisTool,
  isRunnableTestFile,
} from '../src/codebase-index/codebase-impact-analysis-tool.js';
import { codebaseIncomingCallsTool } from '../src/codebase-index/codebase-incoming-calls-tool.js';
import { codebaseOutgoingCallsTool } from '../src/codebase-index/codebase-outgoing-calls-tool.js';
import { runIndexer } from '../src/codebase-index/indexer.js';
import { indexStorePool } from '../src/codebase-index/writer.js';

// target ← z/direct.ts:viaDirect, and a 5-hop chain a/c1 → … → a/c5 → target
// whose files sort BEFORE the direct caller.
const SOURCES: Record<string, string> = {
  'src/target.ts': 'export function target(): number {\n  return 1;\n}\n',
  'src/z/direct.ts':
    "import { target } from '../target';\nexport function viaDirect(): number {\n  return target();\n}\n",
};
for (let i = 1; i <= 5; i++) {
  const callee = i === 5 ? 'target' : `c${i + 1}`;
  const from = i === 5 ? '../target' : `./c${i + 1}`;
  SOURCES[`src/a/c${i}.ts`] =
    `import { ${callee} } from '${from}';\nexport function c${i}(): number {\n  return ${callee}();\n}\n`;
}
SOURCES['src/bench/suites/manifest.ts'] =
  "import { target } from '../../target';\nexport const manifest = [target()];\n";
SOURCES['tests/target.test.ts'] =
  "import { target } from '../src/target';\nexport function check(): boolean {\n  return target() === 1;\n}\n";

describe('transitive call trees', () => {
  let root: string;
  let indexDir: string;
  let previousInline: string | undefined;
  const ctx = () =>
    ({ projectRoot: root, cwd: root, meta: { codebaseIndexDir: indexDir } }) as never;

  beforeAll(async () => {
    previousInline = process.env['WRONGSTACK_INDEX_INLINE'];
    process.env['WRONGSTACK_INDEX_INLINE'] = '1';
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ws-transitive-')));
    indexDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-transitive-idx-'));
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

  it('stops the incoming tree at three hops', async () => {
    const out = await codebaseIncomingCallsTool.execute(
      { symbol: 'target', transitive: true, limit: 100 },
      ctx(),
      {} as never,
    );
    const chain = out.calls.map((c) => c.symbol.name).filter((n) => /^c\d$/.test(n));
    // c5 calls target (1 hop), c4 → c5 (2), c3 → c4 (3); c2/c1 are past the bound.
    expect([...new Set(chain)].sort()).toEqual(['c3', 'c4', 'c5']);
  });

  it('never lets the limit cut a direct caller', async () => {
    const out = await codebaseIncomingCallsTool.execute(
      { symbol: 'target', transitive: true, limit: 4 },
      ctx(),
      {} as never,
    );
    expect(out.calls.every((c) => c.callType !== '')).toBe(true);
    expect(out.calls.map((c) => c.symbol.name)).toContain('viaDirect');
  });

  it('stops the outgoing tree at three hops', async () => {
    const out = await codebaseOutgoingCallsTool.execute(
      { symbol: 'c1', transitive: true, limit: 100 },
      ctx(),
      {} as never,
    );
    const names = new Set(out.calls.map((c) => c.symbol.name));
    expect(names.has('c4')).toBe(true);
    expect(names.has('c5')).toBe(false);
    expect(names.has('target')).toBe(false);
  });

  it('reports direct call sites and lists only runnable suites', async () => {
    const out = await codebaseImpactAnalysisTool.execute({ symbol: 'target' }, ctx(), {} as never);
    expect(out.callSites.filter((s) => !s.indirect).map((s) => s.callerName)).toContain(
      'viaDirect',
    );
    expect(out.affectedTestFiles).toEqual(['tests/target.test.ts']);
  });

  it('classifies runnable test files', () => {
    for (const file of [
      'tests/a.test.ts',
      'src/b.spec.tsx',
      'pkg/x_test.go',
      'tool/test_util.py',
      'src/__tests__/c.ts',
    ]) {
      expect(isRunnableTestFile(file), file).toBe(true);
    }
    for (const file of [
      'packages/bench/src/suites/local-manifest.ts',
      'packages/plugins/src/test-flake-detector/index.ts',
      'tests/fixtures/data.json',
      'src/latest.ts',
    ]) {
      expect(isRunnableTestFile(file), file).toBe(false);
    }
  });
});
