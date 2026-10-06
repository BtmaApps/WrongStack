/** Windows kill-command parsing for the bash kill guard (taskkill, tskill, Stop-Process, WMIC). */

import {
  type KillCommand,
  parsePosixKillTargets,
  SCRIPT_KILL_RE,
  stripPowerShellLauncherHead,
} from './bash-kill-detect.js';

/** Parse a Windows (or Git Bash / WSL `kill`) command; null when it names no target. */
export function parseWindowsKillCommand(command: string, input: string): KillCommand | null {
  let normalized = input;
  // PowerShell binds the first positional argument as -Command (documented
  // default), so `powershell Stop-Process -Id 123` hides the verb behind
  // the launcher head. Rebind to the effective command for every
  // verb-anchored branch below; null means opaque/no inner command.
  const strippedLauncher = stripPowerShellLauncherHead(normalized);
  if (strippedLauncher !== null) normalized = strippedLauncher;
  const hasTaskkillForce = /(?:^|\s)\/F(?=\s|$)/i.test(normalized);

  // ── taskkill /PID 1234 or taskkill /F /PID 1234 ──────────────────
  // Locate the target independently of flag order/arguments (`/T`, `/FI ...`).
  // Shell control operators stay unparsed so the conservative pipeline path runs.
  const isSimpleTaskkill = /^taskkill\s+/i.test(normalized) && !/[|&<>]/.test(normalized);
  // `/PID:1234` (colon-attached) binds identically to `/PID 1234`.
  const taskkillPidMatch = isSimpleTaskkill
    ? normalized.match(/(?:^|\s)\/PID(?::(\d+)|\s+(\d+))(?=\s|$)/i)
    : null;
  const taskkillPidValue = taskkillPidMatch?.[1] ?? taskkillPidMatch?.[2];
  if (taskkillPidValue) {
    return {
      pid: parseInt(taskkillPidValue, 10),
      signal: hasTaskkillForce ? 'FORCE' : 'TERM',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  // ── taskkill /F /IM node.exe (image-name-based broad kill) ──────
  // taskkill also binds the colon-attached value form `/IM:node.exe`
  // (live-verified: exit 128 "process not found" — syntax accepted, image
  // lookup performed), so both spellings are extracted, mirroring the
  // Stop-Process -Id:<pid> handling below.
  const taskkillImMatch = isSimpleTaskkill
    ? normalized.match(/(?:^|\s)\/IM(?::([^\s/]+)|\s+([^\s/]+))(?=\s|$)/i)
    : null;
  const taskkillImName = taskkillImMatch?.[1] ?? taskkillImMatch?.[2];
  if (taskkillImName) {
    return {
      name: taskkillImName,
      signal: hasTaskkillForce ? 'FORCE' : 'TERM',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  // ── taskkill /FI "IMAGENAME eq node.exe" (filter-based name kill) ──
  // /FI uses a quoted filter string instead of /IM. Extract the process
  // name after the `IMAGENAME eq` clause — the most common taskkill filter.
  const taskkillFiMatch = isSimpleTaskkill
    ? normalized.match(/(?:^|\s)\/FI\s+"IMAGENAME\s+eq\s+([^"]+)"(?=\s|$)/i)
    : null;
  if (taskkillFiMatch?.[1]) {
    return {
      name: taskkillFiMatch[1],
      signal: hasTaskkillForce ? 'FORCE' : 'TERM',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  // ── tskill PID ──────────────────────────────────────────────────
  const tskillMatch = normalized.match(/^tskill\s+(\d+)/i);
  if (tskillMatch?.[1]) {
    return {
      pid: parseInt(tskillMatch[1], 10),
      signal: 'TERM',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  // ── PowerShell Stop-Process -Id 1234 / kill -Id 1234 ─────────────
  // This must precede the POSIX signal form so `kill -Id` is not mistaken
  // for a signal named ID. PowerShell also binds the colon-attached value
  // form `-Id:1234` identically (live-verified kill, round
  // r-20260922-exec-killguard-colon-attached), so both the shape and the
  // value extraction accept `:<digits>` as well as the space form.
  const isStopProcIdCommand =
    /^(?:stop-process|kill|spps)(?:\s+-(?:id|pid)(?:\s+\d+|:\d+)|\s+-[a-zA-Z]+(?::[^\s]+)?)+$/i.test(
      normalized,
    );
  const stopProcIdMatch = normalized.match(/(?:^|\s)-(?:id|pid)(?::(\d+)|\s+(\d+))(?=\s|$)/i);
  const stopProcId = stopProcIdMatch?.[1] ?? stopProcIdMatch?.[2];
  if (isStopProcIdCommand && stopProcId) {
    return {
      pid: parseInt(stopProcId, 10),
      signal: 'FORCE',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  // ── Git Bash / WSL: kill [-9|-TERM|-s SIG] [--] 12345 [67890 ...] ──
  // This branch must precede name parsing so a numeric target stays a PID.
  const gitBashKill = parsePosixKillTargets(normalized, command);
  if (gitBashKill) return gitBashKill;

  // ── PowerShell Stop-Process -Name "node" (multi-char name) ─────────
  // Uses greedier capture with end anchor to grab the full name. Also
  // accepts the colon-attached form `-Name:node`, which PowerShell binds
  // identically to the space form.
  // `*`, `?`, `[`/`]` are PowerShell wildcards (`-Name nod*`); excluding
  // them left a wildcard kill unparsed and therefore unblocked.
  const stopProcNameMatch = normalized.match(
    /^(?:stop-process|kill|spps)\s+-(?:name|nam|na|n)(?::([a-zA-Z0-9_.*?[\]-]+)|\s+(?:['"]([a-zA-Z0-9_.*?[\]-]+)['"]|([a-zA-Z0-9_.*?[\]-]+)))(?:\s|$)/i,
  );
  const stopProcName = stopProcNameMatch?.[1] ?? stopProcNameMatch?.[2] ?? stopProcNameMatch?.[3];
  if (stopProcName) {
    return {
      name: stopProcName,
      signal: 'FORCE',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  // ── Bare name via PowerShell alias: kill node, stop-process node ──
  const stopProcStandalone = normalized.match(
    /^(?:stop-process|kill|spps)\s+['"]?([a-zA-Z][a-zA-Z0-9_.*?[\]-]+|[*?[][a-zA-Z0-9_.*?[\]-]*)['"]?$/i,
  );
  if (stopProcStandalone?.[1]) {
    return {
      name: stopProcStandalone[1],
      signal: 'FORCE',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  // ── WMIC process where "name='node.exe'" delete ────────────────────
  // Quote-stripping: capture everything between name=' and the next quote
  const wmicMatch = normalized.match(
    /^wmic\s+process\s+where\s+['"]?(?:name\s*=\s*['"]?)([a-zA-Z0-9_.-]+)/i,
  );
  if (wmicMatch?.[1]) {
    return {
      name: wmicMatch[1],
      signal: 'FORCE',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  // ── WMIC process where "ProcessId=1234" delete ─────────────────────
  // Issue #360: the name= branch above misses PID-targeted wmic deletes;
  // extract the ProcessId so it flows through the same protected-PID check
  // (isKillProtected -> registry.shouldBlockKill) as taskkill /PID.
  const wmicPidMatch = normalized.match(
    /^wmic\s+process\s+where\s+['"]?processid\s*=\s*['"]?(\d+)/i,
  );
  if (wmicPidMatch?.[1]) {
    return {
      pid: parseInt(wmicPidMatch[1], 10),
      signal: 'FORCE',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  // ── Scripts named kill*.ps1, kill*.bat, kill*.cmd, kill*.sh ──────
  // Blocked conservatively — we can't inspect script contents. Uses
  // SCRIPT_KILL_RE which ends with (?:\s|$) so zero-arg scripts match.
  // Signal is FORCE (matching other name-based windows branches) since
  // isKillProtected always returns true for the "kill-script" sentinel.
  const killScriptMatch = normalized.match(SCRIPT_KILL_RE);
  if (killScriptMatch) {
    return {
      name: 'kill-script', // sentinel — isKillProtected always blocks "kill-script"
      signal: 'FORCE',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  return null;
}
