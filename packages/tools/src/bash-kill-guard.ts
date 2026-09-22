/**
 * Bash Kill Guard — Intercepts bash kill commands and prevents them from
 * terminating WrongStack processes (either the agent itself or child processes
 * it has spawned).
 *
 * This module hooks into the bash tool's command parsing to detect and block
 * dangerous kill commands targeting protected PIDs.
 *
 * Handles:
 * - Direct kill commands: kill -9 12345, kill -- 12345, kill 111 12345 (every target)
 * - Sequenced commands: `true; kill 12345`, `a && kill 12345`, `a || kill 12345`,
 *   `a & kill 12345`, newline-separated — each segment is checked on its own
 * - Shell -c wrapped: bash -c "kill -9 12345" (any shell path — see P2 #10)
 * - Full path kills: /bin/kill -9 12345
 * - Name-based kills: pkill, killall, pgrep
 * - Windows equivalents: taskkill, tskill
 * - PowerShell Stop-Process / kill alias: Stop-Process -Name node, kill -Id 12345
 * - WMIC process termination: wmic process where "name='node.exe'" delete
 *   or wmic process where "ProcessId=1234" delete
 * - Script-based kill (script is named kill*.sh, kill*.ps1, kill*.bat)
 *
 * Security contract: every "Handles" bullet must map to both a detector
 * AND a block path in isKillRelatedCommand + parseKillCommand + isKillProtected.
 * Script-based kills are blocked conservatively (can't inspect script content).
 *
 * Known bypasses (NOT handled — this is a static regex parser, not a shell):
 * Static analysis of shell strings is inherently defeatable by obfuscation.
 * This guard is one defense-in-depth layer behind the permission policy and
 * the project-escape checks, not the sole gate. Treat a miss here as expected,
 * not as a hole to plug with ever-more-clever regexes. The patterns below are
 * known to evade detection:
 * - Base64 / decode pipes: `echo bCAtOSAxMjM0NQ== | base64 -d | sh`
 * - Variable indirection: `sig=-9; target=12345; kill $sig $target`
 * - Command substitution: `$(printf kill) -9 12345`
 * - String concatenation / quote-splitting: `ki''ll -9 12345`, `k"i"ll 12345`
 * - Aliases and functions: `alias x=kill; x -9 12345`
 * - eval / source: `eval "ki""ll -9 12345"`
 * - node -e eval: `node -e "process.kill(12345)"` (handled by exec-kill-guard.ts)
 * - Scripts not named kill/terminate/stop*: `runkill.sh`, `/tmp/cleanup.bat`
 *
 * Mitigation: rely on the permission policy (confirm/deny gate) and YOLO
 * destructive detection as the primary controls; this guard is a best-effort
 * fast path for the common non-obfuscated forms.
 */

import * as os from 'node:os';
import {
  getPersistentProcessRegistry,
  type PersistentProcessEntry,
} from './process-registry-persistent.js';

const isWin = os.platform() === 'win32';

/** Shared regex: scripts named kill/terminate/stop*.ps1|bat|cmd|sh. */
const SCRIPT_KILL_RE = /^(?:\.\\|\.\/)?(?:kill|terminate|stop)\S*\.(?:ps1|bat|cmd|sh)(?:\s|$)/i;
/** Shared regex: POSIX-only .sh script variant. */
const SCRIPT_KILL_RE_POSIX = /^(?:\.\/)?(?:kill|terminate|stop)\S*\.sh(?:\s|$)/i;
/**
 * Fallback broad check: used in checkAndBlockKillCommand when the parsed
 * kill struct doesn't carry a PID or name, as a last-resort block for
 * unparseable but suspicious script filenames.
 */
const SCRIPT_KILL_FALLBACK_RE = /^\S*(?:kill|terminate|stop)\S*\.(?:ps1|bat|cmd|sh)\b/i;

export interface KillCommand {
  /** First PID target (kept for single-target callers). */
  pid?: number;
  /** Every PID target when the command names more than one (`kill 1 2 3`). */
  pids?: number[];
  name?: string;
  signal?: string;
  isGroupKill: boolean;
  isAllKill: boolean;
  originalCommand: string;
}

export interface KillCheckResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Extract the actual kill command from a shell-wrapped command.
 * e.g., "bash -c 'kill -9 12345'" -> "kill -9 12345"
 * e.g., "/bin/bash -c \"pkill node\"" -> "pkill node"
 *
 * P2 #10 (before-release.md): the path pattern now matches any executable
 * followed by `-c`, not just `/bin` and `/usr/bin`. Real systems often have
 * bash at `/usr/local/bin/bash`, `/opt/homebrew/bin/bash`, or invoke it via
 * `/usr/bin/env bash`. Previously these bypassed the guard entirely.
 */
