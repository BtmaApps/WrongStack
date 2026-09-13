import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ensureSpawnHelperExecutable,
  repairNodePtySpawnHelper,
  spawnHelperFailureHint,
} from '../src/server/node-pty-spawn-helper.js';

const PKG = path.join('/opt', 'node_modules', 'node-pty');
const PREBUILT = path.join(PKG, 'prebuilds', 'darwin-arm64', 'spawn-helper');

function fakeFs(modes: Record<string, number>, chmodError?: Error) {
  return {
    statSync: vi.fn((p: string) => {
      const mode = modes[p];
      if (mode === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return { mode };
    }),
    chmodSync: vi.fn((p: string, mode: number) => {
      if (chmodError) throw chmodError;
      modes[p] = mode;
    }),
  };
}

const darwin = { platform: 'darwin' as const, arch: 'arm64' };

describe('ensureSpawnHelperExecutable', () => {
  it('adds the exec bits to a 0644 prebuilt helper (node-pty#919)', () => {
    const fs = fakeFs({ [PREBUILT]: 0o100644 });
    expect(ensureSpawnHelperExecutable(PKG, { ...darwin, fs })).toEqual({
      status: 'repaired',
      path: PREBUILT,
    });
    expect(fs.chmodSync).toHaveBeenCalledWith(PREBUILT, 0o755);
  });

  it('leaves an already-executable helper untouched', () => {
    const fs = fakeFs({ [PREBUILT]: 0o100755 });
    expect(ensureSpawnHelperExecutable(PKG, { ...darwin, fs }).status).toBe('ok');
    expect(fs.chmodSync).not.toHaveBeenCalled();
  });

  it('prefers a locally built helper, matching node-pty lookup order', () => {
    const built = path.join(PKG, 'build', 'Release', 'spawn-helper');
    const fs = fakeFs({ [built]: 0o100755, [PREBUILT]: 0o100644 });
    expect(ensureSpawnHelperExecutable(PKG, { ...darwin, fs })).toEqual({
      status: 'ok',
      path: built,
    });
    expect(fs.chmodSync).not.toHaveBeenCalled();
  });

  it('is a no-op on Windows and when no helper exists', () => {
    const fs = fakeFs({});
    expect(ensureSpawnHelperExecutable(PKG, { platform: 'win32', fs }).status).toBe(
      'not-applicable',
    );
    expect(ensureSpawnHelperExecutable(PKG, { platform: 'linux', arch: 'x64', fs }).status).toBe(
      'not-applicable',
    );
  });

  it('reports a read-only install and turns posix_spawnp failures into a chmod hint', () => {
    const fs = fakeFs({ [PREBUILT]: 0o100644 }, new Error('EACCES: permission denied'));
    const result = ensureSpawnHelperExecutable(PKG, { ...darwin, fs });
    expect(result).toMatchObject({ status: 'unrepairable', path: PREBUILT });
    expect(spawnHelperFailureHint('posix_spawnp failed.')).toContain(`chmod +x '${PREBUILT}'`);
    expect(spawnHelperFailureHint('ENOENT: no such shell')).toBeUndefined();
  });
});

describe('repairNodePtySpawnHelper', () => {
  it('resolves the package through the given require and logs the repair', () => {
    const req = {
      resolve: vi.fn(() => path.join(PKG, 'package.json')),
    } as unknown as NodeJS.Require;
    const log = { info: vi.fn(), warn: vi.fn() };
    const fs = fakeFs({ [PREBUILT]: 0o100644 });
    expect(repairNodePtySpawnHelper(req, log, { ...darwin, fs }).status).toBe('repaired');
    expect(req.resolve).toHaveBeenCalledWith('node-pty/package.json');
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining(PREBUILT));
  });

  it('does not throw when node-pty cannot be resolved', () => {
    const req = {
      resolve: vi.fn(() => {
        throw new Error('MODULE_NOT_FOUND');
      }),
    } as unknown as NodeJS.Require;
    expect(repairNodePtySpawnHelper(req, undefined, darwin).status).toBe('not-applicable');
  });
});
