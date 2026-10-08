import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({ target: '', mode: 'normal', code: 'EACCES', reads: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return {
    ...fs,
    readFileSync: (file: Parameters<typeof fs.readFileSync>[0], ...args: unknown[]) => {
      if (String(file) === seam.target) {
        seam.reads++;
        if (seam.mode === 'stale-then-unknown' && seam.reads === 1)
          return JSON.stringify({ id: 'stale', pid: process.pid, heartbeatAt: 0, acquiredAt: 0 });
        if (seam.mode !== 'normal')
          throw Object.assign(new Error('unknown probe'), { code: seam.code });
      }
      return Reflect.apply(fs.readFileSync, fs, [file, ...args]);
    },
  };
});

import { PollLock } from '../../src/poll-lock.js';

describe('poll read ownership verifier', () => {
  it('preserves foreign owner for unknown initial and fresh probes', async () => {
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'poll-unknown-read-'));
    seam.target = path.join(dir, 'poll.lock');
    const foreign = {
      id: 'foreign',
      pid: process.pid,
      heartbeatAt: Date.now(),
      acquiredAt: Date.now(),
    };
    for (const code of ['EACCES', 'EIO', 'EPERM'])
      for (const mode of ['unknown', 'stale-then-unknown']) {
        fs.writeFileSync(seam.target, JSON.stringify(foreign));
        seam.mode = mode;
        seam.code = code;
        seam.reads = 0;
        const lock = new PollLock(seam.target, { staleMs: 1_000_000, heartbeatMs: 1_000_000 });
        expect(lock.tryAcquire()).toBe(false);
        expect(JSON.parse(fs.readFileSync(seam.target, 'utf8')).id).toBe('foreign');
        lock.release();
        expect(JSON.parse(fs.readFileSync(seam.target, 'utf8')).id).toBe('foreign');
      }
    seam.mode = 'normal';
    fs.writeFileSync(seam.target, 'corrupt');
    const good = new PollLock(seam.target, { heartbeatMs: 1_000_000 });
    expect(good.tryAcquire()).toBe(true);
    good.release();
    expect(fs.existsSync(seam.target)).toBe(false);
    expect(good.tryAcquire()).toBe(true);
    good.release();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps a held lock when a heartbeat cannot read the lock file', async () => {
    // Treating "unreadable" as "taken over" made the holder stand down while
    // its own fresh lock kept every instance out until it went stale.
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'poll-unknown-read-'));
    seam.target = path.join(dir, 'poll.lock');
    seam.mode = 'normal';
    const lock = new PollLock(seam.target, { staleMs: 1_000_000, heartbeatMs: 1_000_000 });
    const onLost = vi.fn();
    lock.onLost = onLost;
    expect(lock.tryAcquire()).toBe(true);

    seam.mode = 'unknown';
    seam.code = 'EBUSY';
    (lock as unknown as { heartbeatTick(): void }).heartbeatTick();
    seam.mode = 'normal';

    expect(lock.held).toBe(true);
    expect(onLost).not.toHaveBeenCalled();
    lock.release();
    expect(fs.existsSync(seam.target)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
