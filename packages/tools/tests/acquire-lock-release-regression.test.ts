import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test, vi } from 'vitest';
import { acquireLock } from '../src/process-registry-persistent.js';

// Regression: acquireLock's release closure used to unlink the lockfile
// unconditionally. If a holder stalled past LOCK_STALE_MS (30s — GC pause,
// laptop sleep), another instance's stale-steal legitimately replaced the
// lockfile; the stalled holder's late release then deleted the NEW holder's
// live lock and admitted a third writer into the read-modify-write section.
// Contract: a release may only remove the lock while it still holds the
// token its own acquisition wrote (same RACE-002/S7 contract as withFileLock
// in @wrongstack/persistence).
//
// These tests run against real fs so the EEXIST → read → stale-steal path in
// acquireLock executes for real; the suite-wide fs mocks in
// process-registry-persistent.test.ts do not model 'wx'/EEXIST semantics.

test('control: acquire then release removes the lockfile', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-lock-ctrl-'));
  try {
    const lockPath = path.join(dir, '.process-registry.lock');
    const release = await acquireLock(lockPath, 5000);
    const held = await fs.readFile(lockPath, 'utf-8');
    expect(held).toContain(String(process.pid));
    await release();
    await expect(fs.readFile(lockPath, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('stalled holder late release must not delete the new holder lockfile', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-lock-steal-'));
  try {
    const lockPath = path.join(dir, '.process-registry.lock');

    // Holder A acquires, then stalls past LOCK_STALE_MS (30s). The lockfile
    // ages in place — simulate the aged content (same file, old timestamp;
    // LOCK_STALE_MS is a module-private 30s constant).
    const releaseA = await acquireLock(lockPath, 5000);
    const agedContent = `${process.pid}:proof-host:${Date.now() - 31_000}`;
    await fs.writeFile(lockPath, agedContent, 'utf-8');

    // Instance B acquires through the production stale-steal path.
    const releaseB = await acquireLock(lockPath, 5000);
    const afterSteal = await fs.readFile(lockPath, 'utf-8');
    expect(afterSteal).not.toBe(agedContent); // harness check: steal replaced the file

    // A resumes and releases. The lock must survive: it is B's now.
    await releaseA();
    let survived: string | undefined;
    try {
      survived = await fs.readFile(lockPath, 'utf-8');
    } catch {
      survived = undefined;
    }
    expect(survived, 'releaseA deleted the new holder B live lockfile').toBe(afterSteal);

    // Control: B's own release still removes its own lock.
    await releaseB();
    await expect(fs.readFile(lockPath, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('a steal in the same millisecond still mints a distinct token', async () => {
  // The flake behind the Linux release gate: A's acquisition and B's steal
  // landed in one millisecond in one process, so `pid:host:ms` tokens were
  // identical and A's release deleted B's lock. Pin the clock to force it.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-lock-samems-'));
  const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  try {
    const lockPath = path.join(dir, '.process-registry.lock');
    const releaseA = await acquireLock(lockPath, 5000);
    await fs.writeFile(lockPath, `${process.pid}:proof-host:${Date.now() - 31_000}`, 'utf-8');
    const releaseB = await acquireLock(lockPath, 5000);
    const afterSteal = await fs.readFile(lockPath, 'utf-8');

    await releaseA();
    expect(await fs.readFile(lockPath, 'utf-8')).toBe(afterSteal);
    await releaseB();
    await expect(fs.readFile(lockPath, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    now.mockRestore();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('release after the lock was already stolen is a no-op, not an error', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-lock-gone-'));
  try {
    const lockPath = path.join(dir, '.process-registry.lock');
    const releaseA = await acquireLock(lockPath, 5000);
    // Simulate: the lockfile vanished before A releases (stolen and replaced
    // by nothing, or cleaned up externally).
    await fs.unlink(lockPath);
    await expect(releaseA()).resolves.toBeUndefined();
    // The lockfile must NOT reappear.
    await expect(fs.readFile(lockPath, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
