/**
 * Kill-command detection for the bash kill guard (bash-kill-guard.ts): which
 * commands are kill-related, shell `-c` / PowerShell launcher unwrapping,
 * sequence splitting, and POSIX `kill` target parsing.
 */

import * as os from 'node:os';

const isWin = os.platform() === 'win32';

/** Shared regex: scripts named kill/terminate/stop*.ps1|bat|cmd|sh. */
export const SCRIPT_KILL_RE =
  /^(?:\.\\|\.\/)?(?:kill|terminate|stop)\S*\.(?:ps1|bat|cmd|sh)(?:\s|$)/i;
/** Shared regex: POSIX-only .sh script variant. */
export const SCRIPT_KILL_RE_POSIX = /^(?:\.\/)?(?:kill|terminate|stop)\S*\.sh(?:\s|$)/i;
/**
 * Fallback broad check: used in checkAndBlockKillCommand when the parsed
 * kill struct doesn't carry a PID or name, as a last-resort block for
 * unparseable but suspicious script filenames.
 */
export const SCRIPT_KILL_FALLBACK_RE = /^\S*(?:kill|terminate|stop)\S*\.(?:ps1|bat|cmd|sh)\b/i;

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
/**
 * A `-c` payload runs a kill when any command in its sequence does:
 * `true; kill <pid>` is not kill-shaped as a whole line.
 */
function payloadRunsKill(payload: string): boolean {
  return splitShellSequence(payload).some((segment) => isKillRelatedCommand(segment));
}

