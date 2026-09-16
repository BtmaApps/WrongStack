import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SageProjectServerConnection } from '../src/project-server-client.js';

/**
 * Regression (2026-09-16, transient-stat sibling of the mailbox
 * `resolveProjectServerUrl` fix): the SAGE resolver probed the dist
 * entrypoint with `fs.existsSync`, which folds EVERY stat error —
 * EMFILE/EPERM/EBUSY spikes under full-suite parallel load — into
 * "missing build". One transient miss then threw "Built SAGE project server
 * is unavailable" from `spawnDetachedServer` inside `connectWithElection`'s
 * re-arm site, where the throw was uncaught and unwound the entire
 * SERVER_START_TIMEOUT_MS window. Observed as the mailbox sibling flake
 * (shard 3/4, 2026-09-15); the SAGE seam is identical.
 *
 * The fault is injected deterministically at the dist-probe seam: probes are
 * disarmed while the constructor and the pre-connect availability check see
 * the real, healthy dist; the SECOND armed probe — the one
 * `spawnDetachedServer` makes after the first `connectOnce` fails — hits a
 * stat error that is NOT ENOENT. Pre-fix that returned null and threw; the
 * hardened resolver must treat a non-ENOENT stat failure as "assume present"
 * (the recoverable direction: a dead spawn is guarded and cadence-retryable,
 * a false negative was fatal) so the real dist daemon comes up and completes
 * the IPC connect.
 *
 * The client class is loaded from the built package — the spawn resolver only
 * resolves `./project-server.js` relative to a built module — so the suite
 * skips when `dist/` has not been built (same convention as
 * `project-server-client-respawn.test.ts`). Rebuild @wrongstack/sage after
 * changing the client source or this suite exercises a stale dist.
 */

const sageDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const distReady =
  fs.existsSync(path.join(sageDistDir, 'index.js')) &&
  fs.existsSync(path.join(sageDistDir, 'project-server.js'));

const probeState = vi.hoisted(() => ({ armed: false, armedHits: 0 }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const isDistEntrypointProbe = (value: unknown): boolean => {
    const s = String(value);
    return s.includes('dist') && s.includes('project-server');
  };
  const transientStatError = (): NodeJS.ErrnoException => {
    const error = new Error('transient stat failure under load') as NodeJS.ErrnoException;
    error.code = 'EPERM';
    return error;
  };
  const existsSync = ((pathValue: Parameters<typeof actual.existsSync>[0]) => {
    if (probeState.armed && isDistEntrypointProbe(pathValue)) {
      probeState.armedHits += 1;
      if (probeState.armedHits === 2) return false;
    }
    return actual.existsSync(pathValue);
  }) as typeof actual.existsSync;
  const statSync = ((pathValue: Parameters<typeof actual.statSync>[0], ...rest: unknown[]) => {
    if (probeState.armed && isDistEntrypointProbe(pathValue)) {
      probeState.armedHits += 1;
      if (probeState.armedHits === 2) throw transientStatError();
    }
    return (actual.statSync as (...args: unknown[]) => unknown)(pathValue, ...rest);
  }) as typeof actual.statSync;
  return { ...actual, existsSync, statSync };
});

let projectRoot: string;

beforeEach(async () => {
  probeState.armed = false;
  probeState.armedHits = 0;
  delete process.env['WRONGSTACK_SAGE_SERVER'];
  projectRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sage-entrypoint-flake-'));
});

afterEach(async () => {
  delete process.env['WRONGSTACK_SAGE_SERVER'];
  await fs.promises.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
});

describe.skipIf(!distReady)('sage project server client entrypoint resolution', () => {
  it('recovers when the dist entrypoint stat fails transiently at the spawn re-arm', async () => {
    const dist = (await import(pathToFileURL(path.join(sageDistDir, 'index.js')).href)) as {
      SageProjectServerConnection: typeof SageProjectServerConnection;
    };
    const connection = new dist.SageProjectServerConnection(projectRoot);
    try {
      // Armed AFTER construction: the constructor's availability probe and
      // the ensureConnected probe pass through the real dist; the SECOND
      // armed probe — the spawn re-arm's — hits the transient stat failure.
      probeState.armed = true;
      await connection.connect();
      const state = connection.getState();
      expect(state.connected).toBe(true);
      expect(state.pid).toBeGreaterThan(0);
      // Both armed probes must have been reached (availability + spawn
      // re-arm) — otherwise the fault never fired and this passes vacuously.
      expect(probeState.armedHits).toBeGreaterThanOrEqual(2);
    } finally {
      probeState.armed = false;
      await connection.shutdown('sage-entrypoint-flake-complete').catch(() => undefined);
      connection.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, 45_000);
});
