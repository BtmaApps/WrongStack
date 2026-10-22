import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The bash/pwsh kill guard must protect the RUNNING WrongStack runtime by image
 * name even when the persistent process registry holds no live entry — the rule
 * exec-kill-guard already applies ("the guard runs inside the current WrongStack
 * process, which may not have been written to the registry yet … a broad
 * image-name kill matching the current runtime would therefore kill WrongStack
 * even when the registry is empty"). isKillProtected consulted only registry
 * entries and the literal `wrongstack` / `node` substrings, so
 * `taskkill /IM bun.exe`, `Stop-Process -Name bun` and `tskill bun` — the very
 * runtime of this process — walked past it while exec blocked all three.
 *
 * The registry is mocked EMPTY and process.execPath is pinned, so the verdicts
 * depend on nothing but the runtime image. Both platform branches run on every
 * host by mocking `node:os` (the guard fixes its platform at module load).
 */

vi.mock('../src/process-registry-persistent.js', () => ({
  getPersistentProcessRegistry: () => ({
    shouldBlockKill: async () => false,
    getAllProtectedPids: async () => [],
    getGlobalStatus: async () => ({ instances: new Map() }),
  }),
}));

const realExecPath = process.execPath;

async function loadGuard(platform: 'linux' | 'darwin' | 'win32') {
  vi.resetModules();
  vi.doMock('node:os', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:os')>();
    const patched = { ...actual, platform: () => platform };
    return { ...patched, default: patched };
  });
  return import('../src/bash-kill-guard.js');
}

function pinRuntime(image: string): void {
  Object.defineProperty(process, 'execPath', {
    value: path.join(path.dirname(realExecPath), image),
    configurable: true,
    writable: true,
  });
}

beforeEach(() => pinRuntime('bun.exe'));
afterEach(() => {
  Object.defineProperty(process, 'execPath', {
    value: realExecPath,
    configurable: true,
    writable: true,
  });
  vi.doUnmock('node:os');
});

describe('bash-kill-guard — protects the running runtime image (empty registry)', () => {
  it.each(['linux', 'darwin'] as const)(
    'protects PowerShell targets on %s without launching a kill command',
    async (platform) => {
      const { checkAndBlockKillCommand } = await loadGuard(platform);
      for (const command of [
        `Stop-Process -Id ${process.pid}`,
        `Stop-Process -Id:${process.ppid} -Force`,
        `spps ${process.pid} -Force`,
        `kill -Id ${process.pid}`,
        `pwsh -NoProfile -Command "Stop-Process -Id ${process.pid}"`,
        `pwsh -Command "kill ${process.pid}"`,
        'Stop-Process -Name bun',
        'spps -Name bun',
        'pwsh -Command "Stop-Process -Name bun"',
      ]) {
        expect((await checkAndBlockKillCommand(command)).blocked, command).toBe(true);
      }
    },
  );

  it.each(['linux', 'darwin'] as const)(
    'preserves unrelated targets and POSIX protection on %s',
    async (platform) => {
      const { checkAndBlockKillCommand } = await loadGuard(platform);
      expect((await checkAndBlockKillCommand(`kill -9 ${process.pid}`)).blocked).toBe(true);
      for (const command of [
        'Stop-Process -Id 2147483646',
        'Stop-Process -Name unrelated-test-image',
        'kill -9 2147483646',
        'Write-Output hello',
      ]) {
        expect((await checkAndBlockKillCommand(command)).blocked, command).toBe(false);
      }
    },
  );

  it.each([
    'taskkill /F /IM bun.exe',
    'taskkill /F /IM bun',
    'taskkill /F /IM BUN.EXE',
    'taskkill /IM:bun.exe /F',
    'taskkill /F /FI "IMAGENAME eq bun.exe"',
    'Stop-Process -Name bun',
    'Stop-Process -Name bun -Force',
    'Stop-Process -Name:bun',
    'Stop-Process -Name BUN',
    'tskill bun',
    'tskill /A bun',
    'taskkill /F /IM bu*',
    'Stop-Process -Name bu*',
    'taskkill /F /IM *',
    'true; taskkill /F /IM bun.exe',
  ])('blocks %s', async (command) => {
    const { checkAndBlockKillCommand } = await loadGuard('win32');
    const result = await checkAndBlockKillCommand(command);
    expect(result.blocked).toBe(true);
  });

  it.each(['pkill bun', 'pkill -9 bun', 'killall bun', 'true && pkill bun'])(
    'blocks POSIX %s',
    async (command) => {
      const { checkAndBlockKillCommand } = await loadGuard('linux');
      expect((await checkAndBlockKillCommand(command)).blocked).toBe(true);
    },
  );

  it('follows the runtime that is actually running', async () => {
    pinRuntime('node.exe');
    const { checkAndBlockKillCommand } = await loadGuard('win32');
    expect((await checkAndBlockKillCommand('taskkill /F /IM node.exe')).blocked).toBe(true);
    // bun is not this process's runtime any more, and the registry is empty
    expect((await checkAndBlockKillCommand('taskkill /F /IM bun.exe')).blocked).toBe(false);
  });

  it.each([
    'taskkill /F /IM notepad.exe',
    'taskkill /F /IM bunny.exe',
    'taskkill /F /IM mybun.exe',
    'Stop-Process -Name notepad',
    'Stop-Process -Name mybun',
    'Stop-Process -Name bunny',
    'tskill notepad',
    'taskkill /F /PID 4242',
  ])('still allows %s', async (command) => {
    const { checkAndBlockKillCommand } = await loadGuard('win32');
    expect((await checkAndBlockKillCommand(command)).blocked).toBe(false);
  });

  it('keeps the hard `wrongstack` name block', async () => {
    const { checkAndBlockKillCommand } = await loadGuard('win32');
    for (const command of ['taskkill /F /IM wrongstack.exe', 'Stop-Process -Name wrongstack']) {
      expect((await checkAndBlockKillCommand(command)).blocked).toBe(true);
    }
  });

  it('agrees with the exec guard on the runtime image', async () => {
    const { checkAndBlockKillCommand } = await loadGuard('win32');
    const { checkExecKillCommand } = await import('../src/exec-kill-guard.js');
    for (const [cmd, args] of [
      ['taskkill', ['/F', '/IM', 'bun.exe']],
      ['Stop-Process', ['-Name', 'bun']],
      ['tskill', ['bun']],
    ] as const) {
      const exec = (await checkExecKillCommand(cmd, [...args])).blocked;
      const bash = (await checkAndBlockKillCommand(`${cmd} ${args.join(' ')}`)).blocked;
      expect({ cmd, exec, bash }).toEqual({ cmd, exec: true, bash: true });
    }
  });
});
