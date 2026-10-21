/**
 * F495 follow-up: breaking a stale lock renames it aside and links a LIVE lock
 * back. A holder that released inside that window read ENOENT, skipped its
 * unlink, and the linked-back lock stayed orphaned until staleMs, so every
 * waiter timed out although nobody held it. Gated with AsyncLocalStorage.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const g = vi.hoisted(() => ({
  als: undefined as undefined | import('node:async_hooks').AsyncLocalStorage<string>,
  lock: '',
  statsA: 0,
  afterRecheck: undefined as undefined | { reached: () => void; wait: Promise<void> },
  afterRename: undefined as undefined | { reached: () => void; wait: Promise<void> },
  bMissed: undefined as undefined | (() => void),
}));
vi.mock('node:fs/promises', async (orig) => {
  const real = await orig<typeof import('node:fs/promises')>();
  const who = () => g.als?.getStore();
  const stat = (async (...args: Parameters<typeof real.stat>) => {
    const out = await real.stat(...args);
    if (who() === 'A' && String(args[0]) === g.lock && ++g.statsA === 2 && g.afterRecheck) {
      g.afterRecheck.reached();
      await g.afterRecheck.wait;
    }
    return out;
  }) as typeof real.stat;
  const rename = (async (...args: Parameters<typeof real.rename>) => {
    await real.rename(...args);
    if (who() === 'A' && String(args[0]) === g.lock && g.afterRename) {
      g.afterRename.reached();
      await g.afterRename.wait;
    }
  }) as typeof real.rename;
  const readFile = (async (...args: Parameters<typeof real.readFile>) => {
    try {
      return await real.readFile(...args);
    } catch (err) {
      if (who() === 'B' && String(args[0]) === g.lock) g.bMissed?.();
      throw err;
    }
  }) as typeof real.readFile;
  const mod = { ...real, stat, rename, readFile };
  return { ...mod, default: mod };
});

const { withFileLock } = await import('../src/atomic-write.js');

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

it('a holder releasing while a breaker has its lock aside leaves no orphan', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'f495c-'));
  dirs.push(dir);
  const target = join(dir, 'data.json');
  g.lock = join(dir, '.data.json.lock');
  writeFileSync(g.lock, '99999999:crashed');
  const old = new Date(Date.now() - 10 * 60_000);
  utimesSync(g.lock, old, old);
  g.als = new AsyncLocalStorage<string>();
  const als = g.als;

  const recheck = deferred();
  const recheckGo = deferred();
  g.afterRecheck = { reached: recheck.resolve, wait: recheckGo.promise };
  const renamed = deferred();
  const renameGo = deferred();
  g.afterRename = { reached: renamed.resolve, wait: renameGo.promise };
  const bMissed = deferred();
  g.bMissed = bMissed.resolve;

  const aResult = als.run('A', () =>
    withFileLock(target, async () => 'A acquired', { timeoutMs: 3_000 }).catch(
      (e: Error) => `A failed: ${e.message.slice(0, 60)}`,
    ),
  );
  await recheck.promise;
  const bDone = als.run('B', () =>
    withFileLock(
      target,
      async () => {
        recheckGo.resolve(); // let A break: it renames B's LIVE lock aside
        await renamed.promise;
        return 'B ran';
      },
      { timeoutMs: 3_000 },
    ),
  );
  await bMissed.promise; // B's release looked while the lock was aside
  renameGo.resolve(); // A links the live lock back
  const b = await bDone;
  const a = await aResult;
  expect(b, 'CONTROL').toBe('B ran');
  expect(a).toBe('A acquired');
});
