/**
 * Stale-lock breaking in the process-registry lock captures exactly one file.
 * Re-reading the lock and then unlinking it by pathname raced a second stealer:
 * the first stealer deleted the NEW holder's live lock and both entered the
 * section. Breaking now renames the lock aside and links a live one back, and a
 * release that looks while its lock is aside looks again instead of orphaning
 * it. Gated with AsyncLocalStorage; no sleep decides an outcome.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

type Deferred = { promise: Promise<void>; resolve: () => void };
const gate = vi.hoisted(() => ({
  als: undefined as undefined | import('node:async_hooks').AsyncLocalStorage<string>,
  target: '',
  readsA: 0,
  afterRecheck: undefined as undefined | { reached: () => void; wait: Promise<void> },
  afterRename: undefined as undefined | { reached: () => void; wait: Promise<void> },
  bMissed: undefined as undefined | (() => void),
}));
vi.mock('node:fs/promises', async (orig) => {
  const real = await orig<typeof import('node:fs/promises')>();
  const readFile = (async (...args: Parameters<typeof real.readFile>) => {
    const who = gate.als?.getStore();
    const onTarget = String(args[0]) === gate.target;
    try {
      const out = await real.readFile(...args);
      if (who === 'A' && onTarget && ++gate.readsA === 2 && gate.afterRecheck) {
        gate.afterRecheck.reached();
        await gate.afterRecheck.wait;
      }
      return out;
    } catch (err) {
      if (who === 'B' && onTarget) gate.bMissed?.();
      throw err;
    }
  }) as typeof real.readFile;
  const rename = (async (...args: Parameters<typeof real.rename>) => {
    await real.rename(...args);
    if (gate.als?.getStore() === 'A' && String(args[0]) === gate.target && gate.afterRename) {
      gate.afterRename.reached();
      await gate.afterRename.wait;
    }
  }) as typeof real.rename;
  return { ...real, readFile, rename, default: { ...real, readFile, rename } };
});

const { acquireLock } = await import('../src/process-registry-lock.js');

const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  Object.assign(gate, {
    readsA: 0,
    afterRecheck: undefined,
    afterRename: undefined,
    bMissed: undefined,
  });
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'f509v-'));
  dirs.push(dir);
  const lock = join(dir, 'registry.lock');
  gate.target = lock;
  gate.als = new AsyncLocalStorage<string>();
  return { dir, lock };
}
const stale = () => `99999999:ghost:00:${Date.now() - 10 * 60_000}`;

it('B releases while A has its live lock renamed aside: no orphan, A acquires after', async () => {
  const { dir, lock } = setup();
  writeFileSync(lock, stale());
  const recheckReached = deferred();
  const recheckGo = deferred();
  gate.afterRecheck = { reached: recheckReached.resolve, wait: recheckGo.promise };
  const als = gate.als!;
  let bHolds = false;
  let overlap = false;
  const aDone = als.run('A', async () => {
    const releaseA = await acquireLock(lock, 5_000);
    if (bHolds) overlap = true;
    await releaseA();
    return true;
  });
  await recheckReached.promise;
  const releaseB = await als.run('B', () => acquireLock(lock, 3_000));
  bHolds = true;
  const renameReached = deferred();
  const renameGo = deferred();
  gate.afterRename = { reached: renameReached.resolve, wait: renameGo.promise };
  recheckGo.resolve();
  await renameReached.promise; // A holds B's live lock under the grave name
  const bMissed = deferred();
  gate.bMissed = bMissed.resolve;
  bHolds = false;
  const bReleased = als.run('B', () => releaseB());
  await bMissed.promise; // B looked while the lock was aside
  renameGo.resolve(); // A links it back
  await bReleased;
  expect(await aDone).toBe(true);
  expect(overlap).toBe(false);
  expect(existsSync(lock)).toBe(false);
  expect(readdirSync(dir)).toEqual([]);
});

it('a lone stealer still breaks a stale lock and leaves no grave behind', async () => {
  const { dir, lock } = setup();
  writeFileSync(lock, stale());
  const release = await acquireLock(lock, 2_000);
  await release();
  expect(readdirSync(dir)).toEqual([]);
});

it('a fresh lock is never stolen', async () => {
  const { lock } = setup();
  const holder = await acquireLock(lock, 2_000);
  await expect(acquireLock(lock, 300)).rejects.toThrow();
  await holder();
});
