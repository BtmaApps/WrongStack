/**
 * Imports are owned by the file's `<module>`, not by its first declaration:
 * `import { helper }` above `interface Opts` used to read as "Opts calls
 * helper", and every transitive tree walked on through Opts' users.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codebaseIncomingCallsTool } from '../src/codebase-index/codebase-incoming-calls-tool.js';
import { runIndexer } from '../src/codebase-index/indexer.js';
import { MODULE_OWNER_VERSION_KEY } from '../src/codebase-index/indexer-run-state.js';
import { indexStorePool } from '../src/codebase-index/writer.js';

const SOURCES: Record<string, string> = {
  'src/b.ts': 'export function helper(): number {\n  return 1;\n}\n',
  // The import sits above an unrelated first declaration.
  'src/a.ts': [
    "import { helper } from './b';",
    'export interface Opts {',
    '  flag: boolean;',
    '}',
    'export function main(): number {',
    '  return helper();',
    '}',
    '',
  ].join('\n'),
  // Uses Opts only: must not become a transitive caller of helper.
  'src/user.ts': [
    "import type { Opts } from './a';",
    'export function configure(o: Opts): boolean {',
    '  return o.flag;',
    '}',
    '',
  ].join('\n'),
  // A barrel's import is its only edge to helper and must stay.
  'src/index.ts': "export { helper } from './b';\n",
};

describe('import ownership', () => {
  let root: string;
  let indexDir: string;
  let previousInline: string | undefined;
  const ctx = () =>
    ({ projectRoot: root, cwd: root, meta: { codebaseIndexDir: indexDir } }) as never;

  beforeAll(async () => {
    previousInline = process.env['WRONGSTACK_INDEX_INLINE'];
    process.env['WRONGSTACK_INDEX_INLINE'] = '1';
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ws-import-owner-')));
    indexDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-import-owner-idx-'));
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

  it('never names the first declaration as the importer', async () => {
    const out = await codebaseIncomingCallsTool.execute({ symbol: 'helper' }, ctx(), {} as never);
    const callers = out.calls.map((c) => `${c.symbol.file}:${c.symbol.name}:${c.callType}`);
    expect(callers).not.toContain('src/a.ts:Opts:import');
    expect(callers).toContain('src/a.ts:main:call');
    // The barrel keeps its import edge; a.ts's is redundant next to main's call.
    expect(callers).toContain('src/index.ts:<module>:import');
    expect(callers.filter((c) => c.startsWith('src/a.ts:<module>'))).toEqual([]);
  });

  it('does not walk from an import into the first declaration’s users', async () => {
    const out = await codebaseIncomingCallsTool.execute(
      { symbol: 'helper', transitive: true },
      ctx(),
      {} as never,
    );
    expect(out.calls.map((c) => c.symbol.name)).not.toContain('configure');
  });

  it('re-parses every unchanged file once for an index built under the old rule', async () => {
    const store = indexStorePool.acquire(root, { indexDir });
    try {
      store.setMetadata(MODULE_OWNER_VERSION_KEY, '1');
    } finally {
      indexStorePool.release(store);
    }
    const upgrade = await runIndexer({} as never, { projectRoot: root, indexDir });
    expect(upgrade.fileOutcomes?.parsed).toBe(Object.keys(SOURCES).length);
    // Recorded once the full run finished: the next run skips everything.
    const steady = await runIndexer({} as never, { projectRoot: root, indexDir });
    expect(steady.fileOutcomes?.parsed).toBe(0);
  });
});
