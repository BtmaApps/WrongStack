import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailboxProjectServerConnection } from '../../src/coordination/mailbox-project-server-client.js';

/**
 * Regression: one transient stat failure on the dist entrypoint probe was
 * fatal for the whole connect window. `resolveProjectServerUrl()` used
 * `fs.existsSync`, which folds every stat error — EMFILE/EPERM/EBUSY spikes
 * under full-suite parallel load — into `false`, so an existing build looked
 * missing and `spawnDetachedServer` threw "Mailbox project server entrypoint
 * is unavailable" from inside `connectWithElection`'s re-arm site, where the
 * throw was uncaught and unwound the entire SERVER_START_TIMEOUT_MS window.
 * Observed once as a flaky failure of
 * packages/cli/tests/hq-mailbox-mutation.test.ts under shard load
 * (2026-09-15); the file and the full shard both pass on re-run.
 *
 * The fault is injected deterministically at the dist-probe seam: the FIRST
 * and SECOND full resolution passes (constructor, then ensureConnected's
 * availability check) see the real, healthy dist; the THIRD pass — the one
 * `spawnDetachedServer` makes after the first `connectOnce` fails — hits a
 * stat error that is NOT ENOENT. Pre-fix that returned null and threw; the
 * hardened resolver must treat a non-ENOENT stat failure as "assume present"
 * (the recoverable direction: a dead spawn is guarded and retryable, a false
 * negative was fatal) so the real dist daemon comes up and answers an
 * authenticated ping within the window.
 */
const probeState = vi.hoisted(() => ({ distProbes: 0 }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const isDistEntrypointProbe = (value: unknown): boolean => {
    const s = String(value);
    return s.includes('dist') && s.includes('mailbox-project-server');
  };
  const transientStatError = (): NodeJS.ErrnoException => {
    const error = new Error('transient stat failure under load') as NodeJS.ErrnoException;
    error.code = 'EPERM';
    return error;
  };
  const existsSync = ((pathValue: Parameters<typeof actual.existsSync>[0]) => {
    if (isDistEntrypointProbe(pathValue)) {
      probeState.distProbes += 1;
      if (probeState.distProbes === 3) return false;
    }
    return actual.existsSync(pathValue);
  }) as typeof actual.existsSync;
  const statSync = ((pathValue: Parameters<typeof actual.statSync>[0], ...rest: unknown[]) => {
    if (isDistEntrypointProbe(pathValue)) {
      probeState.distProbes += 1;
      if (probeState.distProbes === 3) throw transientStatError();
    }
    return (actual.statSync as (...args: unknown[]) => unknown)(pathValue, ...rest);
  }) as typeof actual.statSync;
  return { ...actual, existsSync, statSync };
});

let projectDir: string;

beforeEach(async () => {
  probeState.distProbes = 0;
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mailbox-entrypoint-flake-'));
});

afterEach(async () => {
  await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
});

describe('mailbox project server client entrypoint resolution', () => {
  it('recovers when the dist entrypoint stat fails transiently at the spawn re-arm', async () => {
    const connection = new MailboxProjectServerConnection(projectDir);
    try {
      const status = await connection.call('ping', {}, { timeoutMs: 20_000 });
      expect(status.pid).toBeGreaterThan(0);
      // The fault must actually have fired at the spawn re-arm (passes one
      // and two are the constructor and availability probes) — otherwise
      // this test would pass vacuously with no transient injected.
      expect(probeState.distProbes).toBeGreaterThanOrEqual(3);
    } finally {
      await connection.shutdown('mailbox-entrypoint-flake-complete').catch(() => undefined);
      connection.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, 45_000);
});
