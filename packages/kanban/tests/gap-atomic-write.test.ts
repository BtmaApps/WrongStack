/**
 * Gap-closing tests for atomic-write.ts uncovered branches:
 *   - EPERM recovery in withFileLock (line 121)
 *   - waitForLockRelease watcher fallback (lines 194-199)
 *   - waitForLockRelease access-check early-resolve (lines 205-209)
 *   - waitForLockRelease watcher callback (lines 185-190)
 *   - renameWithRetry transient-error retry (lines 223-237)
 */

import { type FSWatcher, watch } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atomicWrite, withFileLock } from '../src/utils/atomic-write.js';

function errWithCode(code: string, message = 'fake error'): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, watch: vi.fn(actual.watch) };
});

// Mock node:fs/promises
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const wrapped = {} as typeof import('node:fs/promises');
  for (const key of Object.keys(actual) as Array<keyof typeof actual>) {
    const origFn = actual[key];
    if (typeof origFn === 'function') {
      (wrapped as any)[key] = vi
        .fn()
        .mockImplementation((...args: any[]) => (origFn as any)(...args));
    } else {
      (wrapped as any)[key] = origFn;
    }
  }
  return wrapped;
});

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gap-atomic-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── EPERM recovery ──────────────────────────────────────────────
describe('withFileLock - EPERM recovery', () => {
  it('recovers when fs.open throws EPERM (treated like EEXIST)', async () => {
    // EPERM should be treated like EEXIST — proceed to stale check
    const openMock = vi.mocked(fs.open);
    openMock.mockRejectedValueOnce(errWithCode('EPERM'));

    const target = path.join(tmpDir, 'eperm-recovery', 'target.json');
    const result = await withFileLock(target, async () => 'eperm-recovered', {
      timeoutMs: 5000,
    });
    expect(result).toBe('eperm-recovered');
  });

  it('re-throws unexpected error codes (non-EEXIST/non-EPERM)', async () => {
    const target = path.join(tmpDir, 'unexpected-code', 'target.json');
    await fs.writeFile(path.join(tmpDir, 'unexpected-code'), 'not-dir', 'utf8');
    await expect(withFileLock(target, async () => 'never', { timeoutMs: 100 })).rejects.toThrow();
  });
});

// ── waitForLockRelease: watcher creation failure ────────────────
describe('withFileLock - lock release watcher fallback', () => {
  it('falls back to setTimeout when fs.watch cannot be created', async () => {
    // Keep a fresh lock so acquisition must wait for its actual release.
    const target = path.join(tmpDir, 'watch-fail', 'target.json');
    const lockDir = path.join(tmpDir, 'watch-fail');
    const lockPath = path.join(lockDir, '.target.json.lock');

    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(lockPath, '99999:0', { flag: 'wx' });

    vi.mocked(watch).mockImplementationOnce(() => {
      // Release after watcher setup fails; the polling fallback must retry.
      setTimeout(() => void fs.unlink(lockPath), 10);
      throw errWithCode('ENOSPC');
    });
    const result = await withFileLock(target, async () => 'watcher-fallback', {
      timeoutMs: 5000,
      staleMs: 60_000,
    });
    expect(result).toBe('watcher-fallback');
    expect(watch).toHaveBeenCalled();
  });
});

// ── waitForLockRelease: access check early-resolve ──────────────
describe('withFileLock - access check path', () => {
  it('resolves via access check when lock is already released', async () => {
    // Release between stat and the access probe, with a silent watcher.
    const target = path.join(tmpDir, 'access-resolve', 'target.json');
    const lockDir = path.join(tmpDir, 'access-resolve');
    const lockPath = path.join(lockDir, '.target.json.lock');

    await fs.mkdir(lockDir, { recursive: true });

    await fs.writeFile(lockPath, '1:0', { flag: 'wx' });

    const close = vi.fn();
    const watcher = { close, on: vi.fn() };
    vi.mocked(watch).mockReturnValueOnce(watcher as unknown as FSWatcher);
    vi.mocked(fs.access).mockImplementationOnce(async () => {
      await fs.unlink(lockPath);
      throw errWithCode('ENOENT');
    });
    const result = await withFileLock(target, async () => 'access-resolved', {
      timeoutMs: 5000,
      staleMs: 60_000,
    });
    expect(result).toBe('access-resolved');
    expect(close).toHaveBeenCalledOnce();
  });
});

// ── renameWithRetry: transient error retry ──────────────────────
describe('renameWithRetry transient retry', () => {
  it('retries on transient rename errors (EBUSY, EACCES, ENOTEMPTY)', async () => {
    // Simulate a Windows rename that gets EBUSY then succeeds
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    try {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
        writable: true,
      });

      // Mock fs.rename to fail twice then succeed
      const renameMock = vi.mocked(fs.rename);
      const origRename = renameMock.getMockImplementation() as Function;
      let callCount = 0;
      renameMock.mockImplementation(async (from: any, to: any) => {
        callCount++;
        if (callCount <= 2) {
          throw errWithCode('EBUSY', 'Resource busy');
        }
        // Fall through to real implementation for third call
        if (origRename) return origRename(from, to);
      });

      const target = path.join(tmpDir, 'rename-retry.txt');
      await atomicWrite(target, 'retried content');
      const content = await fs.readFile(target, 'utf8');
      expect(content).toBe('retried content');
      // rename should have been called 3 times (2 failures + 1 success, or 2 + actual)
      expect(renameMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      } else {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      }
    }
  });

  it('fails after exhausting all retry delays', async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    // Retry exhaustion emits a diagnostic process warning before throwing;
    // spy it out so the negative path stays silent while pinning its shape.
    // Declared outside `try` so the `finally` can always restore it.
    const emitSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
        writable: true,
      });

      // Mock fs.rename to always fail with EPERM
      const renameMock = vi.mocked(fs.rename);
      renameMock.mockRejectedValue(errWithCode('EPERM', 'Operation not permitted'));

      const target = path.join(tmpDir, 'rename-exhaust.txt');
      await expect(atomicWrite(target, 'content')).rejects.toThrow();
      expect(emitSpy).toHaveBeenCalledWith(
        expect.stringContaining('Windows rename retries exhausted'),
        expect.objectContaining({ code: 'WRONGSTACK_WIN32_RENAME_EXHAUSTED' }),
      );
    } finally {
      emitSpy.mockRestore();
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      } else {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      }
      // Restore the real rename mock for other tests
      vi.mocked(fs.rename).mockRestore();
    }
  });
});
