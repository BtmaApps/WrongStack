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
import * as path from 'node:path';
import { compileUserRegex } from './_regex.js';
import {
  extractKillCommand,
  isKillRelatedCommand,
  type KillCheckResult,
  type KillCommand,
  launcherSkipReadings,
  parsePosixKillTargets,
  SCRIPT_KILL_FALLBACK_RE,
  SCRIPT_KILL_RE_POSIX,
  splitShellSequence,
  stripPowerShellLauncherHead,
  unquoteShellWord,
  unwrapKillCommandHead,
} from './bash-kill-detect.js';
import { parseWindowsKillCommand } from './bash-kill-parse-windows.js';
import {
  getPersistentProcessRegistry,
  type PersistentProcessEntry,
} from './process-registry-persistent.js';

export type { KillCheckResult, KillCommand } from './bash-kill-detect.js';

const isWin = os.platform() === 'win32';

/**
 * Case-insensitive Windows wildcard match (`*`, `?`) of a whole process name,
 * linear two-pointer scan (no regex, so no backtracking on hostile input).
 * A `[...]` class is not interpreted: it may match anything (fail closed).
 */
export function wildcardNameMatches(pattern: string, name: string): boolean {
  const p = pattern.toLowerCase();
  const t = name.toLowerCase();
  if (p.includes('[')) return true;
  let pi = 0;
  let ti = 0;
  let star = -1;
  let mark = 0;
  while (ti < t.length) {
    if (pi < p.length && (p[pi] === '?' || p[pi] === t[ti])) {
      pi++;
      ti++;
    } else if (pi < p.length && p[pi] === '*') {
      star = pi++;
      mark = ti;
    } else if (star !== -1) {
      pi = star + 1;
      ti = ++mark;
    } else {
      return false;
    }
  }
  while (pi < p.length && p[pi] === '*') pi++;
  return pi === p.length;
}

/** pkill options that pick processes by user / parent / session / group / terminal. */
const PKILL_SELECTOR_RE =
  /^(?:-[uUGgPst]|--(?:euid|uid|group|pgroup|parent|session|terminal|ns|cgroup))(?:=|$)|^-[uUGgPst]./;
/** killall's pattern-free selector: every process of a user. */
const KILLALL_SELECTOR_RE = /^(?:-u|--user)(?:=|$)|^-u./;

/**
 * The literal substring checks miss how pkill/killall actually select: the
 * pattern is a REGEX (`pkill 'n.de'`, `pkill .`, `killall -r 'wrong.*'`), and
 * pkill also kills by user / parent / session with no pattern at all
 * (`pkill -u "$USER"`, `pkill -P <wrongstack pid>`). With protected processes
 * alive, a selector kill is blocked outright and every non-option word is
 * tried as a case-insensitive regex against the protected names. A word the
 * ReDoS guard refuses to compile blocks too (fail closed).
 */
function namePatternMayHitProtected(kill: KillCommand, entries: PersistentProcessEntry[]): boolean {
  // Words after the pkill/killall head, read from the command itself: the
  // parser files the first option under `signal` (`pkill -u me` → name "me"),
  // which would hide exactly the selector this check is for.
  const tokens = kill.originalCommand
    .split(/\s+/)
    .map((w) => w.replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  let head = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (/(?:^|\/)(?:pkill|killall)$/.test(tokens[i] ?? '')) head = i;
  }
  const words: string[] = [];
  for (const token of head >= 0 ? tokens.slice(head + 1) : (kill.name ?? '').split(/\s+/)) {
    if (/[;&|]/.test(token)) break;
    if (token) words.push(token);
  }
  const selector = /\bkillall\b/.test(kill.originalCommand)
    ? KILLALL_SELECTOR_RE
    : PKILL_SELECTOR_RE;
  if (words.some((w) => selector.test(w))) return true;
  const targets = ['node', 'wrongstack', ...entries.map((e) => e.name ?? '').filter(Boolean)];
  for (const word of words) {
    if (word.startsWith('-')) continue;
    const compiled = compileUserRegex(word, 'i');
    if (!compiled.ok) return true;
    if (targets.some((t) => compiled.regex.test(t))) return true;
  }
  return false;
}

