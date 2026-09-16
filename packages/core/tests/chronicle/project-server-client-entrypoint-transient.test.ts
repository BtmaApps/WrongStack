import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveChronicleProjectServerUrl } from '../../src/chronicle/project-server-client.js';

/**
 * Regression (2026-09-16, transient-stat sibling of the mailbox/SAGE
 * `resolveProjectServerUrl` fixes): the chronicle resolver probed the dist
 * entrypoint with `fs.existsSync`, which folds EVERY stat error —
 * EMFILE/EPERM/EBUSY spikes under full-suite parallel load — into
 * "missing build". One transient miss then threw "Built Chronicle project
 * server is unavailable" from `spawnDetachedServer` inside
 * `connectWithElection`'s re-arm site, where the throw was uncaught and
 * unwound the entire SERVER_START_TIMEOUT_MS window.
 *
 * The fault is injected deterministically at the fs seam: a stat failure
 * whose code is NOT ENOENT (the file exists but the stat itself fails) must
 * be treated as "assume present" — the recoverable direction, since a dead
 * spawn is guarded and cadence-retryable while a false negative was fatal —
 * while genuine ENOENT must keep reporting missing-build. The injected
 * `exists` test seam is exercised too: callers that pass their own predicate
 * keep exact boolean semantics.
 */
const probeState = vi.hoisted(() => ({ mode: 'real' as 'real' | 'eperm' | 'enoent' }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const isEntrypointProbe = (value: unknown): boolean => {
    const s = String(value);
    return s.includes('chronicle') && s.includes('project-server');
  };
  const statError = (code: string): NodeJS.ErrnoException => {
    const error = new Error(`transient stat failure (${code})`) as NodeJS.ErrnoException;
    error.code = code;
    return error;
  };
  const existsSync = ((pathValue: Parameters<typeof actual.existsSync>[0]) => {
    if (probeState.mode !== 'real' && isEntrypointProbe(pathValue)) return false;
    return actual.existsSync(pathValue);
  }) as typeof actual.existsSync;
  const statSync = ((pathValue: Parameters<typeof actual.statSync>[0], ...rest: unknown[]) => {
    if (probeState.mode === 'eperm' && isEntrypointProbe(pathValue)) throw statError('EPERM');
    if (probeState.mode === 'enoent' && isEntrypointProbe(pathValue)) throw statError('ENOENT');
    return (actual.statSync as (...args: unknown[]) => unknown)(pathValue, ...rest);
  }) as typeof actual.statSync;
  return { ...actual, existsSync, statSync };
});

const here = path.dirname(fileURLToPath(import.meta.url));
const clientSrc = path.resolve(here, '../../src/chronicle/project-server-client.ts');
// resolveChronicleProjectServerUrl() with defaults probes candidates relative
// to the client's own module URL; its FIRST candidate is this exact path.
const firstCandidate = path.resolve(path.dirname(clientSrc), './project-server.js');

beforeEach(() => {
  probeState.mode = 'real';
  delete process.env['WRONGSTACK_CHRONICLE_INLINE'];
  delete process.env['WRONGSTACK_CHRONICLE_SERVER'];
});

afterEach(() => {
  probeState.mode = 'real';
  delete process.env['WRONGSTACK_CHRONICLE_INLINE'];
  delete process.env['WRONGSTACK_CHRONICLE_SERVER'];
});

describe('chronicle project server entrypoint resolution', () => {
  it('treats a non-ENOENT stat failure as assume-present instead of missing-build', () => {
    probeState.mode = 'eperm';
    const resolved = resolveChronicleProjectServerUrl();
    expect(resolved).not.toBeNull();
    expect(fileURLToPath(resolved!)).toBe(firstCandidate);
  });

  it('keeps reporting missing-build for genuine ENOENT', () => {
    probeState.mode = 'enoent';
    expect(resolveChronicleProjectServerUrl()).toBeNull();
  });

  it('keeps the injected exists predicate as an exact boolean contract', () => {
    // A caller-supplied predicate still decides availability directly — the
    // hardened default must not second-guess an explicit injection. Both the
    // module URL and the expected candidate derive from the real client
    // source path, so the assertion is separator- and platform-neutral.
    const moduleUrl = pathToFileURL(clientSrc).href;
    const injected = resolveChronicleProjectServerUrl(
      moduleUrl,
      (candidate) => candidate === firstCandidate,
    );
    expect(injected).not.toBeNull();
    expect(fileURLToPath(injected!)).toBe(firstCandidate);
  });
});
