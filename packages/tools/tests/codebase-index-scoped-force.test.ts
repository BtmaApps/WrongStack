import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resetIndexStateForTesting } from '../src/codebase-index/background-indexer.js';
import { codebaseIndexTool } from '../src/codebase-index/codebase-index-tool.js';
import { codebaseSearchTool } from '../src/codebase-index/codebase-search-tool.js';
import { indexStorePool } from '../src/codebase-index/writer.js';

process.env['WRONGSTACK_INDEX_INLINE'] = '1';

describe('codebase-index — scoped force', () => {
  it('force + langs re-parses that language without wiping the others', {
    timeout: 120_000,
  }, async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scoped-force-'));
    const indexDir = path.join(tempDir, '.codebase-index');
    resetIndexStateForTesting();
    try {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'src', 'calc.ts'),
        'export function multiplyScoped(a: number, b: number): number { return a * b; }\n',
      );
      await fs.writeFile(path.join(tempDir, 'settings.json'), '{ "scopedSetting": true }\n');
      const ctx = { projectRoot: tempDir, meta: { codebaseIndexDir: indexDir } } as never;
      const opts = { signal: new AbortController().signal };

      await codebaseIndexTool.execute({ force: true }, ctx, opts);
      const before = await codebaseSearchTool.execute({ query: 'multiplyScoped' }, ctx, opts);
      expect(before.total).toBeGreaterThan(0);

      // Used to call clearAll() first, deleting every TypeScript symbol.
      await codebaseIndexTool.execute({ force: true, langs: ['json'] }, ctx, opts);
      const after = await codebaseSearchTool.execute({ query: 'multiplyScoped' }, ctx, opts);
      expect(after.total).toBeGreaterThan(0);
    } finally {
      indexStorePool.evict(tempDir, indexDir);
      resetIndexStateForTesting();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
