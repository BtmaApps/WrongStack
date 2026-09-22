import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Plain, non-obfuscated kill forms the bash/pwsh guard must block when they
 * name a protected PID: several targets, the `--` end-of-options marker, and a
 * kill sequenced behind another command. Both platform branches are exercised
 * on every host by mocking `node:os`, because the guard fixes its platform at
 * module load (the older POSIX suites are skipped on Windows runners).
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

async function loadGuard(platform: 'linux' | 'win32') {
  vi.resetModules();
  vi.doMock('node:os', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:os')>();
    const patched = { ...actual, platform: () => platform };
    return { ...patched, default: patched };
  });
  return import('../src/bash-kill-guard.js');
}

afterEach(() => {
  vi.doUnmock('node:os');
});

const P = PROTECTED_PID;

describe('bash-kill-guard — POSIX targets', () => {
  it.each([
    [`kill 111 ${P}`, { pid: 111, pids: [111, P], signal: 'TERM', isGroupKill: false }],
    [`kill -9 ${P} 111`, { pid: P, pids: [P, 111], signal: '9', isGroupKill: false }],
    [`kill -- ${P}`, { pid: P, signal: 'TERM', isGroupKill: false }],
    [`kill -s KILL -- ${P}`, { pid: P, signal: 'KILL', isGroupKill: false }],
    [`kill -n 9 ${P}`, { pid: P, signal: '9', isGroupKill: false }],
    ['kill -123', { pid: 123, signal: 'TERM', isGroupKill: true }],
    ['kill -9 -- -555 777', { pid: 555, pids: [555, 777], signal: '9', isGroupKill: true }],
  ])('parses %j', async (command, expected) => {
    const { parseKillCommand } = await loadGuard('linux');
    const parsed = parseKillCommand(command);
    expect(parsed).toMatchObject({ ...expected, isAllKill: false });
    if (!('pids' in expected)) expect(parsed?.pids).toBeUndefined();
  });

  // `kill -9` with no target is NOT listed: like the regex it replaced, the
  // parser reads a lone `-N` as process group N, which blocks conservatively.
  it.each(['kill -l', 'kill %1', 'kill $PID', 'kill -s', 'kill --', 'kill 12 abc', 'kill -s 9'])(
    'leaves non-PID form %j unparsed',
    async (command) => {
      const { parseKillCommand } = await loadGuard('linux');
      expect(parseKillCommand(command)).toBeNull();
    },
  );

  it.each([
    `kill 111 ${P}`,
    `kill -9 111 222 ${P}`,
    `kill -- ${P}`,
    `kill -s TERM -- ${P}`,
    `kill ${process.pid}`,
    `true; kill ${P}`,
    `echo ok && kill -9 ${P}`,
    `false || kill ${P}`,
    `sleep 1 & kill ${P}`,
    `echo hi\nkill ${P}`,
    `cd /tmp;kill ${P};ls`,
    `ls 2>&1 && kill ${P}`,
    'kill -9 -- -555',
  ])('blocks %j', async (command) => {
    const { checkAndBlockKillCommand } = await loadGuard('linux');
    const result = await checkAndBlockKillCommand(command);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/protected WrongStack process/);
  });

  it('names every PID target in the block reason', async () => {
    const { checkAndBlockKillCommand } = await loadGuard('linux');
    const result = await checkAndBlockKillCommand(`kill -9 111 ${P}`);
    expect(result.reason).toBe(
      `Blocked: kill (9) PIDs 111, ${P} targets a protected WrongStack process.`,
    );
  });

  it.each([
    'kill 111 222',
    'kill -- 111',
    'true; kill 111',
    `echo "a; kill ${P}"`,
    `echo 'x && kill ${P}'`,
    `echo a\\; kill ${P}`,
    'ls 2>&1 && echo ok',
    'npm test &>out.log',
    '',
  ])('does not block %j', async (command) => {
    const { checkAndBlockKillCommand } = await loadGuard('linux');
    expect(await checkAndBlockKillCommand(command)).toEqual({ blocked: false });
  });

  it('keeps blocking a kill piped into another command as a whole', async () => {
    const { checkAndBlockKillCommand } = await loadGuard('linux');
    const result = await checkAndBlockKillCommand('kill 111 | xargs kill');
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/complex kill pipeline/);
  });

  it('checks a kill inside a sequenced shell -c payload', async () => {
    const { checkAndBlockKillCommand } = await loadGuard('linux');
    expect((await checkAndBlockKillCommand(`bash -c "kill 111 ${P}"`)).blocked).toBe(true);
  });
});

describe('bash-kill-guard — Windows (Git Bash / PowerShell) targets', () => {
  it.each([
    [`kill 111 ${P}`, { pid: 111, pids: [111, P], signal: 'TERM' }],
    [`kill -- ${P}`, { pid: P, signal: 'TERM' }],
    [`kill -s 9 ${P}`, { pid: P, signal: '9' }],
    ['kill -Id 12345', { pid: 12345, signal: 'FORCE' }],
  ])('parses %j', async (command, expected) => {
    const { parseKillCommand } = await loadGuard('win32');
    expect(parseKillCommand(command)).toMatchObject(expected);
  });

  it('still parses PowerShell name forms after the PID parser declines', async () => {
    const { parseKillCommand } = await loadGuard('win32');
    expect(parseKillCommand('kill -Name node')).toMatchObject({ name: 'node' });
    expect(parseKillCommand('kill node')).toMatchObject({ name: 'node' });
  });

  it.each([
    `kill 111 ${P}`,
    `kill -- ${P}`,
    `Get-Date; kill -Id ${P}`,
    `Get-Date; Stop-Process -Id ${P} -Force`,
    `dir && taskkill /PID ${P} /F`,
    `echo x & tskill ${P}`,
  ])('blocks %j', async (command) => {
    const { checkAndBlockKillCommand } = await loadGuard('win32');
    expect((await checkAndBlockKillCommand(command)).blocked).toBe(true);
  });

  it.each(['Stop-Process -Id 111', 'Get-Date; kill 111 222', `Write-Output "x; kill ${P}"`])(
    'does not block %j',
    async (command) => {
      const { checkAndBlockKillCommand } = await loadGuard('win32');
      expect((await checkAndBlockKillCommand(command)).blocked).toBe(false);
    },
  );
});

describe('bash-kill-guard — launcher-wrapped verbs (win32)', () => {
  // powershell.exe binds the first positional argument as -Command (documented
  // default), so the kill verb hides behind the launcher head with no -Command
  // flag. The guard must classify the effective command, not the head.
  it.each([
    `powershell Stop-Process -Id ${P}`,
    `powershell -command stop-process -id ${P}`,
    `powershell taskkill /F /PID ${P}`,
  ])('blocks %j', async (command) => {
    const { checkAndBlockKillCommand } = await loadGuard('win32');
    const result = await checkAndBlockKillCommand(command);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/protected WrongStack process/);
  });

  it.each(['powershell -File kill-things.ps1', `powershell Stop-Process -Id 111`])(
    'does not block %j',
    async (command) => {
      const { checkAndBlockKillCommand } = await loadGuard('win32');
      expect((await checkAndBlockKillCommand(command)).blocked).toBe(false);
    },
  );
});
