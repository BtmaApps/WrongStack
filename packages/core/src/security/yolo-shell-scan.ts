export const SHELL_OPERATORS = new Set(['&&', '||', '|', ';', '>', '>>', '<', '2>', '2>>']);

/**
 * Shell quote/escape state for a character-by-character scan.
 *
 * Both scanners in this module walk a command line and must agree on what a
 * shell treats as quoted, because a separator inside quotes is prose, not a
 * separator. The rules live here once: outside single quotes a backslash
 * escapes the NEXT character, and single quotes are literal (no escapes).
 * Without the escape rule a backslash-escaped quote flipped quote parity —
 * `echo \" ; shutdown now` runs `shutdown now` in every real shell, while the
 * classifier read the rest of the line as quoted prose and gated nothing.
 */
interface ShellScanState {
  quote: string | undefined;
  escaped: boolean;
}

/**
 * Advance `state` over `ch`; true when `ch` is INERT (quoted or escaped) and
 * therefore must never be read as a separator.
 */
function advanceShellScan(state: ShellScanState, ch: string): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (state.quote === "'") {
    if (ch === "'") state.quote = undefined;
    return true;
  }
  if (ch === '\\') {
    state.escaped = true;
    return true;
  }
  if (state.quote !== undefined) {
    if (ch === state.quote) state.quote = undefined;
    return true;
  }
  if (ch === '"' || ch === "'") {
    state.quote = ch;
    return true;
  }
  return false;
}

/**
 * Put whitespace around every UNQUOTED command separator.
 *
 * `\S+` tokenization keeps a separator glued to the previous word inside that
 * word (`echo hi;rm -rf ~/data` becomes the single token `hi;rm`), so every
 * rule that finds a command by EXACT token match (`token === 'rm'`,
 * `tokens[i] !== 'git'`, the `del`/`erase`/`rd` branches, the agent-state
 * writers, the publish verbs) never saw the command that followed — while the
 * identical line with a space before the separator was gated. A shell reads
 * `;`, `&` and `|` as separators whatever the surrounding whitespace, and this
 * module's own `splitShellSegments` already reads them that way; the tokens
 * have to agree. Runs stay together so `&&` / `||` remain single tokens for
 * `commandSegment`'s `SHELL_OPERATORS` check.
 *
 * Redirection characters are deliberately NOT spaced out: `>`, `>>` and `2>`
 * are already operators, and splitting `2>&1` would reshape tokens for no
 * detection gain (glued redirect targets are scanned against the raw string).
 */
function spaceOutUnquotedSeparators(command: string): string {
  const separators = ';&|';
  let out = '';
  const state: ShellScanState = { quote: undefined, escaped: false };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === undefined) continue;
    if (advanceShellScan(state, ch) || !separators.includes(ch)) {
      out += ch;
      continue;
    }
    let run = ch;
    let next = command[i + 1];
    while (next !== undefined && separators.includes(next)) {
      run += next;
      i += 1;
      next = command[i + 1];
    }
    out += ` ${run} `;
  }
  return out;
}

/**
 * Commands whose flag takes a COMMAND LINE as its value.
 *
 * Every rule in this module finds a command by EXACT token equality, so a value
 * that is itself a command line (`env -S "rm -rf ~/data"`, `sh -c "git push
 * --force"`) left the wrapped command invisible in ONE token — while the same
 * line written directly was gated. Keyed PER COMMAND because the letters are
 * overloaded: `-c` is also `grep -c` / `tar -c`, and `/c` is a path separator
 * everywhere else. Values are stored lowercased; argument matching compares
 * lowercased, which is right for PowerShell and cmd (/c and -Command are
 * case-insensitive there) and merely fail-safe for the POSIX shells.
 *
 * Exported for the split-string parity guard in
 * packages/tools/tests/danger-detect.test.ts, which pins this table against
 * `ARGV_LAUNCHERS`' `splitStringFlags` on the tools side. The comparison there
 * lowercases, because this map stores flags lowercased while tools keeps the
 * documented spelling (`-S`). Recorded as a test-only export in
 * architecture/test-only-exports.json.
 */
export const COMMAND_STRING_FLAGS: ReadonlyMap<string, readonly string[]> = new Map([
  ['env', ['-s', '--split-string']],
  ['sh', ['-c']],
  ['bash', ['-c']],
  ['zsh', ['-c']],
  ['dash', ['-c']],
  ['ksh', ['-c']],
  ['ash', ['-c']],
  ['fish', ['-c']],
  ['pwsh', ['-command', '-c']],
  ['powershell', ['-command', '-c']],
  ['cmd', ['/c', '/k']],
]);

/** Bound on nested command-string values (`sh -c "env -S 'x'"`). */
const MAX_COMMAND_STRING_DEPTH = 4;

/**
 * Command name without a directory or executable extension, lowercased. The
 * Windows package managers and build wrappers are `.cmd`/`.bat`/`.ps1` shims
 * (`npm.cmd`, `gradlew.bat`, `npm.ps1`) that every Windows shell runs by that
 * full name, so stripping only `.exe` left `npm.cmd publish` unclassified.
 */
function normalizeCommandToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/^.*[\\/]/, '')
    .replace(/\.(?:exe|cmd|bat|ps1)$/, '');
}

/**
 * A token read as a command name: {@link normalizeCommandToken}, which also
 * drops the `\` of an alias-escaped `\rm`. Detectors compare this, never the
 * raw token, so `/bin/rm -rf x` is gated exactly like `rm -rf x`.
 */
export function commandName(token: string | undefined): string {
  return token ? normalizeCommandToken(token) : '';
}

/**
 * Quote-aware whitespace split, before any command-string expansion.
 *
 * Kept separate from {@link tokenizeShell} so the expansion can recurse into a
 * value it has already split without re-entering itself unbounded.
 */
function flatShellTokens(command: string): string[] {
  return (
    spaceOutUnquotedSeparators(command)
      .match(/"[^"]*"|'[^']*'|\S+/g)
      ?.map((token) => token.replace(/^['"]|['"]$/g, '')) ?? []
  );
}

/**
 * Splice the words of each command-string flag's value into the token stream.
 *
 * `env -S "<cmd>"`, `sh -c "<cmd>"`, `cmd /c "<cmd>"` and PowerShell's
 * `-Command` all pass a WHOLE command line as one argv token that the launcher
 * then splits and runs. Left as one token, no `cmd`-keyed rule could see it:
 * `env -S 'rm -rf ~/data'` assessed as not destructive while the identical
 * `env rm -rf ~/data` returned 'delete-outside'. The value is therefore
 * tokenized as the command line it is, behind a `;` boundary that
 * `commandSegment` already stops at, so the spliced words cannot leak into the
 * outer command's arguments.
 */
function expandCommandStrings(tokens: readonly string[], depth: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    out.push(token);
    const flags = COMMAND_STRING_FLAGS.get(normalizeCommandToken(token));
    if (flags === undefined) continue;
    const flagToken = tokens[i + 1];
    if (flagToken === undefined || SHELL_OPERATORS.has(flagToken)) continue;
    const lower = flagToken.toLowerCase();
    const flag = flags.find((candidate) => lower === candidate || lower.startsWith(candidate));
    if (flag === undefined) continue;
    let value: string | undefined;
    let consumed = 1;
    if (lower.length > flag.length) {
      // `-c<cmd>` / `--split-string=<cmd>`: the value rides the flag token.
      value = flagToken.slice(flag.length + (flagToken.charAt(flag.length) === '=' ? 1 : 0));
    } else {
      value = tokens[i + 2];
      consumed = 2;
    }
    if (value === undefined || value.length === 0) continue;
    i += consumed;
    out.push(';');
    const inner = flatShellTokens(value);
    // Past the bound the words still become visible; only deeper nesting stops.
    out.push(
      ...(depth + 1 >= MAX_COMMAND_STRING_DEPTH ? inner : expandCommandStrings(inner, depth + 1)),
    );
  }
  return out;
}

export function tokenizeShell(command: string): string[] {
  return expandCommandStrings(flatShellTokens(command), 0);
}

export function commandSegment(tokens: string[], start: number): string[] {
  const out: string[] = [];
  for (let i = start; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined || SHELL_OPERATORS.has(token)) break;
    out.push(token);
  }
  return out;
}

/**
 * Every flag letter visible in `args`, presence-only: short clusters
 * (`-rf` → r,f — lowercased so GNU `-R` counts as recursive) plus the GNU
 * long forms (`--recursive` → r, `--force` → f). A mixed invocation
 * (`rm -r --force x`) must classify identically to either pure form — the
 * same shape-variance contract the tools-side danger rules enforce.
 */
export function flagLetters(args: readonly string[]): Set<string> {
  const seen = new Set<string>();
  for (const arg of args) {
    if (/^-[a-zA-Z]+$/.test(arg)) {
      for (const ch of arg.replace(/^-+/, '')) seen.add(ch.toLowerCase());
    } else if (arg === '--recursive') {
      seen.add('r');
    } else if (arg === '--force') {
      seen.add('f');
    }
  }
  return seen;
}

/**
 * Split a command line into shell segments, ignoring separators inside quotes
 * and separators that a backslash escapes.
 *
 * Quote-awareness is the whole point: `git commit -m "…; shutdown now"` must
 * stay ONE segment whose head is `git`. The classifier has to read the command
 * being run, never the prose it carries as an argument. Escapes belong to the
 * same question — `echo \" ; shutdown now` runs `shutdown now` in every real
 * shell, and reading that `\"` as an opener kept the segment as one quoted
 * blob, so the halt was never seen.
 *
 * `|` splits here even though `curl … | sh` is a real risk shape — that shape
 * is matched against the WHOLE command by HIGH_IMPACT_PATTERNS[0], which never
 * goes through this splitter.
 */
export function splitShellSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  const state: ShellScanState = { quote: undefined, escaped: false };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] as string;
    const inert = advanceShellScan(state, ch);
    if (!inert && (ch === ';' || ch === '\n' || ch === '&' || ch === '|')) {
      if (command[i + 1] === ch) i++; // consume the second half of && / ||
      segments.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.filter((segment) => segment.trim().length > 0);
}
