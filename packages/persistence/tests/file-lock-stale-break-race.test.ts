/**
 * Regression for F495: two waiters judge a crashed holder's lock stale. One
 * breaks it, acquires and enters the critical section; the other then acted on
 * its stale observation and unlinked the NEW live lock by pathname, so both
 * held the lock. The stale-break must remove only the file it judged stale.
 *
 * Gated completion order (no sleeps): the first waiter to finish its re-check
 * `stat` is held there until the other waiter is inside the section; that
 * holder stays inside until the held waiter is refused (or gets in — the bug).
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Deferred = { promise: Promise<void>; resolve: () => void };
const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const als = new AsyncLocalStorage<{ name: string; stats: number }>();
const gate = {
  enabled: false,
  lockPath: '',
  held: '',
  otherInSection: deferred(),
  heldDecided: deferred(),
  heldResumed: false,
  failRename: false,
};

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  const stat = async (...args: Parameters<typeof real.stat>) => {
    const result = await real.stat(...args);
    const who = als.getStore();
    if (gate.enabled && who && String(args[0]) === gate.lockPath) {
      who.stats += 1;
      if (who.stats === 2 && gate.held === '') {
        gate.held = who.name;
        await gate.otherInSection.promise;
        gate.heldResumed = true;
      }
    }
    return result;
  };
  const open = async (...args: Parameters<typeof real.open>) => {
    try {
      return await real.open(...args);
    } catch (error) {
      const who = als.getStore();
      if (gate.enabled && who?.name === gate.held && gate.heldResumed) gate.heldDecided.resolve();
      throw error;
    }
  };
  const rename = async (...args: Parameters<typeof real.rename>) => {
    if (gate.failRename && String(args[0]) === gate.lockPath) {
      gate.failRename = false;
      // Another waiter already removed the stale lock.
      await real.unlink(args[0]);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
    return real.rename(...args);
  };
  return { ...real, stat, open, rename, default: { ...real, stat, open, rename } };
});

const { withFileLock } = await import('../src/atomic-write.js');

function staleFixture(): { dir: string; target: string; lockPath: string } {
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'f495-lock-'));
  const target = path.join(dir, 'journal.json');
  const lockPath = path.join(dir, '.journal.json.lock');
  fsSync.writeFileSync(lockPath, '999999:deadbeef');
  const old = new Date(Date.now() - 60_000);
  fsSync.utimesSync(lockPath, old, old);
  return { dir, target, lockPath };
}

afterEach(() => {
  Object.assign(gate, {
    enabled: false,
    lockPath: '',
    held: '',
    otherInSection: deferred(),
    heldDecided: deferred(),
    heldResumed: false,
    failRename: false,
  });
});

describe('F495 / withFileLock — stale-break removes only the stale lock', () => {
  it('never admits a second holder when two waiters break the same stale lock', async () => {
    const { dir, target, lockPath } = staleFixture();
    Object.assign(gate, { enabled: true, lockPath });
    let inside = 0;
    let maxInside = 0;
    const run = (name: string) =>
      als.run({ name, stats: 0 }, () =>
        withFileLock(
          target,
          async () => {
            inside += 1;
            maxInside = Math.max(maxInside, inside);
            if (name !== gate.held) {
              gate.otherInSection.resolve();
              await gate.heldDecided.promise;
            } else {
              gate.heldDecided.resolve();
            }
            inside -= 1;
          },
          { staleMs: 5_000, timeoutMs: 20_000 },
        ),
      );
    await Promise.all([run('A'), run('B')]);
    const leftovers = fsSync.readdirSync(dir);
    fsSync.rmSync(dir, { recursive: true, force: true });
    expect(gate.held).not.toBe('');
    expect(maxInside).toBe(1);
    expect(leftovers).toEqual([]);
  });

  it('breaks a genuinely stale lock and leaves no grave file behind', async () => {
    const { dir, target } = staleFixture();
    await expect(withFileLock(target, async () => 'ok', { staleMs: 5_000 })).resolves.toBe('ok');
    expect(fsSync.readdirSync(dir)).toEqual([]);
    fsSync.rmSync(dir, { recursive: true, force: true });
  });

  it('copes with the stale lock vanishing before the break', async () => {
    const { dir, target, lockPath } = staleFixture();
    Object.assign(gate, { lockPath, failRename: true });
    await expect(withFileLock(target, async () => 'ok', { staleMs: 5_000 })).resolves.toBe('ok');
    expect(fsSync.readdirSync(dir)).toEqual([]);
    fsSync.rmSync(dir, { recursive: true, force: true });
  });
});
