/**
 * Additional coverage for bash-kill-guard.ts — parseKillCommand branch
 * coverage for taskkill, Stop-Process, kill, and kill-script patterns.
 * Platform-aware: pkill/killall are POSIX-only, wmic patterns vary.
 */
import * as os from 'node:os';
import { describe, expect, it } from 'vitest';
import { parseKillCommand } from '../src/bash-kill-guard.js';

const isWin = os.platform() === 'win32';

describe('parseKillCommand', () => {
  // ── taskkill (Windows) ─────────────────────────────────────────────────

  // taskkill is Windows-only
  it.runIf(isWin)('parses taskkill /PID with /F', () => {
    const result = parseKillCommand('taskkill /PID 1234 /F');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
  });

  // taskkill is Windows-only
  it.runIf(isWin)('parses taskkill /IM by image name', () => {
    const result = parseKillCommand('taskkill /IM node.exe /F');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('node.exe');
  });

  // ── tskill ─────────────────────────────────────────────────────────────

  // tskill is Windows-only
  it.runIf(isWin)('parses tskill with PID', () => {
    const result = parseKillCommand('tskill 5678');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(5678);
  });

  // ── Stop-Process (PowerShell) ──────────────────────────────────────────

  // Stop-Process is Windows-only
  it.runIf(isWin)('parses Stop-Process -Id', () => {
    const result = parseKillCommand('Stop-Process -Id 1234 -Force');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
  });

  // Stop-Process is Windows-only
  it.runIf(isWin)('parses Stop-Process -Id:<pid> colon-attached', () => {
    const result = parseKillCommand('Stop-Process -Id:1234 -Force');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
  });

  // Stop-Process is Windows-only
  it.runIf(isWin)('parses kill -Id:<pid> colon-attached alias', () => {
    const result = parseKillCommand('kill -Id:1234');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
  });

  // Stop-Process is Windows-only
  it.runIf(isWin)('parses Stop-Process -id:<pid> colon-attached lowercase', () => {
    const result = parseKillCommand('Stop-Process -id:1234');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
  });

  // Stop-Process is Windows-only
  it.runIf(isWin)('parses Stop-Process -Name:<name> colon-attached', () => {
    const result = parseKillCommand('Stop-Process -Name:chrome -Force');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('chrome');
  });

  // Stop-Process is Windows-only
  it.runIf(isWin)('parses powershell-wrapped Stop-Process -Id (implicit -Command)', () => {
    const result = parseKillCommand('powershell Stop-Process -Id 1234');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
  });

  // Stop-Process is Windows-only
  it.runIf(isWin)('parses powershell-wrapped Stop-Process with launcher flags', () => {
    const result = parseKillCommand(
      'powershell -NoProfile -ExecutionPolicy Bypass Stop-Process -Id 1234',
    );
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
  });

  // Stop-Process is Windows-only
  it.runIf(isWin)('parses powershell -command with unquoted payload', () => {
    const result = parseKillCommand('powershell -command stop-process -id 1234');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
  });

  // Stop-Process is Windows-only
  it.runIf(isWin)('parses powershell -command with quoted payload', () => {
    const result = parseKillCommand('powershell -command "stop-process -id 1234"');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
  });

  // Stop-Process is Windows-only
  it.runIf(isWin)('parses powershell taskkill wrapper', () => {
    const result = parseKillCommand('powershell taskkill /F /PID 1234');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
    expect(result!.signal).toBe('FORCE');
  });

  // Stop-Process is Windows-only
  it.runIf(isWin)('does not parse a powershell -File script as a kill command', () => {
    expect(parseKillCommand('powershell -File kill-things.ps1')).toBeNull();
  });

  // Stop-Process is Windows-only
  it.runIf(isWin)('parses Stop-Process -Name with process name', () => {
    const result = parseKillCommand('Stop-Process -Name "chrome" -Force');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('chrome');
  });

  // ── kill (POSIX) ───────────────────────────────────────────────────────

  it('parses kill with PID', () => {
    const result = parseKillCommand('kill 1234');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
    expect(result!.signal).toBe('TERM');
  });

  it('parses kill with signal flag', () => {
    const result = parseKillCommand('kill -9 1234');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
    expect(result!.signal).toBe('9');
  });

  it('parses kill -s SIGNAL PID', () => {
    const result = parseKillCommand('kill -s SIGKILL 1234');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
    expect(result!.signal).toBe('SIGKILL');
  });

  // ── pkill / killall (POSIX only) ───────────────────────────────────────

  // pkill is POSIX-only
  it.skipIf(isWin)('parses pkill on POSIX', () => {
    const result = parseKillCommand('pkill node');
    // `not.toBeNull()` alone passed a parser that named the WRONG process — for
    // a guard deciding whether a kill targets WrongStack, the target is the
    // whole point. Values follow the parser's own capture (`pkill <name>`).
    expect(result).toMatchObject({ name: 'node', signal: 'TERM', isAllKill: false });
  });

  // killall is POSIX-only
  it.skipIf(isWin)('parses killall on POSIX', () => {
    const result = parseKillCommand('killall node');
    // `not.toBeNull()` alone passed a parser that named the WRONG process — for
    // a guard deciding whether a kill targets WrongStack, the target is the
    // whole point. Values follow the parser's own capture (`killall <name>`).
    expect(result).toMatchObject({ name: 'node', signal: 'TERM', isAllKill: false });
  });

  // ── kill scripts ───────────────────────────────────────────────────────

  // .ps1 scripts are Windows-only
  it.runIf(isWin)('parses kill script (.ps1)', () => {
    const result = parseKillCommand('kill-process.ps1 -pid 1234');
    expect(result?.name).toBe('kill-script');
  });

  it('parses kill script (.sh)', () => {
    const result = parseKillCommand('./kill-server.sh');
    expect(result?.name).toBe('kill-script');
  });

  // .bat scripts are Windows-only
  it.runIf(isWin)('parses kill script (.bat)', () => {
    const result = parseKillCommand('terminate-all.bat');
    expect(result?.name).toBe('kill-script');
  });

  // .cmd scripts are Windows-only
  it.runIf(isWin)('parses kill script (.cmd)', () => {
    const result = parseKillCommand('stop-services.cmd');
    expect(result?.name).toBe('kill-script');
  });

  // Negative control for the kill-script branch. Recognition is by NAME, so an
  // ordinary script must NOT be classified as a kill — otherwise the guard
  // would block routine `./build.sh` / `deploy.ps1` runs. Every test above
  // asserted only non-null, which could not tell over-matching from matching.
  it.each([['build.sh'], ['./deploy.ps1'], ['setup.bat'], ['test-runner.cmd']])(
    'does not classify ordinary script %j as a kill script',
    (cmd) => {
      expect(parseKillCommand(cmd)?.name).not.toBe('kill-script');
    },
  );

  // ── wmic (Windows) ──────────────────────────────────────────────────

  // wmic is Windows-only
  it.runIf(isWin)('parses wmic process where "name=..." delete', () => {
    const result = parseKillCommand('wmic process where "name=\'node.exe\'" delete');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('node.exe');
  });

  // wmic is Windows-only
  it.runIf(isWin)('parses wmic process where "ProcessId=N" delete (issue #360)', () => {
    const result = parseKillCommand('wmic process where "ProcessId=1234" delete');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
    expect(result!.signal).toBe('FORCE');
  });

  // wmic is Windows-only
  it.runIf(isWin)('parses unquoted wmic ProcessId form (issue #360)', () => {
    const result = parseKillCommand('wmic process where ProcessId=1234 delete');
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(1234);
  });

  // ── non-kill commands ──────────────────────────────────────────────────

  it('returns null for non-kill commands', () => {
    expect(parseKillCommand('ls -la')).toBeNull();
    expect(parseKillCommand('echo hello')).toBeNull();
    expect(parseKillCommand('node app.js')).toBeNull();
    expect(parseKillCommand('npm run build')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseKillCommand('')).toBeNull();
  });

  it('returns null for commands containing kill as substring', () => {
    expect(parseKillCommand('skillful coding')).toBeNull();
    expect(parseKillCommand('npm install kill-package')).toBeNull();
  });
});
