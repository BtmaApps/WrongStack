import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A POSIX `kill` signals every numeric operand and only reports the rest as
 * errors, so `kill -9 <pid> junk` kills <pid>. Such a form does not parse (the
 * parser keeps non-PID forms unparsed), and the guard used to let it through —
 * a trailing `/usr/bin/pwsh -c …` additionally sent it to the PowerShell
 * parser, because the launcher pattern matched a pwsh path anywhere.
 */

const { PROTECTED_PID } = vi.hoisted(() => ({ PROTECTED_PID: 424_242 }));

vi.mock('../src/process-registry-persistent.js', () => ({
  getPersistentProcessRegistry: () => ({
    shouldBlockKill: async (pid: number) => pid === PROTECTED_PID,
    getAllProtectedPids: async () => [PROTECTED_PID],
    getGlobalStatus: async () => ({
      instances: new Map([
        [
          'instance-1',
          [
            {
              pid: PROTECTED_PID,
              name: 'wrongstack-daemon',
              protected: true,
              lastHeartbeat: Date.now(),
            },
          ],
        ],
      ]),
    }),
  }),
}));

async function loadGuard() {
  vi.resetModules();
  vi.doMock('node:os', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:os')>();
    const patched = { ...actual, platform: () => 'linux' };
    return { ...patched, default: patched };
  });
  return import('../src/bash-kill-guard.js');
}

afterEach(() => {
  vi.doUnmock('node:os');
});

describe('bash-kill-guard — unparsed POSIX kill operands', () => {
  it.each([
    `kill -9 ${PROTECTED_PID} abc`,
    `kill -9 ${PROTECTED_PID} /usr/bin/pwsh -c Get-Date`,
    `kill ${PROTECTED_PID} x/pwsh -c Get-Date`,
    `true; kill -9 ${PROTECTED_PID} junk`,
  ])('blocks %j', async (command) => {
    const { checkAndBlockKillCommand } = await loadGuard();
    const result = await checkAndBlockKillCommand(command);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain(String(PROTECTED_PID));
  });

  it.each(['kill -9 111 abc', 'kill %1', 'kill $PID', 'kill -l'])(
    'does not block %j',
    async (command) => {
      const { checkAndBlockKillCommand } = await loadGuard();
      expect((await checkAndBlockKillCommand(command)).blocked).toBe(false);
    },
  );
});

describe('stripPowerShellLauncherHead — the launcher is the first token', () => {
  it.each(['kill -9 1234 /usr/bin/pwsh -c Get-Date', 'echo x/pwsh -c Stop-Process -Id 1'])(
    'finds no launcher in %j',
    async (command) => {
      const { stripPowerShellLauncherHead } = await import('../src/bash-kill-detect.js');
      expect(stripPowerShellLauncherHead(command)).toBeNull();
    },
  );

  it.each([
    'pwsh -c Stop-Process -Id 1234',
    '/usr/bin/pwsh -c Stop-Process -Id 1234',
    '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -c Stop-Process -Id 1234',
    "& 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' -c Stop-Process -Id 1234",
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile Stop-Process -Id 1234',
  ])('strips %j', async (command) => {
    const { stripPowerShellLauncherHead } = await import('../src/bash-kill-detect.js');
    expect(stripPowerShellLauncherHead(command)).toBe('Stop-Process -Id 1234');
  });
});
