// Two waiters classify the same dead-pid registry lock as stale. A breaks it,
// creates and stamps its own lock; B's rename comes after and captures A's LIVE
// lock. B must link it back and report nothing broken — deleting it let the
// registry's lock loop open a second lock and rewrite sessions.json alongside A.
// Gating: AsyncLocalStorage tags the actors; B's rename waits until A stamped.
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const g = vi.hoisted(() => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };
  return {
    deferred,
    actor: undefined as unknown as { getStore(): string | undefined },
    lockPath: '',
    armed: false,
    aStamped: deferred(),
    releaseReadMissed: deferred(),
    watchRelease: false,
  };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    readFile: (async (file: unknown, ...rest: unknown[]) => {
      const out = (real.readFile as (...a: unknown[]) => Promise<unknown>)(file, ...rest);
      if (g.watchRelease && String(file) === g.lockPath) {
        try {
          return await out;
        } catch (error) {
          g.watchRelease = false;
          g.releaseReadMissed.resolve();
          throw error;
        }
      }
      return out;
    }) as typeof real.readFile,
    rename: (async (from: unknown, to: unknown) => {
      if (g.armed && String(from) === g.lockPath && g.actor.getStore() === 'B') {
        await g.aStamped.promise;
      }
      return real.rename(from as string, to as string);
    }) as typeof real.rename,
  };
});

g.actor = new AsyncLocalStorage<string>();
const actor = g.actor as AsyncLocalStorage<string>;
const { breakStaleLock, lockOwnerStamp } = await import(
  '../../src/session-catalog/session-registry-atomic-file.js'
);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const DEAD_PID = 2_147_483_646;

function staleLock(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'session-registry-lock-race-'));
  dirs.push(dir);
  g.lockPath = path.join(dir, 'sessions.json.lock');
  writeFileSync(g.lockPath, `${hostname()}:${DEAD_PID}`);
  return g.lockPath;
}

it('breaking a stale lock never removes a fresh one taken in between (gated race)', async () => {
  const lockPath = staleLock();
  g.armed = true;
  g.aStamped = g.deferred();
  const b = actor.run('B', () => breakStaleLock(lockPath));
  const a = actor.run('A', async () => {
    const broke = await breakStaleLock(lockPath);
    const fsp = await import('node:fs/promises');
    const handle = await fsp.open(lockPath, 'wx');
    await handle.writeFile(lockOwnerStamp());
    await handle.close();
    g.aStamped.resolve();
    return broke;
  });
  expect(await Promise.all([a, b])).toEqual([true, false]);
  g.armed = false;
  expect(readFileSync(lockPath, 'utf8')).toBe(lockOwnerStamp());
});
