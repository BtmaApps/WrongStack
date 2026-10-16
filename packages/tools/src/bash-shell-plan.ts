import { type BashShell, pickShell, shellArgs, wrapPowerShellScript } from './_shell-pick.js';
import { resolvePowerShell } from './_win32-resolve.js';
import { hermeticPosixArgv } from './bash-hermetic.js';

export type ShellPlan = {
  /** Binary path passed to spawn(). */
  bin: string;
  /** argv prefix (everything except the inline command). */
  argv: readonly string[];
  /** Command payload appended to argv. PowerShell requires UTF-16LE Base64. */
  commandArg: string;
  /** Pass argv to CreateProcess untouched (cmd.exe does not read `\"`). */
  verbatim?: boolean;
};

/**
 * Shell selection:
 *   - POSIX: existing behavior — `WRONGSTACK_SHELL` override, else `$SHELL`
 *     if it names an allowlisted shell, else `/bin/bash`. cmd.exe-style
 *     semantics don't apply on POSIX.
 *   - Windows: delegate to `pickShell`, which honours `WRONGSTACK_SHELL`
 *     (when set to cmd|powershell|pwsh), auto-detects PowerShell-style
 *     commands (so Codex-style `Get-Content`/`Set-Location`/etc. work
 *     without forcing every user to set an env var), and falls back to
 *     `cmd.exe` for legacy scripts. The `BashShell` sentinel is then
 *     mapped to the actual binary path below.
 *
 * The user-controllable `SHELL` and `COMSPEC` env vars are NOT trusted
 * — a user (or another agent) could point them at an arbitrary binary on
 * shared systems. Only `WRONGSTACK_SHELL` (and the hard-coded defaults
 * in `_shell-pick.ts` / this block) are honoured.
 *
 * `winShellKind` is the resolved Windows shell kind, so the post-failure
 * bash-ism diagnosis can speak the right shell's syntax; undefined on POSIX
 * (no diagnosis there — bash idioms are correct).
 */
export function resolveBashShellPlan(
  command: string,
  { isWin, hermetic }: { isWin: boolean; hermetic: boolean },
): { plan: ShellPlan; winShellKind: BashShell | undefined } {
  if (isWin) {
    const shell: BashShell = pickShell('win32', command, {
      get: (k) => process.env[k],
    });
    // Resolve a sensible default binary. `pickShell` decided the shell
    // kind, but the actual spawn uses a real path:
    //   - 'cmd'         → COMSPEC or `cmd.exe`. The user can override
    //                    via WRONGSTACK_SHELL=cmd (already handled by
    //                    pickShell).
    //   - 'powershell'  → `powershell.exe` (Windows PS 5.1).
    //   - 'pwsh'        → `pwsh.exe` (PS 7+) if installed, else fall
    //                    back to `powershell.exe`. We don't probe the
    //                    filesystem here; _win32-resolve.ts does the
    //                    PATHEXT walk at spawn time and surfaces ENOENT
    //                    cleanly if PowerShell is not installed.
    // `resolvePowerShell` walks PATH/PATHEXT to find the binary (PS 7 is
    // not always on PATH; legacy PS 5.1 is in System32). For 'cmd' we let
    // Node's own PATH search handle COMSPEC — `cmd.exe` is always on
    // System32 which is in PATH by default.
    const bin =
      shell === 'powershell'
        ? resolvePowerShell('powershell.exe')
        : shell === 'pwsh'
          ? resolvePowerShell('pwsh.exe')
          : (process.env['COMSPEC'] ?? 'cmd.exe');
    // cmd.exe runs as `cmd /s /c "<command>"`, verbatim — the way Node's
    // own `shell: true` does it. Node's default argv quoting escapes an
    // inner `"` as `\"`, which cmd.exe does not understand, so any command
    // with a quoted argument (`node -e "..."`, `cd "a b"`) broke apart.
    const isCmd = shell === 'cmd';
    const plan: ShellPlan = isCmd
      ? {
          bin,
          // `cmd /d` skips the AutoRun registry commands.
          argv: [...(hermetic ? ['/d'] : []), '/s', ...shellArgs(shell)],
          commandArg: `"${command}"`,
          verbatim: true,
        }
      : {
          bin,
          // PowerShell already runs with -NoProfile.
          argv: shellArgs(shell),
          commandArg: Buffer.from(wrapPowerShellScript(command), 'utf16le').toString('base64'),
        };
    return { plan, winShellKind: shell };
  } else {
    // POSIX: use WRONGSTACK_SHELL if set; else honor $SHELL only when it
    // names an allowlisted shell (bash/zsh/sh/dash/fish); else /bin/bash.
    const explicit = process.env['WRONGSTACK_SHELL'];
    let bin: string;
    if (explicit) bin = explicit;
    else {
      const fromEnv = process.env['SHELL'];
      if (fromEnv) {
        const name = fromEnv.split('/').pop() ?? '';
        if (['bash', 'zsh', 'sh', 'dash', 'fish'].includes(name)) bin = fromEnv;
        else bin = '/bin/bash';
      } else bin = '/bin/bash';
    }
    return {
      plan: { bin, argv: hermetic ? hermeticPosixArgv(bin) : ['-c'], commandArg: command },
      winShellKind: undefined,
    };
  }
}
