import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression (2026-10-20 tools shard-gate): on Windows, spawning the Store
 * App Execution Alias stub (`...WindowsApps\python3.exe`) can throw
 * `EPERM: operation not permitted, uv_spawn ...` SYNCHRONOUSLY. The probe's
 * `'error'` event handler never fires in that case, so the old
 * commandIsAvailable rejected resolvePythonBinary and took down the whole
 * parse path instead of falling through to the next candidate and, when all
 * candidates fail, the no-python generic parser.
 */

const { spawnSpy } = vi.hoisted(() => ({
  spawnSpy: vi.fn<(command: string, args: readonly string[]) => never>(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    // Every candidate's probe spawn throws synchronously, mimicking the
    // WindowsApps alias stub's uv_spawn EPERM. Passthrough keeps sibling
    // modules on the real child_process.
    spawn: (command: string, args: readonly string[]) => spawnSpy(command, args),
  };
});

let root: string;
beforeEach(async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'py-parser-probe-'));
  vi.stubEnv('WRONGSTACK_HOME', join(root, 'home'));
  spawnSpy.mockImplementation((command) => {
    throw new Error(`EPERM: operation not permitted, uv_spawn ${command}`);
  });
});

afterEach(async () => {
  const fs = await import('node:fs/promises');
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
});

import { join } from 'node:path';

describe('python3 probe — synchronous uv_spawn throw', () => {
  it('falls back to the no-python path (resolves null) instead of rejecting', async () => {
    vi.resetModules();
    const { resolvePythonBinary } = await import('../src/codebase-index/py-parser.js');
    // Before the fix this REJECTED with the EPERM error; the contract is a
    // clean null (no Python runtime) so callers use the generic parser.
    await expect(resolvePythonBinary()).resolves.toBeNull();
    expect(spawnSpy).toHaveBeenCalled();
  });
});