function extractKillCommand(command: string): string | null {
  const normalized = command.replace(/\s+/g, ' ').trim();

  // Pattern: <any executable path or name> -c "kill ..." or 'kill ...'
  // Matches /bin/bash, /usr/local/bin/bash, /opt/homebrew/bin/bash,
  // /usr/bin/env bash, plain bash/sh/zsh, etc. The executable is any run of
  // non-whitespace, optionally followed by a space and a second token (for
  // the `/usr/bin/env bash` form) before `-c`.
  const shellCMatch = normalized.match(/^.+?\s+-c\s+(['"])([\s\S]+)\1$/);
  if (shellCMatch?.[2]) {
    const inner = shellCMatch[2].trim();
    // Recursively check the inner command
    return isKillRelatedCommand(inner) ? inner : null;
  }

  // Pattern: <executable> -c kill -9 12345 (without quotes)
  const shellCUnquoted = normalized.match(
    /^.+?\s+-c\s+(kill(?:\s+-s\s+[a-zA-Z0-9]+|\s+-[a-zA-Z0-9]+)?\s+\d+)$/,
  );
  if (shellCUnquoted?.[1]) {
    return shellCUnquoted[1];
  }

  return null;
}

/** PowerShell launcher flags that consume their own value (skipped with it). */
const POWERSHELL_LAUNCHER_VALUE_FLAGS = new Set([
  '-executionpolicy',
  '-inputformat',
  '-outputformat',
  '-windowstyle',
  '-version',
  '-configurationname',
  '-settings',
]);

/**
 * PowerShell treats the first POSITIONAL argument as the -Command value
 * (documented default), so `powershell Stop-Process -Id 123` runs the cmdlet
 * with no -Command flag — and every verb-anchored test below only sees the
 * `powershell` head. Returns the effective command with the launcher and its
 * own flags removed, or null when there is no inspectable inner command
 * (-File/-EncodedCommand payloads are opaque; nothing left but launcher flags).
 */
function stripPowerShellLauncherHead(normalized: string): string | null {
  const head = normalized.match(/^(?:.*[\\/])?(?:powershell|pwsh)(?:\.exe)?\s+(.+)$/i);
  if (!head?.[1]) return null;
  const tokens = head[1].split(/\s+/);
  let expectsValue = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    const lower = token.toLowerCase();
    if (expectsValue) {
      expectsValue = false;
      continue;
    }
    if (lower === '-file' || lower.startsWith('-file:')) return null;
    if (lower === '-encodedcommand' || lower.startsWith('-encodedcommand:')) return null;
    if (/^-[a-z0-9]+:\S+$/i.test(token)) continue;
    if (POWERSHELL_LAUNCHER_VALUE_FLAGS.has(lower)) {
      expectsValue = true;
      continue;
    }
    if (lower === '-c' || lower === '-command') {
      const payload = tokens
        .slice(i + 1)
        .join(' ')
        .trim()
        .replace(/^(['"])([\s\S]*)\1$/, '$2')
        .trim();
      return payload.length > 0 ? payload : null;
    }
    if (lower.startsWith('-')) continue;
    return tokens.slice(i).join(' ').trim();
  }
  return null;
}

/**
 * Check if a command string is kill-related (for filtering).
 */
function isKillRelatedCommand(cmd: string): boolean {
  const normalized = cmd.toLowerCase().replace(/\s+/g, ' ').trim();

  // P3 #25 (before-release.md): filter by platform so each platform only
  // checks the kill commands it can actually encounter. On Windows, POSIX
  // kill/pkill/killall are dead code (they don't exist on cmd.exe/pwsh); on
  // POSIX, taskkill/tskill are dead code. This lets a single test suite
  // pass on both platforms without platform-conditional assertions.
  if (isWin) {
    // Windows taskkill
    if (/^taskkill\s/i.test(normalized)) return true;
    // Windows tskill
    if (/^tskill\s/i.test(normalized)) return true;
    // PowerShell Stop-Process and its aliases (kill, stop)
    if (/^(stop-process|kill|stop)\s/i.test(normalized)) return true;
    // WMIC process termination: wmic process where ... delete
    if (/^wmic\s+process\s/i.test(normalized) && /\bdelete\b/i.test(normalized)) return true;
    // Scripts named kill*, terminate*, stop* .ps1, .bat, .cmd, .sh (with or without args)
    if (SCRIPT_KILL_RE.test(normalized)) return true;

    // Launcher-wrapped verbs: powershell/pwsh bind the first positional
    // argument as -Command (documented default), so the kill verb hides
    // behind the launcher head (`powershell Stop-Process -Id 123`). Gate on
    // the effective command instead. -File/-EncodedCommand strip to null
    // (opaque) and stay uninspected, matching the module's obfuscation scope.
    const strippedLauncher = stripPowerShellLauncherHead(normalized);
    if (strippedLauncher !== null) {
      if (/^taskkill\s/i.test(strippedLauncher)) return true;
      if (/^tskill\s/i.test(strippedLauncher)) return true;
      if (/^(stop-process|kill|stop)\s/i.test(strippedLauncher)) return true;
      if (/^wmic\s+process\s/i.test(strippedLauncher) && /\bdelete\b/i.test(strippedLauncher)) {
        return true;
      }
      if (SCRIPT_KILL_RE.test(strippedLauncher)) return true;
    }
    return false;
  }

  // POSIX
  // Direct kill commands
  if (/^kill(\s|$)/.test(normalized)) return true;

  // Name-based kills
  if (/^(pkill|killall|pgrep|skill)\s/.test(normalized)) return true;

  // Process-related commands that might target specific PIDs
  if (/^\/proc\/\d+\/(?:kill|fd)/.test(normalized)) return true;

  // Scripts named kill*, terminate*, stop* .sh (with or without args)
  if (SCRIPT_KILL_RE_POSIX.test(normalized)) return true;

  return false;
}

/**
 * Parse a kill command string to extract PID and signal.
 */
/**
 * `kill [-SIG | -s SIG | -n SIG] [--] target...` where every target is a PID
 * (a negative PID is a process group). A leading `-X` counts as a signal only
 * when a target follows it, so `kill -123` stays a group kill.
 *
 * Returns null for anything else — job specs (`%1`), `kill -l`, variables,
 * names, redirections — so the caller's name parsing and conservative
 * fallbacks still run. The regexes this replaced anchored a single target at
 * the end, which let `kill 111 <protected>` and `kill -- <protected>` through.
 */
function parsePosixKillTargets(normalized: string, command: string): KillCommand | null {
  const tokens = normalized.split(' ');
  if (tokens[0]?.toLowerCase() !== 'kill') return null;
  let i = 1;
  let signal = 'TERM';
  const first = tokens[i];
  if (first !== undefined && /^-[sn]$/i.test(first)) {
    const value = tokens[i + 1];
    if (!value || !/^[a-zA-Z0-9]+$/.test(value)) return null;
    signal = value.toUpperCase();
    i += 2;
  } else if (
    first !== undefined &&
    first !== '--' &&
    /^-[a-zA-Z0-9]+$/.test(first) &&
    tokens.length - i >= 2
  ) {
    signal = first.slice(1).toUpperCase();
    i += 1;
  }
  if (tokens[i] === '--') i += 1;
  const targets = tokens.slice(i);
  if (targets.length === 0 || !targets.every((t) => /^-?\d+$/.test(t))) return null;
  const pids = targets.map((t) => Number.parseInt(t.replace(/^-/, ''), 10));
  return {
    pid: pids[0]!,
    ...(pids.length > 1 ? { pids } : {}),
    signal,
    isGroupKill: targets.some((t) => t.startsWith('-')),
    isAllKill: false,
    originalCommand: command,
  };
}

export function parseKillCommand(command: string): KillCommand | null {
  let normalized = command.replace(/\s+/g, ' ').trim();

  // P3 #25 (before-release.md): skip platform-specific commands that cannot
  // run here. Windows still accepts the common POSIX `kill` forms because
  // Git Bash/WSL can invoke them; only pkill/killall/pgrep remain POSIX-only.
  if (isWin) {
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
    const taskkillPidMatch = isSimpleTaskkill
      ? normalized.match(/(?:^|\s)\/PID\s+(\d+)(?=\s|$)/i)
      : null;
    if (taskkillPidMatch?.[1]) {
      return {
        pid: parseInt(taskkillPidMatch[1], 10),
        signal: hasTaskkillForce ? 'FORCE' : 'TERM',
        isGroupKill: false,
        isAllKill: false,
        originalCommand: command,
      };
    }

    // ── taskkill /F /IM node.exe (image-name-based broad kill) ──────
    const taskkillImMatch = isSimpleTaskkill
      ? normalized.match(/(?:^|\s)\/IM\s+([^\s/]+)(?=\s|$)/i)
      : null;
    if (taskkillImMatch?.[1]) {
      return {
        name: taskkillImMatch[1],
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
      /^(?:stop-process|kill)(?:\s+-(?:id|pid)(?:\s+\d+|:\d+)|\s+-[a-zA-Z]+(?::[^\s]+)?)+$/i.test(
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
    const stopProcNameMatch = normalized.match(
      /^(?:stop-process|kill)\s+-(?:name|n)(?::([a-zA-Z0-9_.-]+)|\s+(?:['"]([a-zA-Z0-9_.-]+)['"]|([a-zA-Z0-9_.-]+)))(?:\s|$)/i,
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
      /^(?:stop-process|kill)\s+['"]?([a-zA-Z][a-zA-Z0-9_.-]+)['"]?$/i,
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

  // POSIX: kill [-9|-TERM|-s SIG] [--] 12345 [-6789 ...]
  const posixKill = parsePosixKillTargets(normalized, command);
  if (posixKill) return posixKill;

  // pkill name or pkill -signal name
  const pkillMatch = normalized.match(/^pkill\s+(?:(-[a-zA-Z]+)\s+)?(.+)$/);
  if (pkillMatch?.[2]) {
    const name = pkillMatch[2];
    const signalMatch = pkillMatch[1];
    return {
      name,
      signal: signalMatch ? signalMatch.slice(1) : 'TERM',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  // killall name or killall -signal name
  const killallMatch = normalized.match(/^killall\s+(?:(-[a-zA-Z]+)\s+)?(.+)$/);
  if (killallMatch?.[2]) {
    const name = killallMatch[2];
    const signalMatch = killallMatch[1];
    return {
      name,
      signal: signalMatch ? signalMatch.slice(1) : 'TERM',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  // pgrep returns PIDs (not a kill, but could be used with kill)
  const pgrepMatch = normalized.match(/^pgrep\s+(.+)$/);
  if (pgrepMatch) {
    // pgrep by itself isn't dangerous, but log it
    return null;
  }

  // Scripts named kill*.sh / terminate*.sh / stop*.sh — same conservative
  // sentinel as the Windows branch. isKillProtected always blocks the
  // "kill-script" sentinel, and isKillProtected's POSIX path already flags
  // these via SCRIPT_KILL_RE_POSIX, so the parser must recognize them too.
  const posixScriptMatch = normalized.match(SCRIPT_KILL_RE_POSIX);
  if (posixScriptMatch) {
    return {
      name: 'kill-script',
      signal: 'FORCE',
      isGroupKill: false,
      isAllKill: false,
      originalCommand: command,
    };
  }

  return null;
}

/**
 * Get all protected process entries from the registry.
 */
async function getProtectedEntries(): Promise<PersistentProcessEntry[]> {
  const registry = getPersistentProcessRegistry();
  const status = await registry.getGlobalStatus();
  const entries: PersistentProcessEntry[] = [];

  for (const instanceEntries of status.instances.values()) {
    for (const entry of instanceEntries) {
      if (entry.protected && Date.now() - entry.lastHeartbeat < 30_000) {
        entries.push(entry);
      }
    }
  }

  return entries;
}

/**
 * Check if a parsed kill command targets a protected WrongStack process.
 */
async function isKillProtected(kill: KillCommand): Promise<boolean> {
  const registry = getPersistentProcessRegistry();

  // Sentinel: kill-script is always blocked (script contents are opaque)
  if (kill.name === 'kill-script') {
    return true;
  }

  // For name-based kills, check if any protected process matches the name
  if (kill.name) {
    const entries = await getProtectedEntries();
    const killNameLower = kill.name.toLowerCase();

    for (const entry of entries) {
      if (entry.name?.toLowerCase().includes(killNameLower)) {
        return true;
      }
    }

    // Also check against our own hostname/process name patterns
    if (killNameLower.includes('wrongstack')) {
      return true;
    }
    if (killNameLower.includes('node') && entries.length > 0) {
      // Conservative: block pkill node if we have protected node processes
      return true;
    }
    return false;
  }

  // For group kills, block if any protected processes exist
  if (kill.isGroupKill) {
    const protectedPids = await registry.getAllProtectedPids();
    return protectedPids.length > 0;
  }

  // PID kill — every target must be checked, not just the first.
  const targets = kill.pids ?? (kill.pid !== undefined ? [kill.pid] : []);
  for (const pid of targets) {
    if (await registry.shouldBlockKill(pid)) return true;
    // Parity with exec-kill-guard: block self/parent even when the
    // persistent registry has no live entry for them.
    if (pid === process.pid || pid === process.ppid) return true;
  }

  return false;
}

/**
 * Main entry point: Check if a bash command contains a kill operation targeting protected PIDs.
 * Returns a result indicating whether to block and why.
 */
export async function checkAndBlockKillCommand(command: string): Promise<KillCheckResult> {
  // The whole command first: shell -c extraction and the pipeline fallback
  // both need to see it unsplit.
  const whole = await checkSingleCommand(command);
  if (whole.blocked) return whole;
  // Then every sequenced segment, so `true; kill <pid>` cannot hide the kill
  // behind a harmless leading command.
  const segments = splitShellSequence(command);
  if (segments.length > 1) {
    for (const segment of segments) {
      const result = await checkSingleCommand(segment);
      if (result.blocked) return result;
    }
  }
  return { blocked: false };
}

/**
 * Split on shell sequencing operators outside quotes: `;`, `&&`, `||`, a
 * background `&`, and newlines. A single `|` is NOT split — a kill piped into
 * another command is handled whole by the conservative pipeline block — and
 * redirections such as `2>&1` / `&>file` are not separators.
 */
function splitShellSequence(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    const next = command[i + 1];
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '\\' && next !== undefined) {
      current += ch + next;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    const isSeparator =
      ch === ';' ||
      ch === '\n' ||
      ch === '\r' ||
      (ch === '|' && next === '|') ||
      (ch === '&' && command[i - 1] !== '>' && next !== '>');
    if (isSeparator) {
      if ((ch === '|' || ch === '&') && next === ch) i++;
      if (current.trim()) segments.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

async function checkSingleCommand(command: string): Promise<KillCheckResult> {
  const normalized = command.replace(/\s+/g, ' ').trim();

  // First, extract any kill command from shell-wrapped commands
  const killCmd =
    extractKillCommand(normalized) || (isKillRelatedCommand(normalized) ? normalized : null);

  if (!killCmd) {
    return { blocked: false };
  }

  const parsed = parseKillCommand(killCmd);
  if (!parsed) {
    // It's kill-related but couldn't parse - conservative approach
    // e.g., complex pipelines involving kill
    if (killCmd.includes('kill') && /kill\s+.*\|/.test(killCmd)) {
      // kill piped to something - might be "pkill node | xargs kill"
      return {
        blocked: true,
        reason: `Blocked: complex kill pipeline detected — "${killCmd.slice(0, 50)}..."`,
      };
    }
    // Script-based kill (named kill*.ps1, kill*.bat, kill*.cmd, kill*.sh)
    // detected by isKillRelatedCommand but couldn't parse PID/name — block
    // conservatively because script contents are opaque
    if (SCRIPT_KILL_FALLBACK_RE.test(killCmd)) {
      return {
        blocked: true,
        reason: `Blocked: script-based kill detected — "${killCmd.slice(0, 80)}" may target protected WrongStack processes (cannot inspect script body).`,
      };
    }
    return { blocked: false };
  }

  if (await isKillProtected(parsed)) {
    let target: string;
    if (parsed.name) {
      target = `process name "${parsed.name}"`;
    } else if (parsed.pids && parsed.pids.length > 1) {
      target = `PIDs ${parsed.pids.join(', ')}`;
    } else if (parsed.pid !== undefined) {
      target = `PID ${parsed.pid}`;
    } else {
      target = '(unknown target)';
    }

    const signal = parsed.signal ? ` (${parsed.signal})` : '';
    const groupNote = parsed.isGroupKill ? ' (process group)' : '';
    return {
      blocked: true,
      reason: `Blocked: kill${signal} ${target}${groupNote} targets a protected WrongStack process.`,
    };
  }

  return { blocked: false };
}

/**
 * Get a safe error message for blocked kill commands.
 */
export function getBlockedKillMessage(pid: number, signal?: string): string {
  return (
    `Kill command blocked: PID ${pid}${signal ? ` (signal ${signal})` : ''} is a protected WrongStack process. ` +
    `Use 'exit' or Ctrl+C to gracefully terminate a WrongStack session.`
  );
}