/**
 * Parse a kill command string to extract PID and signal.
 */
export function parseKillCommand(command: string): KillCommand | null {
  const normalized = command.replace(/\s+/g, ' ').trim();

  // PowerShell cmdlets and launcher payloads run on POSIX as well. Keep
  // native POSIX kill syntax on its existing path; -Id/-Name spellings
  // unambiguously select PowerShell rather than a POSIX signal option.
  const powerShellCommand = stripPowerShellLauncherHead(normalized);
  const powerShellKill = /^(?:stop-process|spps)\s|^kill\s+-(?:id|pid|name|nam|na)(?=[:\s])/i.test(
    normalized,
  );
  if (isWin || powerShellCommand !== null || powerShellKill) {
    return parseWindowsKillCommand(command, normalized);
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
 * True when a process NAME (optionally `.exe`-suffixed, optionally a Windows
 * wildcard) selects the image this very process runs from. Mirrors the
 * current-runtime rule in exec-kill-guard so the two guards agree.
 */
function nameTargetsCurrentRuntime(name: string): boolean {
  const currentImage = path
    .basename(process.execPath)
    .toLowerCase()
    .replace(/\.exe$/, '');
  // The parsers can leave option words in `name` (`pkill -9 bun` files the
  // numeric signal under the name: "-9 bun"), so test every non-option word.
  for (const word of name.split(/\s+/)) {
    if (!word || word.startsWith('-')) continue;
    const target = word
      .replace(/^['"]|['"]$/g, '')
      .toLowerCase()
      .replace(/\.exe$/, '');
    if (!target) continue;
    if (target === currentImage) return true;
    if (/[*?[]/.test(target) && wildcardNameMatches(target, currentImage)) return true;
  }
  return false;
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
    // The guard runs inside the current WrongStack process, which may not have
    // reached the persistent registry yet (fresh CLI/test sessions, or a
    // registry nobody refreshed in 30s). An image-name kill that matches THIS
    // runtime would kill WrongStack regardless, so protect it by name — the same
    // rule exec-kill-guard applies (`taskkill /IM bun.exe`, `Stop-Process -Name
    // bun`, `tskill bun` with an empty registry were allowed here).
    if (nameTargetsCurrentRuntime(kill.name)) return true;
    if (killNameLower.includes('node') && entries.length > 0) {
      // Conservative: block pkill node if we have protected node processes
      return true;
    }
    if (entries.length > 0 && namePatternMayHitProtected(kill, entries)) return true;
    // Windows names are WILDCARDS (`Stop-Process -Name nod*`, `taskkill /IM
    // *`), which the literal checks above cannot see.
    if (/[*?[]/.test(kill.name)) {
      if (wildcardNameMatches(kill.name, 'wrongstack')) return true;
      const targets = ['node', 'node.exe', ...entries.map((e) => e.name ?? '').filter(Boolean)];
      if (entries.length > 0 && targets.some((t) => wildcardNameMatches(kill.name ?? '', t))) {
        return true;
      }
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
 * The POSIX `kill` the shell actually runs when some operands are junk: kill
 * signals every numeric operand and only reports the rest. Keeps the signal
 * spelling, then passes every numeric operand (negative = process group,
 * -1 = every process) to the strict parser behind an explicit `--`, so no
 * operand is re-read as a signal and no later `--` becomes a target. Null
 * when no numeric operand is left.
 */
function parseJunkOperandKill(command: string): KillCommand | null {
  const tokens = command.split(' ').map(unquoteShellWord);
  if (tokens[0]?.toLowerCase() !== 'kill') return null;
  const first = tokens[1] ?? '';
  // Same rule as the strict parser: `-s SIG` / `-n NUM`, or one option-shaped
  // word (`-9`, `-KILL`) that something follows.
  const head = /^-[sn]$/i.test(first)
    ? 3
    : first !== '--' && /^-[a-zA-Z0-9]+$/.test(first) && tokens.length > 2
      ? 2
      : 1;
  const rest = tokens.slice(head);
  const targets = (rest[0] === '--' ? rest.slice(1) : rest).filter((t) => /^[+-]?\d+$/.test(t));
  if (targets.length === 0) return null;
  return parsePosixKillTargets([...tokens.slice(0, head), '--', ...targets].join(' '), command);
}

/**
 * The counted reading of the command, then every other reading of a launcher
 * line whose option count may be wrong (see `launcherSkipReadings`).
 */
async function checkSingleCommand(
  command: string,
  depth = 0,
  work: ReadingWork = { left: READING_BUDGET, seen: new Set() },
): Promise<KillCheckResult> {
  const counted = await checkOneReading(command);
  if (counted.blocked) return counted;
  // Every other reading goes through the same sequencing split as the
  // top-level line: `nice --adjustment 5 sh -c 'true; kill <pid>'` and a bare
  // `sh -c 'true; kill <pid>'` hid the kill behind the payload's `;`.
  const segments = alternativeReadings(command)
    .flatMap((reading) => splitShellSequence(reading))
    .filter((segment) => !work.seen.has(segment));
  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s]!;
    if (work.seen.has(segment)) continue;
    // Out of depth or work with readings left: a kill among them would go
    // unchecked, so refuse it rather than allow it.
    if (depth >= MAX_READING_DEPTH || work.left-- <= 0) {
      return segments.slice(s).some(looksLikeKill) ? TOO_COMPLEX : counted;
    }
    work.seen.add(segment);
    const result = await checkSingleCommand(segment, depth + 1, work);
    if (result.blocked) return result;
  }
  return counted;
}

/**
 * Bounds on nested readings. A segment already checked in this call is not
 * checked again, which keeps a hostile `nice nice …` chain linear.
 */
const MAX_READING_DEPTH = 6;
const READING_BUDGET = 256;

interface ReadingWork {
  left: number;
  seen: Set<string>;
}

const TOO_COMPLEX: KillCheckResult = {
  blocked: true,
  reason:
    'Blocked: kill command too complex to verify against protected WrongStack processes — ' +
    'simplify it (one kill, no nested shells or launcher chains).',
};

/** Cheap test for a segment that could still run a kill. */
function looksLikeKill(segment: string): boolean {
  return (
    isKillRelatedCommand(segment) ||
    isKillRelatedCommand(unwrapKillCommandHead(segment)) ||
    extractKillCommand(segment) !== null
  );
}

/**
 * Readings of a command other than the one `checkOneReading` takes: the
 * launcher-unwrapped line, a `-c` payload, and the launcher skip readings
 * (see `launcherSkipReadings`).
 */
function alternativeReadings(command: string): string[] {
  const normalized = command.replace(/\s+/g, ' ').trim();
  const unwrapped = unwrapKillCommandHead(normalized);
  const readings = new Set<string>([unwrapped]);
  for (const line of [normalized, unwrapped]) {
    const payload = extractKillCommand(line);
    if (payload) readings.add(payload);
    for (const reading of launcherSkipReadings(line)) readings.add(reading);
  }
  readings.delete(normalized);
  return [...readings].slice(0, 12);
}

async function checkOneReading(command: string): Promise<KillCheckResult> {
  const normalized = unwrapKillCommandHead(command.replace(/\s+/g, ' ').trim());

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
    // POSIX `kill` signals every numeric operand and only reports the others
    // as errors, so `kill -9 <pid> junk` (or `… /usr/bin/pwsh -c …`) still
    // kills <pid> although the form does not parse.
    const lenient = parseJunkOperandKill(killCmd);
    if (lenient && (await isKillProtected(lenient))) {
      const pids = lenient.pids ?? [lenient.pid];
      return {
        blocked: true,
        reason: `Blocked: kill of PID ${pids.join(', ')}${lenient.isGroupKill ? ' (process group)' : ''} targets a protected WrongStack process.`,
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