export function extractKillCommand(command: string): string | null {
  const normalized = command.replace(/\s+/g, ' ').trim();

  // The `-c` payload is one shell WORD, however it is quoted: `'kill -9 '"1"`,
  // `$'kill -9 1'`, `kill\ -9\ 1`, and a cluster like `-lc`. Split the line
  // into words, decode the word after the flag, and read that. A bare word
  // (`bash -c kill -9 1`) keeps the patterns below: they read the whole rest
  // of the line, more than the shell runs, which only blocks more.
  const words = splitShellWords(normalized);
  const flag = words.findIndex((w, k) => k > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(w));
  const payloadWord = flag === -1 ? undefined : words[flag + 1];
  if (payloadWord !== undefined && /['"\\$]/.test(payloadWord)) {
    const inner = unquoteShellWord(payloadWord).replace(/\s+/g, ' ').trim();
    if (payloadRunsKill(inner)) return inner;
  }

  // Pattern: <any executable path or name> -c "kill ..." or 'kill ...'
  // Matches /bin/bash, /usr/local/bin/bash, /opt/homebrew/bin/bash,
  // /usr/bin/env bash, plain bash/sh/zsh, etc. The executable is any run of
  // non-whitespace, optionally followed by a space and a second token (for
  // the `/usr/bin/env bash` form) before `-c`.
  // The shell hands the words after the payload to it as $0, $1 …, so
  // `sh -c '<kill>' name` runs the kill too. Whole-line payload first (it may
  // contain its own quote character), then the payload up to its closing quote.
  const shellCMatch =
    normalized.match(/^.+?\s+-c\s+(['"])([\s\S]+)\1$/) ??
    normalized.match(/^.+?\s+-c\s+(['"])((?:(?!\1)[\s\S])+)\1\s/);
  if (shellCMatch?.[2]) {
    const inner = shellCMatch[2].trim();
    // Recursively check the inner command
    return payloadRunsKill(inner) ? inner : null;
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
export function stripPowerShellLauncherHead(normalized: string): string | null {
  // The launcher must BE the first token (optionally `& `-invoked, quoted, or
  // a path). An unanchored `.*[\\/]pwsh` matched a pwsh path anywhere, so
  // `kill -9 1234 /usr/bin/pwsh -c x` was handed to the PowerShell parser,
  // which found no kill: the POSIX kill of 1234 went unguarded.
  const head = normalized.match(
    /^(?:&\s*)?(?:"(?:[^"]*[\\/])?|'(?:[^']*[\\/])?|[^\s"']*[\\/])?(?:powershell|pwsh)(?:\.exe)?["']?\s+(.+)$/i,
  );
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
export function isKillRelatedCommand(cmd: string): boolean {
  const normalized = cmd.toLowerCase().replace(/\s+/g, ' ').trim();

  // pwsh runs on POSIX too. Detect its process cmdlets before filtering
  // native Windows commands, including an inspectable launcher payload.
  const powerShellCommand = stripPowerShellLauncherHead(normalized) ?? normalized;
  if (/^(stop-process|kill|stop|spps)\s/i.test(powerShellCommand)) return true;

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
      if (/^(stop-process|kill|stop|spps)\s/i.test(strippedLauncher)) return true;
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
 * `kill [-SIG | -s SIG | -n SIG] [--] target...` where every target is a PID
 * (a negative PID is a process group). A leading `-X` counts as a signal only
 * when a target follows it, so `kill -123` stays a group kill.
 *
 * Returns null for anything else — job specs (`%1`), `kill -l`, variables,
 * names, redirections — so the caller's name parsing and conservative
 * fallbacks still run. The regexes this replaced anchored a single target at
 * the end, which let `kill 111 <protected>` and `kill -- <protected>` through.
 */
/**
 * Split a command line into shell words. Each word keeps its quoting (for
 * `unquoteShellWord`): quotes and `$'…'` group spaces into one word and a
 * backslash keeps the next character in the word.
 */
export function splitShellWords(line: string): string[] {
  const words: string[] = [];
  let word = '';
  let inWord = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (/\s/.test(c)) {
      if (inWord) words.push(word);
      word = '';
      inWord = false;
      continue;
    }
    inWord = true;
    if (c === '\\' && i + 1 < line.length) {
      word += c + line[++i];
      continue;
    }
    const ansi = c === '$' && line[i + 1] === "'";
    if (c === "'" || c === '"' || ansi) {
      const close = ansi ? "'" : c;
      word += ansi ? "$'" : c;
      i += ansi ? 2 : 1;
      while (i < line.length && line[i] !== close) {
        // Backslash escapes the closing quote in "…" and $'…', not in '…'.
        if (line[i] === '\\' && (close === '"' || ansi)) {
          word += line[i]! + (line[i + 1] ?? '');
          i += 2;
          continue;
        }
        word += line[i];
        i++;
      }
      if (i < line.length) word += close;
      continue;
    }
    word += c;
  }
  if (inWord) words.push(word);
  return words;
}

const ANSI_C_SIMPLE: Record<string, string> = {
  a: '\x07',
  b: '\b',
  e: '\x1b',
  E: '\x1b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '?': '?',
};

/** Body of `$'…'` from `start` to its closing quote, escapes decoded; undefined if unclosed. */
function decodeAnsiCQuote(token: string, start: number): { text: string; end: number } | undefined {
  let text = '';
  for (let i = start; i < token.length; i++) {
    const c = token[i]!;
    if (c === "'") return { text, end: i };
    if (c !== '\\' || i + 1 >= token.length) {
      text += c;
      continue;
    }
    const e = token[++i]!;
    const hex = e === 'x' ? /^[0-9a-fA-F]{1,2}/.exec(token.slice(i + 1)) : null;
    // bash: `\u` takes up to four hex digits, `\U` up to eight.
    const uni =
      e === 'u'
        ? /^[0-9a-fA-F]{1,4}/.exec(token.slice(i + 1))
        : e === 'U'
          ? /^[0-9a-fA-F]{1,8}/.exec(token.slice(i + 1))
          : null;
    const oct = /[0-7]/.test(e) ? /^[0-7]{1,3}/.exec(token.slice(i)) : null;
    if (hex) {
      text += String.fromCharCode(Number.parseInt(hex[0], 16));
      i += hex[0].length;
    } else if (uni) {
      text += String.fromCodePoint(Number.parseInt(uni[0], 16) % 0x110000);
      i += uni[0].length;
    } else if (oct) {
      text += String.fromCharCode(Number.parseInt(oct[0], 8) & 0xff);
      i += oct[0].length - 1;
    } else {
      text += ANSI_C_SIMPLE[e] ?? `\\${e}`;
    }
  }
  return undefined;
}

/**
 * One shell word as the shell passes it: every quoted piece unquoted and
 * backslash escapes resolved, so `"123"`, `4"56"`, `'1'"2"3` and `\123`
 * are the numbers they become, not tokens the parser rejects. `$'…'` is
 * ANSI-C quoting (`\x34`, `\064`, `\u0034` …) and `$"…"` reads like `"…"`.
 * An unbalanced quote is returned as written. `$PID` and `%1` stay as
 * written: their values are not known here.
 */
export function unquoteShellWord(token: string): string {
  let out = '';
  for (let i = 0; i < token.length; i++) {
    const c = token[i]!;
    if (c === '$' && token[i + 1] === "'") {
      const decoded = decodeAnsiCQuote(token, i + 2);
      if (!decoded) return token;
      out += decoded.text;
      i = decoded.end;
      continue;
    }
    // `$"…"` is locale translation of a double-quoted string: same bytes here.
    if (c === '$' && token[i + 1] === '"') continue;
    if (c === "'") {
      const end = token.indexOf("'", i + 1);
      if (end === -1) return token;
      out += token.slice(i + 1, end);
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < token.length && token[j] !== '"'; j++) {
        // Inside double quotes a backslash escapes only " \ $ and `.
        const next = token[j + 1];
        if (token[j] === '\\' && next !== undefined && '"\\$`'.includes(next)) out += token[++j];
        else out += token[j];
      }
      if (j >= token.length) return token;
      i = j;
    } else if (c === '\\' && i + 1 < token.length) {
      out += token[++i];
    } else {
      out += c;
    }
  }
  return out;
}

export function parsePosixKillTargets(normalized: string, command: string): KillCommand | null {
  const tokens = normalized.split(' ').map(unquoteShellWord);
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
  // kill accepts a sign: `+123` is PID 123, `-123` the process group.
  if (targets.length === 0 || !targets.every((t) => /^[+-]?\d+$/.test(t))) return null;
  const pids = targets.map((t) => Number.parseInt(t.replace(/^[+-]/, ''), 10));
  return {
    pid: pids[0]!,
    ...(pids.length > 1 ? { pids } : {}),
    signal,
    isGroupKill: targets.some((t) => t.startsWith('-')),
    isAllKill: false,
    originalCommand: command,
  };
}

/**
 * Split on shell sequencing operators outside quotes: `;`, `&&`, `||`, a
 * background `&`, and newlines. A single `|` is NOT split — a kill piped into
 * another command is handled whole by the conservative pipeline block — and
 * redirections such as `2>&1` / `&>file` are not separators.
 */
/** Launchers that run the rest of the line unchanged, with the options that take a value. */
const KILL_LAUNCHERS: Record<string, { values: ReadonlySet<string>; positionals?: number }> = {
  sudo: { values: new Set(['-u', '-g', '-C', '-h', '-p', '-U']) },
  doas: { values: new Set(['-u', '-C']) },
  env: { values: new Set(['-u', '-C', '-S']) },
  nohup: { values: new Set() },
  command: { values: new Set() },
  exec: { values: new Set(['-a']) },
  time: { values: new Set(['-f', '-o']) },
  setsid: { values: new Set() },
  nice: { values: new Set(['-n']) },
  stdbuf: { values: new Set(['-i', '-o', '-e']) },
  timeout: { values: new Set(['-s', '-k']), positionals: 1 },
  ionice: { values: new Set(['-c', '-n', '--class', '--classdata']) },
  taskset: { values: new Set(), positionals: 1 },
  chrt: {
    values: new Set(['-T', '-P', '-D', '--sched-runtime', '--sched-period', '--sched-deadline']),
    positionals: 1,
  },
};

/** A word that starts a command the guard reads: a kill verb, a shell or a launcher. */
const LAUNCHED_COMMAND_RE =
  /^(?:\S*[\\/])?(?:kill|pkill|killall|taskkill|tskill|wmic|stop-process|spps|pwsh|powershell|cmd|bash|sh|zsh|dash|ksh|sudo|doas|env|nohup|command|exec|time|setsid|nice|stdbuf|timeout|ionice|taskset|chrt)(?:\.exe)?$/i;

/**
 * Further readings of a launcher line whose option count may be wrong. An
 * option table cannot know every flag (`nice --adjustment 5`, `timeout
 * --signal KILL 5`, `ionice -t`), and one miscounted value skips the command
 * word itself. Returns the line from each later word that starts a command
 * the guard reads. These are checked IN ADDITION to the counted reading of
 * `unwrapKillCommandHead`, never instead of it: replacing it let a trailing
 * `kill` hide `nice sh -c '<kill>' kill`.
 */
export function launcherSkipReadings(normalized: string): string[] {
  const tokens = normalized.trim().split(' ');
  const head = (tokens[0] ?? '').replace(/^.*[\\/]/, '').toLowerCase();
  if (!KILL_LAUNCHERS[head]) return [];
  // Kill verbs and shells first: with launchers first, a chain of nine `nice`
  // used up the cap (and the unwrap passes) before the kill behind it.
  const starts = tokens
    .map((_t, k) => k)
    .filter((k) => k > 0 && LAUNCHED_COMMAND_RE.test(tokens[k] ?? ''));
  const direct = starts.filter(
    (k) => !KILL_LAUNCHERS[(tokens[k] ?? '').replace(/^.*[\\/]/, '').toLowerCase()],
  );
  const launchers = starts.filter((k) => !direct.includes(k));
  return [...direct, ...launchers].slice(0, 8).map((k) => tokens.slice(k).join(' '));
}

/**
 * Reduce a command to the kill verb it runs. The guard's parsers anchor the
 * verb as the bare first word, so the same kill of a protected PID passed
 * when written `taskkill.exe …`, `C:/Windows/System32/taskkill.exe …`,
 * `cmd /c taskkill …`, `env kill …`, `timeout 5 kill …`, `/usr/bin/kill …` or
 * `(kill …)`. Strips, to a fixed point: a `( … )` / `$( … )` wrapper, `cmd
 * /c|/k` (outer double quotes as cmd strips them), a transparent launcher with
 * its options, and a path / `.exe` on the verb itself.
 */
export function unwrapKillCommandHead(normalized: string): string {
  let current = normalized.trim();
  for (let pass = 0; pass < 8; pass++) {
    const before = current;
    const subshell = /^\$?\(\s*([\s\S]*?)\s*\)$/.exec(current);
    if (subshell) current = subshell[1] ?? '';
    const cmd =
      /^(?:\S*[\\/])?cmd(?:\.exe)?(?:\s+\/[a-z](?::\S*)?){0,4}?\s+\/[ck]\s+([\s\S]+)$/i.exec(
        current,
      );
    if (cmd) {
      const body = cmd[1] ?? '';
      const quoted = /^"([^"]*)"(.*)$/.exec(body);
      current = quoted ? `${quoted[1] ?? ''}${quoted[2] ?? ''}`.trim() : body;
    }
    const tokens = current.split(' ');
    const head = (tokens[0] ?? '').replace(/^.*[\\/]/, '').toLowerCase();
    const launcher = KILL_LAUNCHERS[head];
    if (launcher && tokens.length > 1) {
      let i = 1;
      while (i < tokens.length) {
        const token = tokens[i] ?? '';
        if (token === '--') {
          i++;
          break;
        }
        if (head === 'env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
          i++;
          continue;
        }
        if (!token.startsWith('-') || token === '-') break;
        i += launcher.values.has(token) ? 2 : 1;
      }
      i += launcher.positionals ?? 0;
      current = tokens.slice(i).join(' ');
    }
    current = current.replace(
      /^(?:\S*[\\/])?(kill|taskkill|tskill|wmic)(?:\.exe)?(?=\s|$)/i,
      (_m, verb: string) => verb,
    );
    if (current === before) break;
  }
  return current;
}

export function splitShellSequence(command: string): string[] {
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
