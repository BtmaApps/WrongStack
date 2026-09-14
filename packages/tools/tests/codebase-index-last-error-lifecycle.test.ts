/**
 * `getIndexState().lastError` gates search, incoming/outgoing calls and impact
 * analysis. A wrong value there disables all of them at once.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getIndexState,
  resetIndexStateForTesting,
  resolveLastError,
  runStartupIndex,
} from '../src/codebase-index/background-indexer.js';
import { indexStorePool } from '../src/codebase-index/writer.js';

describe('lastError lifecycle', () => {
  let root: string;
  let indexDir: string;
  let previousInline: string | undefined;

  beforeAll(() => {
    previousInline = process.env['WRONGSTACK_INDEX_INLINE'];
    process.env['WRONGSTACK_INDEX_INLINE'] = '1';
  });
  afterAll(() => {
    if (previousInline === undefined) delete process.env['WRONGSTACK_INDEX_INLINE'];
    else process.env['WRONGSTACK_INDEX_INLINE'] = previousInline;
  });

  beforeEach(async () => {
    resetIndexStateForTesting();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-last-error-'));
    indexDir = path.join(root, '.idx');
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/a.ts'), 'export function a(): number { return 1; }\n');
  });

  afterEach(async () => {
    indexStorePool.evict(root, indexDir);
    resetIndexStateForTesting();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not record a caller-initiated abort as an index failure', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Indexing cancelled'));
    await expect(
      runStartupIndex({ projectRoot: root, indexDir, signal: controller.signal }),
    ).rejects.toThrow();
    expect(getIndexState().lastError).toBeNull();
  });

  it('records a genuine failure and clears it after a successful run', async () => {
    const blocker = path.join(root, 'blocker');
    await fs.writeFile(blocker, 'not a directory');
    await expect(
      runStartupIndex({ projectRoot: root, indexDir: path.join(blocker, 'idx') }),
    ).rejects.toThrow();
    expect(getIndexState().lastError).not.toBeNull();

    await runStartupIndex({ projectRoot: root, indexDir });
    expect(getIndexState().lastError).toBeNull();
  });
});

describe('resolveLastError', () => {
  it('lets a newer successful server generation clear an older local failure', () => {
    expect(resolveLastError({ lastError: null, updatedAt: 2_000 }, 'timeout', 1_000)).toBeNull();
  });

  it('keeps a local failure that is newer than the server report', () => {
    expect(resolveLastError({ lastError: null, updatedAt: 1_000 }, 'timeout', 2_000)).toBe(
      'timeout',
    );
  });

  it('uses the server error when there is no local one, and the local one without a server', () => {
    expect(resolveLastError({ lastError: 'disk full', updatedAt: null }, null, 0)).toBe(
      'disk full',
    );
    expect(resolveLastError(undefined, 'timeout', 1)).toBe('timeout');
    expect(resolveLastError(null, null, 0)).toBeNull();
  });
});
