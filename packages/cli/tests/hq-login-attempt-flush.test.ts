import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _filePermOps } from '@wrongstack/persistence';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({ beforeRename: undefined as (() => Promise<void>) | undefined }));
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>();
  return {
    ...real,
    rename: async (
      from: Parameters<typeof real.rename>[0],
      to: Parameters<typeof real.rename>[1],
    ) => {
      if (String(to).endsWith('login-attempts.json')) await seam.beforeRename?.();
      return real.rename(from, to);
    },
  };
});
import { LoginAttemptStore } from '../src/hq-server/login-attempt-store.js';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}
const roots: string[] = [];
const originalPlatform = _filePermOps.platform;
const originalChmod = _filePermOps.chmod;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  _filePermOps.platform = 'linux';
});
afterEach(async () => {
  seam.beforeRename = undefined;
  _filePermOps.platform = originalPlatform;
  _filePermOps.chmod = originalChmod;
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    expect(resolve(root).startsWith(join(tmpdir(), 'wrongstack-login-flush-'))).toBe(true);
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'wrongstack-login-flush-'));
  roots.push(root);
  return { root, store: new LoginAttemptStore(root, { debounceMs: 1 }) };
}

describe('login attempt persistence flush', () => {
  it.each([false, true])('waits for the active rename (background=%s)', async (background) => {
    const entered = gate(),
      completion = gate(),
      hardened = gate();
    seam.beforeRename = async () => {
      entered.release();
      await completion.promise;
    };
    _filePermOps.chmod = async () => {
      hardened.release();
    };
    const { root, store } = await fixture();
    store.recordFailure('127.0.0.1');
    let settled = false;
    let flush: Promise<void>;
    if (background) {
      await vi.advanceTimersByTimeAsync(1);
      await entered.promise;
      flush = store.flush().then(() => {
        settled = true;
      });
    } else {
      flush = store.flush().then(() => {
        settled = true;
      });
      await entered.promise;
    }
    await Promise.resolve();
    await Promise.resolve();
    const early = settled;
    completion.release();
    await flush;
    await hardened.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(early).toBe(false);
    const persisted = JSON.parse(await fs.readFile(join(root, 'login-attempts.json'), 'utf8'));
    expect(persisted['127.0.0.1'].count).toBe(1);
  });

  it('does not create a file when there are no pending mutations', async () => {
    const { root, store } = await fixture();
    await store.flush();
    await store.flush();
    expect(await fs.readdir(root)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('persists a newer mutation queued during the active write', async () => {
    const entered = gate(),
      completion = gate();
    let renames = 0;
    seam.beforeRename = async () => {
      if (++renames === 1) {
        entered.release();
        await completion.promise;
      }
    };
    _filePermOps.chmod = async () => {};
    const { root, store } = await fixture();
    store.recordFailure('first');
    await vi.advanceTimersByTimeAsync(1);
    await entered.promise;
    store.recordFailure('second');
    const flush = store.flush();
    completion.release();
    await flush;
    const persisted = JSON.parse(await fs.readFile(join(root, 'login-attempts.json'), 'utf8'));
    expect(Object.keys(persisted).sort()).toEqual(['first', 'second']);
    expect(renames).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
