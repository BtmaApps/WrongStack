import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { acquireLock } from '../src/process-registry-persistent.js';

// Regression (audit 2026-10-12, F446): a lock file that exists but holds no
// token yet — a live holder between writeFile(wx)'s create and its write —
// parsed as timestamp `Number('') === 0`, read as decades old, and was stolen
// on sight, admitting a second writer beside the holder. Real fs, gated order:
// the holder opens with 'wx' and only writes after the contender has tried.

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'acquire-lock-midwrite-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function tryAcquire(lockPath: string, timeoutMs: number) {
  try {
    return await acquireLock(lockPath, timeoutMs);
  } catch {
    return null;
  }
}

test('does not steal a lock whose holder has created it but not written its token', async () => {
  const lockPath = path.join(dir, 'registry.lock');
  const holder = await fs.open(lockPath, 'wx');
  try {
    expect(await tryAcquire(lockPath, 300)).toBeNull();
    const token = `${process.pid}:${os.hostname()}:feed:${Date.now()}`;
    await holder.writeFile(token);
    expect(await fs.readFile(lockPath, 'utf8')).toBe(token);
  } finally {
    await holder.close();
  }
});

test('still recovers an empty lock left by a holder that crashed long ago', async () => {
  const lockPath = path.join(dir, 'registry.lock');
  await fs.writeFile(lockPath, '', { flag: 'wx' });
  const old = new Date(Date.now() - 120_000);
  await fs.utimes(lockPath, old, old);
  const release = await tryAcquire(lockPath, 1000);
  expect(release).not.toBeNull();
  await release?.();
});
