import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The only seam: run another contender's whole takeover right before this
// one's rename onto the lock path executes — the window two processes race in.
const seam = vi.hoisted(() => ({ lockPath: '', beforeRename: null as null | (() => void) }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      if (String(args[1]) === seam.lockPath && seam.beforeRename) {
        const interleave = seam.beforeRename;
        seam.beforeRename = null;
        interleave();
      }
      return actual.renameSync(...args);
    },
  };
});

import { PollLock } from '../../src/poll-lock.js';

let root: string;
const locks: PollLock[] = [];

function lock(): PollLock {
  const created = new PollLock(seam.lockPath, { heartbeatMs: 60_000 });
  locks.push(created);
  return created;
}

function writeStaleLock(): void {
  // A dead holder's leftover lock: heartbeat long past the stale window.
  fs.writeFileSync(
    seam.lockPath,
    JSON.stringify({ id: 'dead:holder', pid: 2 ** 30, acquiredAt: 0, heartbeatAt: 0 }),
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'poll-lock-takeover-'));
  seam.lockPath = path.join(root, 'poll.lock');
  seam.beforeRename = null;
});

afterEach(() => {
  for (const created of locks.splice(0)) created.release();
  seam.beforeRename = null;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('PollLock stale takeover', () => {
  it('elects one holder when two standbys take over the same stale lock', () => {
    writeStaleLock();
    const a = lock();
    const b = lock();
    let aResult: boolean | undefined;
    seam.beforeRename = () => {
      aResult = a.tryAcquire();
    };
    const bResult = b.tryAcquire();

    expect(aResult).toBe(false);
    expect(bResult).toBe(true);
    expect([a.held, b.held]).toEqual([false, true]);
    expect(fs.existsSync(`${seam.lockPath}.takeover`)).toBe(false);
  });

  it('stands back while another contender holds the takeover guard, and leaves it alone', () => {
    writeStaleLock();
    const guard = `${seam.lockPath}.takeover`;
    fs.writeFileSync(guard, 'other:contender');
    const standby = lock();

    expect(standby.tryAcquire()).toBe(false);
    expect(standby.held).toBe(false);
    expect(fs.readFileSync(guard, 'utf8')).toBe('other:contender');
  });

  it('clears a guard left by a contender that died mid-takeover, then takes over', () => {
    writeStaleLock();
    const guard = `${seam.lockPath}.takeover`;
    fs.writeFileSync(guard, 'dead:contender');
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(guard, old, old);
    const standby = lock();

    // The first attempt clears the abandoned guard; the next one proceeds.
    expect(standby.tryAcquire()).toBe(false);
    expect(fs.existsSync(guard)).toBe(false);
    expect(standby.tryAcquire()).toBe(true);
    expect(standby.held).toBe(true);
    expect(fs.existsSync(guard)).toBe(false);
  });
});
