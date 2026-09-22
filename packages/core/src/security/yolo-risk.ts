import * as os from 'node:os';
import * as path from 'node:path';
import { wstackGlobalRoot } from '../utils/wstack-paths.js';

export { attachesWellKnownCredential } from './yolo-credentials.js';

/**
 * Basenames under the wstack global root that constitute WrongStack's own
 * trusted state. Duplicated from permission-helpers.ts to avoid a circular
 * import (permission-helpers imports getInputString from yolo-risk).
 * Keep in sync with AGENT_STATE_SENSITIVE_BASENAMES.
 */
const PROTECTED_STATE_BASENAMES =
  /^(?:config(?:\.local)?\.json(?:\..+)?|trust\.json|auth\.json|\.key)$/i;

// Best-effort heuristic detection of destructive shell commands — NOT a
// complete security boundary. Static analysis of shell strings is inherently defeatable
// by obfuscation: env-variable indirection (`$RM -rf /`), quote-splitting
// (`r''m`), base64/eval pipes, command substitution, and aliases all evade
// these patterns. This is one defense-in-depth layer behind the permission
// policy; treat a miss here as expected, not a hole to be plugged with
// ever-more-clever regexes.
//
// CALIBRATION: this gate catches high-impact local/remote side effects that
// should not run solely because a model saw text in untrusted tool output:
// project-escaping or catastrophic recursive deletes, VCS history rewrites,
// public publishes/deploys, cluster-wide deletes, disk/system wipes, and
// network-fetch-then-execute patterns. Harmless reads, normal build/test
// commands, and in-project cleanups stay frictionless.
const CATASTROPHIC_PATTERNS: RegExp[] = [
  /\b(?:mkfs(?:\.[a-z0-9]+)?|mke2fs|newfs)\b/i, // make a filesystem — wipes a partition
  /\bformat\s+[A-Za-z]:/i, // format C: — wipes a Windows volume
  /\bdiskpart\b/i, // Windows partition editor
  /\bdd\b[^|]*\bof=(?:\/dev\/|\\\\[.?]\\)/i, // dd writing straight to a raw device
  />\s*\/dev\/(?:sd|hd|nvme|disk|mapper|vd)/i, // redirect into a raw block device
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/, // classic fork bomb
];

const HIGH_IMPACT_PATTERNS: RegExp[] = [
  /\b(?:curl|wget|fetch|httpie|http|irm|iwr|Invoke-WebRequest|Invoke-RestMethod)\b[\s\S]{0,300}\|\s*(?:sudo\s+)?(?:sh|bash|zsh|fish|pwsh|powershell|iex|Invoke-Expression)\b/i,
  /\b(?:powershell|pwsh)(?:\.exe)?\b[\s\S]{0,120}-(?:enc|encodedcommand)\b/i,
  // Process substitution: `bash <(curl -s URL)` is the same download-and-run as
  // `curl URL | sh`, and a documented install idiom rather than obfuscation —
  // but the pipe pattern above needs a literal `|` and the inline-payload
  // interpreters need a `-c`, so it matched neither (probe-verified 2026-09-22).
  /\b(?:sh|bash|zsh|ksh|fish|pwsh|powershell)(?:\.exe)?\b\s*<\(\s*(?:sudo\s+)?(?:curl|wget|fetch|httpie|http)\b/i,
];

// B2 (AT-08 / CMDI-004): the literal `curl … | sh` shape was the only
// pipe-to-shell recognised. `bash -c "$(curl …)"`, `bash -c '<curl>'`, and the
// equivalent `node -e "require('child_process').execSync(...)"` /
// `python -c "import os; os.system(...)"` ship a payload into a brand-new
// interpreter that the classifier never sees as a network command.
//
// The interpreter SHAPE alone is not the risk, though, and neither is starting
// a process: this gate asks ONE question — would running this do serious damage
// to the machine or to the project? `node -e "execSync('id')"` is RCE-shaped and
// harms nothing, while a plain `bash script.sh` YOLO already auto-approves is
// every bit as arbitrary. Gating on shape is what made YOLO ask about
// `bash -c "echo hi"`, `docker run … sh -c "ls"` and
// `node -e "console.log(require('./package.json').version)"`.
//
// So an inline payload counts only when the payload itself DELETES, or when it
// fetches code off the network and runs it — the one case where the damage is
// unknowable in advance because the code is not in front of us.
const INLINE_PAYLOAD_INTERPRETERS: RegExp[] = [
  /\b(?:bash|sh|zsh|ksh|fish|pwsh|powershell)\b[\s\S]{0,200}-c\s*[\s$"'(]/i,
  /\b(?:node|python[0-9.]*|perl|ruby)\b[\s\S]{0,200}-[ecE]\b/i,
];

/** The payload reaches the network — the download half of download-and-run. */
const PAYLOAD_FETCHES_NETWORK =
  /\b(?:curl|wget|httpie|irm|iwr|Invoke-WebRequest|Invoke-RestMethod|DownloadString|DownloadFile|WebClient|XMLHttpRequest|urlretrieve|urllib)\b|\bfetch\s*\(|\brequests\.(?:get|post)\b|\bhttps?:\/\//i;

/**
 * The payload deletes. A quoted payload survives `tokenizeShell` as ONE token,
 * so the `rm -rf` gates below never see inside `bash -c "rm -rf /"` — this is
 * what keeps that shape classified.
 */
const PAYLOAD_DELETES =
  /\b(?:rmSync|unlinkSync|rmdirSync|rimraf|shutil\.rmtree|os\.remove|os\.unlink|Remove-Item)\b|\brm\s+-[A-Za-z]*[rf]|\bdel\s+\/[sq]/i;

/**
 * `shutdown` / `reboot` as the COMMAND BEING RUN, not as a substring.
 *
 * The bare `/\b(?:shutdown|reboot)\b/i` this replaces read prose: it fired on
 * `vitest run …/start-webui-shutdown.test.ts`, on `git add` of that same file,
 * and on `git commit -m "…shutdown…"` — so in any repo with "shutdown" in a
 * filename, YOLO asked about routine test and commit calls.
 */
/**
 * Launchers that run the halt command for you. Probe-verified gap (2026-09-22):
 * the prefix alternation knew only `sudo` and `doas`, so `nohup shutdown -h
 * now`, `timeout 5 shutdown -h now`, `nice`, `setsid`, `env`, `stdbuf`,
 * `command` and `exec` all classified as NOT destructive -- and `system-halt`
 * is gated by default while YOLO is on by default, so they ran unprompted.
 *
 * Each launcher may carry its own flags (`-o0`), env assignments (`FOO=1`) and
 * a numeric operand (`timeout 5`, `nice -n 5`). The three inner alternatives
 * are mutually exclusive by first character (`-`, a name followed by `=`, a
 * digit) and none of them can start a launcher word, so the nesting cannot
 * fork the parse; the outer run is bounded at 8 regardless.
 *
 * A flag that takes a SEPARATED value needs its own alternative. Probe-verified
 * 2026-09-22: `sudo -u root shutdown -h now` classified as NOT destructive while
 * the glued spelling `sudo --user=root shutdown -h now` was gated — the value
 * word `root` matches none of the three alternatives above, so the run ended
 * there and the verb was never in command position. The numeric-operand
 * alternative is why `nice -n 5` and `timeout -k 5 10` happened to survive: their
 * values are digits. Listing the value-taking flags explicitly (rather than
 * accepting "any flag plus any word") keeps a flag that takes NO value from
 * swallowing the command itself — and regex backtracking recovers anyway, since
 * consuming `-i shutdown` only to fail the verb match falls back to consuming
 * `-i` alone. Mirrors `ARGV_LAUNCHERS`' `valueFlags` on the tools side.
 */
const HALT_LAUNCHER_VALUE_FLAG = String.raw`(?:-[ugCncpskioe]|--(?:user|group|unset|chdir|adjustment|signal|kill-after))\s+[^\s-][^\s]*`;
const HALT_LAUNCHER_PREFIX = String.raw`(?:(?:sudo|doas|nohup|setsid|timeout|time|nice|ionice|stdbuf|unbuffer|command|exec|env)\b(?:\s+(?:${HALT_LAUNCHER_VALUE_FLAG}|-[^\s]+|[A-Za-z_][A-Za-z0-9_]*=[^\s]*|\d+[smhd]?))*\s+){0,8}`;

/**
 * Ways to power the machine down or restart it.
 *
 * `shutdown|reboot` alone missed the everyday synonyms -- `poweroff`, `halt`,
 * `systemctl poweroff`, `init 0`, and PowerShell's `Stop-Computer` /
 * `Restart-Computer`. All are command-position matches inside one segment, so
 * prose still does not fire: `halt-on-error` fails the trailing boundary,
 * `echo shutdown` does not start with a launcher or the verb, and `git init` /
 * `npm init` never reach the `init` branch because it requires a `0`/`6`
 * runlevel operand.
 */
const SYSTEM_HALT_COMMAND = new RegExp(
  String.raw`^\s*${HALT_LAUNCHER_PREFIX}(?:[\w.:\-\\/]*[\\/])?(?:(?:shutdown|reboot|poweroff|halt)(?:\.exe)?|systemctl(?:\s+-[^\s]+)*\s+(?:poweroff|reboot|halt|kexec)|init\s+[06]|(?:Stop|Restart)-Computer)(?:\s|$)`,
  'i',
);

// Top-level locations whose *recursive* deletion is catastrophic (the whole
// filesystem, a system directory, or the user's home). Deleting a file or a
// nested subdirectory *inside* one of these is NOT catastrophic — only the root
// directory itself.
const CATASTROPHIC_POSIX_ROOTS = new Set([
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/lib',
  '/lib64',
  '/var',
  '/boot',
  '/dev',
  '/sys',
  '/proc',
  '/opt',
  '/root',
  '/home',
  '/srv',
  '/run',
  '/system',
  '/library',
  '/applications',
  '/users',
]);
const CATASTROPHIC_WIN_SUBDIRS = new Set([
  'windows',
  'system32',
  'winnt',
  'program files',
  'program files (x86)',
  'programdata',
  'users',
]);

const SHELL_OPERATORS = new Set(['&&', '||', '|', ';', '>', '>>', '<', '2>', '2>>']);

export function getInputString(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

export function pathLooksInsideProject(rawPath: string, projectRoot: string | undefined): boolean {
  if (!projectRoot) return false;
  // A Windows-absolute target (drive letter + separator) can never be inside
  // a POSIX project root. Without this branch a POSIX-hosted agent emitting
  // `del /s C:\Users\...` resolves the target as a relative path *inside*
  // the project and the recursive-delete gates never fire. On win32 the
  // normal resolution below already treats drive-absolute paths correctly.
  if (process.platform !== 'win32' && /^[A-Za-z]:[\\/]/.test(rawPath)) {
    return false;
  }
  // A leading ~ is the home directory, never the project root. Without this,
  // path.resolve() treats "~/cache" as a relative path *inside* the project
  // (there is no shell tilde-expansion here), masking an escape like `rm -rf ~/cache`.
  if (rawPath === '~' || rawPath.startsWith('~/') || rawPath.startsWith('~\\')) return false;
  // An UNEXPANDED variable in the leading segment, for exactly the same reason:
  // there is no shell expansion here, so `path.resolve()` reads `$HOME/cache` as
  // a literal directory named `$HOME` *inside* the project. Probe-verified
  // 2026-09-22: `rm -rf ~/cache` was gated as an escape while `rm -rf $HOME/cache`
  // and `rm -rf ${HOME}/data` were classified in-project — the same delete in
  // three spellings. What the variable holds is unknowable statically, so the
  // honest answer is "not provably inside", which only makes the gates stricter.
  if (/^(?:\$|%[A-Za-z_])/.test(rawPath)) return false;
  // Backslash-separated traversal, for the same reason as the drive-letter
  // branch above: `\` is a legal filename character on POSIX, so path.resolve()
  // reads `..\..\shared-secrets` as ONE filename inside the root and the escape
  // goes unnoticed — `del /s ..\..\shared-secrets` was classified in-project by
  // a POSIX-hosted agent. Normalise to a separator before resolving. A POSIX
  // file whose name genuinely contains a backslash is then reported as outside
  // the project, which only makes the destructive gates stricter.
  const candidate = process.platform === 'win32' ? rawPath : rawPath.replace(/\\/g, '/');
  const resolved = path.resolve(projectRoot, candidate);
  const relative = path.relative(projectRoot, resolved);
  // Canonical escape test: `..hidden` is a legal in-root first segment; a bare
  // startsWith('..') would misclassify it as outside the project and skip the
  // in-project destructive-command gates.
  return (
    !!relative &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

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
 */
const COMMAND_STRING_FLAGS: ReadonlyMap<string, readonly string[]> = new Map([
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

/** Command name without a directory or `.exe`, lowercased. */
function normalizeCommandToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/^.*[\\/]/, '')
    .replace(/\.exe$/, '');
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

function tokenizeShell(command: string): string[] {
  return expandCommandStrings(flatShellTokens(command), 0);
}

function commandSegment(tokens: string[], start: number): string[] {
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
function flagLetters(args: readonly string[]): Set<string> {
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

function hasRecursiveForceDelete(command: string, projectRoot: string | undefined): boolean {
  const tokens = tokenizeShell(command);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]?.toLowerCase();
    if (!token) continue;

    if (token === 'rm' || token === 'rmdir') {
      const args = commandSegment(tokens, i + 1);
      const letters = flagLetters(args);
      const recursiveForce = letters.has('r') && letters.has('f');
      if (recursiveForce) {
        const targets = args.filter((arg) => !arg.startsWith('-') && !SHELL_OPERATORS.has(arg));
        if (targets.length > 0 && targets.every((target) => target.trim().length === 0)) {
          continue;
        }
        if (targets.length === 0) return true;
        if (targets.some(isCatastrophicDeleteTarget)) return true;
        if (targets.some((target) => !pathLooksInsideProject(target, projectRoot))) return true;
      }
    }

    if (token === 'remove-item' || token === 'ri') {
      const args = commandSegment(tokens, i + 1).map((arg) => arg.toLowerCase());
      // PowerShell switch parameters accept an explicit boolean value spelling:
      // `-Recurse:$true` ≡ `-Recurse` and `-Force:$true` ≡ `-Force` (switch ON);
      // `-Recurse:$false` / `-Force:$false` explicitly disable the switch and
      // must NOT count. `-WhatIf:$true` (like bare `-WhatIf`) is a dry-run and
      // exempt; `-WhatIf:$false` re-enables execution and is NOT exempt.
      const recurse = args.some((arg) => /^-(?:recurse|r)(?::\$true)?$/.test(arg));
      const force = args.some((arg) => /^-(?:force|f)(?::\$true)?$/.test(arg));
      const dryRun = args.some((arg) => /^-whatif(?::\$true)?$/.test(arg));
      if (recurse && force && !dryRun) {
        const targets = args.filter((arg) => !arg.startsWith('-') && !SHELL_OPERATORS.has(arg));
        if (targets.length === 0) return true;
        if (targets.some(isCatastrophicDeleteTarget)) return true;
        if (targets.some((target) => !pathLooksInsideProject(target, projectRoot))) return true;
      }
    }

    if (token === 'rd' || token === 'rmdir') {
      const args = commandSegment(tokens, i + 1).map((arg) => arg.toLowerCase());
      if (args.includes('/s')) {
        const targets = args.filter(
          (arg) => !arg.startsWith('-') && !arg.startsWith('/') && !SHELL_OPERATORS.has(arg),
        );
        if (targets.length === 0) return true;
        if (targets.some(isCatastrophicDeleteTarget)) return true;
        if (targets.some((target) => !pathLooksInsideProject(target, projectRoot))) return true;
      }
    }

    // Windows `del` / `erase` (erase is a del alias): `/s` deletes matching
    // files in the whole subtree WITHOUT any per-file prompt, so it is the
    // recursive-force half — the tools-side rm-recursive rule (`_danger-detect.ts`)
    // flags `del`/`erase` + `/s` as destructive. This branch mirrors the
    // `rd`/`rmdir`+`/s` branch above so a project-escaping recursive file-tree
    // delete is gated here too (hasCatastrophicDelete only catches whole-disk/
    // home/system targets; it never checks pathLooksInsideProject).
    if (token === 'del' || token === 'erase') {
      const args = commandSegment(tokens, i + 1).map((arg) => arg.toLowerCase());
      if (args.includes('/s')) {
        const targets = args.filter(
          (arg) => !arg.startsWith('-') && !arg.startsWith('/') && !SHELL_OPERATORS.has(arg),
        );
        if (targets.length === 0) return true;
        if (targets.some(isCatastrophicDeleteTarget)) return true;
        if (targets.some((target) => !pathLooksInsideProject(target, projectRoot))) return true;
      }
    }
  }
  return false;
}

function hasGitHistoryRewrite(command: string): boolean {
  const tokens = tokenizeShell(command).map((token) => token.toLowerCase());
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'git') continue;
    const args = commandSegment(tokens, i + 1);
    if (
      args.includes('reset') &&
      args.some((arg) => arg === '--hard' || arg.startsWith('--hard='))
    ) {
      return true;
    }
    // Rewrites every commit in place. Pre-existing gap: the branch above only
    // covered `reset --hard`, so the one command that can destroy a repository's
    // whole history outright was auto-approved under YOLO.
    if (args.includes('filter-branch') || args.includes('filter-repo')) return true;
    const cleanIdx = args.indexOf('clean');
    if (cleanIdx >= 0) {
      const cleanArgs = args.slice(cleanIdx + 1);
      if (
        cleanArgs.some((arg) => arg === '-f' || arg === '--force' || /^-[a-z]*f[a-z]*$/i.test(arg))
      ) {
        return true;
      }
    }
    const pushIdx = args.indexOf('push');
    if (pushIdx >= 0) {
      const pushArgs = args.slice(pushIdx + 1);
      if (
        pushArgs.some(
          (arg) =>
            arg === '-f' ||
            arg === '--force' ||
            arg === '--force-with-lease' ||
            arg.startsWith('--force=') ||
            arg.startsWith('--force-with-lease=') ||
            // Combined short-flag cluster (`-fv` ≡ `-f -v`): git combines
            // short flags, so an `f` anywhere in a single-dash all-letter
            // cluster is a verbatim force-push. Mirrors the cluster-aware
            // pattern the `git clean` branch above already uses. Deliberately
            // no dry-run (`-n`) carve-out: this layer flags `--dry-run -f`
            // as destructive too (documented asymmetry vs the tools-side rule).
            /^-[a-z]*f[a-z]*$/i.test(arg) ||
            // Per-refspec force (`git push origin +main`,
            // `+HEAD:refs/heads/main`): documented git shorthand equivalent
            // to `--force` for that ref. A `+` anywhere else in a refspec
            // (branch `feature+fix`) and a leading `^` exclusion refspec are
            // not force syntax.
            arg.startsWith('+'),
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function hasExternalPublish(command: string): boolean {
  const tokens = tokenizeShell(command).map((token) => token.toLowerCase());
  for (let i = 0; i < tokens.length; i++) {
    const cmd = tokens[i];
    if (!cmd) continue;
    const args = commandSegment(tokens, i + 1);
    if (
      ['npm', 'pnpm', 'yarn', 'bun'].includes(cmd) &&
      (args.includes('publish') || args.includes('deploy'))
    ) {
      return true;
    }
    if (cmd === 'cargo' && (args.includes('publish') || args.includes('yank'))) return true;
    if ((cmd === 'docker' || cmd === 'podman') && args.includes('push')) return true;
    if (cmd === 'kubectl') {
      const deleteIdx = args.indexOf('delete');
      if (deleteIdx >= 0 && (args[deleteIdx + 1] === 'namespace' || args[deleteIdx + 1] === 'ns')) {
        return true;
      }
      if (args.includes('drain')) return true;
    }
  }
  return false;
}

/**
 * Programs that, run once per match by `find -exec`, destroy or overwrite.
 *
 * `find -exec` used to gate on the FLAG alone, so `find … -exec wc -l {} +` —
 * a line count — needed approval. What makes the shape dangerous is the fan-out
 * of a destructive program across every match, so the program is what decides.
 * Anything else the command does still faces every other gate here, which read
 * the whole line.
 */
const DESTRUCTIVE_EXEC_PROGRAMS: ReadonlySet<string> = new Set([
  'rm',
  'rmdir',
  'unlink',
  'shred',
  'srm',
  'del',
  'erase',
  'mv',
  'move',
  'chmod',
  'chown',
  'chgrp',
  'dd',
  'truncate',
  'ln',
  'remove-item',
]);

function hasFindExec(command: string): boolean {
  const tokens = tokenizeShell(command).map((token) => token.toLowerCase());
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'find') continue;
    const args = commandSegment(tokens, i + 1);
    for (let j = 0; j < args.length; j++) {
      const arg = args[j];
      if (arg !== '-exec' && arg !== '-ok' && arg !== '-execdir') continue;
      // Skip `sudo` so `-exec sudo rm {} ;` classifies as the `rm` it is.
      let k = j + 1;
      while (args[k] === 'sudo' || args[k] === 'doas') k++;
      const program = args[k];
      if (program === undefined) continue;
      const basename = program.split(/[\\/]/).pop() ?? program;
      if (DESTRUCTIVE_EXEC_PROGRAMS.has(basename.replace(/\.exe$/, ''))) return true;
    }
  }
  return false;
}

/**
 * True only when a delete TARGET is a whole-filesystem / whole-disk / whole-home
 * / system-directory wipe — the catastrophic case. A few files, a nested
 * subdirectory, or an arbitrary sibling directory outside the project are all
 * recoverable-scale and return false (frictionless under YOLO).
 */
function isCatastrophicDeleteTarget(rawTarget: string): boolean {
  const t = rawTarget.replace(/^['"]|['"]$/g, '').trim();
  if (!t) return false;
  // Wipe the current directory wholesale.
  if (t === '*' || t === '.' || t === './' || t === '.\\' || t === './*' || t === '.\\*')
    return true;
  // Strip a trailing `/*` / `\*` glob and any trailing separators so `/etc/`,
  // `/etc/*`, `~/`, `C:\*` collapse onto their root form. An all-separators
  // target ("/", "/*") collapses to '' → the filesystem root.
  const s = t.replace(/[\\/]\*+$/, '').replace(/[\\/]+$/, '');
  if (s === '') return true; // "/", "/*" → filesystem root
  // Home, in every spelling the shell expands to it. `${HOME}` is the same
  // variable as `$HOME` — probe-verified 2026-09-22: `rm -rf ${HOME}` classified
  // as not destructive while `rm -rf $HOME` was gated.
  if (s === '~' || /^\$(?:HOME|\{HOME\})$/i.test(s) || /^%USERPROFILE%$/i.test(s)) return true;
  if (/^[A-Za-z]:$/.test(s)) return true; // Windows drive root: C:, C:\, C:\*
  const norm = s.toLowerCase().replace(/\\/g, '/');
  if (CATASTROPHIC_POSIX_ROOTS.has(norm)) return true; // /etc, /usr, /home, …
  const win = norm.match(/^[a-z]:\/([^/]+)$/); // C:\Windows, C:\Users, … (top level only)
  if (win?.[1] && CATASTROPHIC_WIN_SUBDIRS.has(win[1])) return true;
  return false;
}

function hasCatastrophicDelete(command: string): boolean {
  const tokens = tokenizeShell(command);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]?.toLowerCase();
    if (!token) continue;

    // POSIX rm -rf / Remove-Item -Recurse-style recursive force delete.
    if (token === 'rm') {
      const args = tokens.slice(i + 1);
      const recursiveOrForce = args.some(
        (arg) =>
          /^-[^-]*[rf]/i.test(arg) ||
          arg === '--recursive' ||
          arg === '--force' ||
          arg === '--no-preserve-root',
      );
      if (!recursiveOrForce) continue;
      const targets = args.filter((arg) => !arg.startsWith('-') && !SHELL_OPERATORS.has(arg));
      // `rm -rf` with no operand is a whole-cwd wipe intent.
      if (targets.length === 0) return true;
      if (targets.some(isCatastrophicDeleteTarget)) return true;
    }

    if (token === 'remove-item' || token === 'ri') {
      const args = tokens.slice(i + 1);
      const recursive = args.some((arg) => {
        const a = arg.toLowerCase();
        return a === '-recurse' || a === '-force';
      });
      if (!recursive) continue;
      const targets = args.filter((arg) => !arg.startsWith('-') && !SHELL_OPERATORS.has(arg));
      if (targets.some(isCatastrophicDeleteTarget)) return true;
    }

    // Windows rmdir /s and del/erase — flags use a leading slash, so a path is
    // any non-flag token (and on Windows paths use backslashes/drive letters,
    // never a leading slash).
    if (token === 'rmdir' || token === 'rd') {
      const args = tokens.slice(i + 1);
      const recursive = args.some((arg) => arg.toLowerCase() === '/s');
      if (!recursive) continue;
      const targets = args.filter(
        (arg) => !arg.startsWith('-') && !arg.startsWith('/') && !SHELL_OPERATORS.has(arg),
      );
      if (targets.some(isCatastrophicDeleteTarget)) return true;
    }

    if (token === 'del' || token === 'erase') {
      const args = tokens.slice(i + 1);
      const targets = args.filter(
        (arg) => !arg.startsWith('-') && !arg.startsWith('/') && !SHELL_OPERATORS.has(arg),
      );
      if (targets.some(isCatastrophicDeleteTarget)) return true;
    }
  }
  return false;
}

/**
 * Best-effort detection of a shell command that writes to WrongStack's own
 * trusted state files (trust.json, config.local.json, auth.json, .key) via
 * redirection (`>`, `>>`), `tee`, `cp`/`mv`, or heredoc — even when the
 * command itself isn't "destructive" in the catastrophic sense. A write to
 * these files can disable every future confirmation prompt or inject code
 * execution at boot, so it must never be silently auto-approved under YOLO.
 *
 * Like every heuristic in this module, this is defeatable by obfuscation
 * (env-var indirection, eval, base64). It is a defense-in-depth layer, not
 * a security boundary.
 */
function hasWriteToAgentStateRoot(command: string): boolean {
  // Strategy: extract every plausible file-path token from the command, then
  // check each against isProtectedAgentStatePath. We scan:
  // 1. Redirection targets: `> path`, `>> path`, plus glued forms (`>path`,
  //    `>>path`, `2>path`, `2>>path`, `&>path`, `&>>path`, `>|path`, `>>|path`)
  // 2. `tee path` / `tee -a path`
  // 3. `cp src dst` / `mv src dst` — the last non-flag argument
  // 4. Heredoc-less `cat > path` patterns (covered by #1)
  const tokens = tokenizeShell(command);

  // 1a. Glued redirect targets — the token-based loop below only matches
  // `>` / `>>` as a standalone token, so `>~/.wrongstack/trust.json`
  // (no space) and `2>file` / `&>file` (fd-redirect with no space) are
  // missed. Scan the raw string for these forms before falling back to the
  // token loop. The `\|?` makes the bash noclobber-overriding forms
  // (`>|file`, `>>|file`) match too; the character class excludes fd-to-fd
  // redirects like `2>&1` (the `&` is in the excluded set).
  const GLUED_WRITE_REDIRECT_RE = /(?:>|>>|[&2]>|[&2]>>)\|?(?!\s)([^\s|&;()<>]+)/g;
  for (const m of command.matchAll(GLUED_WRITE_REDIRECT_RE)) {
    const target = m[1];
    if (target && looksLikeAgentStateTarget(target)) return true;
  }

  // 1b. Redirection targets — `>` or `>>` followed by a path.
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (t === '>' || t === '>>') {
      const target = tokens[i + 1];
      if (target && looksLikeAgentStateTarget(target)) return true;
    }
  }

  // 2. `tee` target — first non-flag argument after `tee`.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]?.toLowerCase();
    if (t === 'tee') {
      for (let j = i + 1; j < tokens.length; j++) {
        const arg = tokens[j];
        if (!arg || arg.startsWith('-')) continue;
        if (SHELL_OPERATORS.has(arg)) break;
        if (looksLikeAgentStateTarget(arg)) return true;
        break; // first non-flag arg is the target
      }
    }
  }

  // 3. `cp src dst` / `mv src dst` — if the destination (last non-flag arg)
  //    resolves into the agent state root.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]?.toLowerCase();
    if (t === 'cp' || t === 'copy' || t === 'mv' || t === 'move') {
      const args = commandSegment(tokens, i + 1);
      // The last non-flag, non-operator argument is the destination.
      const dst = args.filter((a) => !a.startsWith('-') && !SHELL_OPERATORS.has(a)).pop();
      if (dst && looksLikeAgentStateTarget(dst)) return true;
    }
  }

  // 4. Writers whose destination is the LAST operand. The list above covered
  //    redirection, `tee` and `cp`/`mv`, which left the everyday remainder
  //    unseen — probe-verified 2026-09-22: `sed -i`, `dd of=`, `install`,
  //    `ln -sf`, `truncate`, `rsync`, `curl -o`, `wget -O` and `tar -C` all
  //    wrote `~/.wrongstack/config.json` while classifying as not destructive,
  //    so YOLO auto-approved them. `agent-state` is gated by default precisely
  //    because a write there can disable the approval system itself.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]?.toLowerCase();
    if (t === undefined) continue;
    const base = t.replace(/^.*[\\/]/, '').replace(/\.exe$/, '');
    if (!LAST_OPERAND_WRITERS.has(base)) continue;
    const args = commandSegment(tokens, i + 1);
    const dst = args.filter((a) => !a.startsWith('-') && !SHELL_OPERATORS.has(a)).pop();
    if (dst && looksLikeAgentStateTarget(dst)) return true;
  }

  // 5. Writers naming their destination through an OPTION rather than a
  //    positional: `dd of=PATH`, `curl -o PATH`, `wget --output-document=PATH`,
  //    `tar -C DIR`. Both the glued (`-oPATH`, `of=PATH`) and separated forms.
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;
    const glued = /^(?:of|--output|--output-document|--directory)=(.+)$/i.exec(tok);
    if (glued?.[1] && looksLikeAgentStateTarget(glued[1])) return true;
    if (/^-(?:o|O|C)$/.test(tok) || /^--(?:output|output-document|directory)$/i.test(tok)) {
      const next = tokens[i + 1];
      if (next && !SHELL_OPERATORS.has(next) && looksLikeAgentStateTarget(next)) return true;
    }
    const gluedShort = /^-(?:o|O|C)(.+)$/.exec(tok);
    if (gluedShort?.[1] && looksLikeAgentStateTarget(gluedShort[1])) return true;
  }

  // 6. An inline interpreter payload that merely NAMES a protected path.
  //    `python -c "open('~/.wrongstack/config.json','w').write(...)"` hides the
  //    write inside a quoted program, where no token is a redirect or a verb.
  //    Deliberately broader than the rules above: reaching into the agent state
  //    root from an inline program is worth the confirmation prompt even when
  //    the payload only reads, because this is a gated kind, not a block.
  //    Quote PAIRING cannot find it: the payload nests quotes
  //    (`python -c "open('…','w')"`), so pairing the outer quote with the first
  //    inner one yields `open(` rather than the path. Scan for the path SHAPE
  //    instead, which is what the check actually needs.
  if (INLINE_PAYLOAD_INTERPRETERS.some((pattern) => pattern.test(command))) {
    for (const candidate of command.matchAll(/[~\w.:\\/-]*\.wrongstack[^\s'"`,)]*/gi)) {
      if (candidate[0] && looksLikeAgentStateTarget(candidate[0])) return true;
    }
  }

  // 7. Archive extraction INTO the state root. `tar -C ~/.wrongstack` names a
  //    DIRECTORY, not one of the protected basenames, so the target checks
  //    above decline it — while the extraction can drop `config.json` or a
  //    plugin entry inside. Treat any operand that resolves within the global
  //    root as a write target for these verbs.
  for (let i = 0; i < tokens.length; i++) {
    const base = tokens[i]
      ?.toLowerCase()
      .replace(/^.*[\\/]/, '')
      .replace(/\.exe$/, '');
    if (base !== 'tar' && base !== 'unzip' && base !== '7z') continue;
    for (const arg of commandSegment(tokens, i + 1)) {
      if (SHELL_OPERATORS.has(arg)) break;
      // The extraction directory per verb: GNU tar spells it `-C DIR` or
      // `--directory=DIR` (and GNU unzip spells `-d DIR`, space or glued).
      // 7-Zip has no long form: its output directory is `-o{Directory}` —
      // always GLUED, as `-o DIR` is not accepted. Matching only the short
      // letters left the long tar spelling ungated (fixed earlier), and
      // omitting `o` left 7z's only spelling ungated, so
      // `7z x a.7z -o~/.wrongstack` extracted into the trust anchor while the
      // identical tar/unzip forms were classified 'agent-state'. `o` is safe
      // to accept because the value must still resolve inside the state root.
      const value =
        /^(?:-(?:C|d|o)|--directory=)(.+)$/.exec(arg)?.[1] ??
        (arg.startsWith('-') ? undefined : arg);
      if (value && resolvesInsideAgentStateRoot(value)) return true;
    }
    const dashC = commandSegment(tokens, i + 1);
    for (let j = 0; j < dashC.length - 1; j++) {
      // Same option, space-separated spelling. The bare-operand branch above
      // also happens to catch this form, but stating it here keeps the rule
      // independent of that over-inclusive fallback.
      if (
        /^(?:-(?:C|d|o)|--directory)$/.test(dashC[j] ?? '') &&
        resolvesInsideAgentStateRoot(dashC[j + 1] ?? '')
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * True when `rawPath` resolves at or inside the wstack global root.
 *
 * Unlike {@link looksLikeAgentStateTarget} this does NOT require a protected
 * basename: it answers "does this name a place inside the trust anchor", which
 * is the right question for an extraction directory.
 */
function resolvesInsideAgentStateRoot(rawPath: string): boolean {
  if (!rawPath) return false;
  const expanded = rawPath.replace(/^~([\\/])/, (_, sep) => `${os.homedir()}${sep}`);
  const resolved = path.resolve(expanded).replace(/\\/g, '/').toLowerCase();
  const rootNorm = path.resolve(wstackGlobalRoot()).replace(/\\/g, '/').toLowerCase();
  if (resolved === rootNorm || resolved.startsWith(`${rootNorm}/`)) return true;
  // Same lexical fallback as looksLikeAgentStateTarget: the configured global
  // root is not always the literal `~/.wrongstack` (tests and alternate homes
  // relocate it), and a path naming that directory is a write into the trust
  // anchor wherever the root happens to point.
  return resolved.endsWith('/.wrongstack') || resolved.includes('/.wrongstack/');
}

/**
 * Writers whose destination is the last positional operand.
 *
 * Kept as a named set rather than inlined so the list is greppable next to the
 * redirect/tee/cp rules it completes.
 */
const LAST_OPERAND_WRITERS: ReadonlySet<string> = new Set([
  'sed',
  'install',
  'rsync',
  'ln',
  'truncate',
  'dd',
  'tar',
  'unzip',
]);

/**
 * Quick check: does the token look like it could resolve into the wstack
 * global root, and does its basename match a protected file? We delegate the
 * full path resolution to isProtectedAgentStatePath, but we pre-filter on
 * the path containing `.wrongstack` or starting with `~/.wrongstack` so we
 * don't call realpath on every token in every command.
 *
 * Coverage:
 *   1. The protected config basenames (config.json, trust.json, etc.) — the
 *      original "agent state" set: a write here can disable the approval
 *      system or inject boot-time RCE via hooks/mcpServers/plugins.
 *   2. Anything under the global plugin root (`~/.wrongstack/plugins/`) —
 *      H-4: the global plugin root ships `defaultState: 'active'`, so a
 *      single bash `> ~/.wrongstack/plugins/x.mjs` becomes boot-time code
 *      execution on the next launch (the TOFU gate pins with no prompt).
 *      No basename whitelist is needed: the global plugin root is itself
 *      the trust anchor, and every file inside it is part of the closure
 *      a plugin load imports.
 */
function looksLikeAgentStateTarget(rawPath: string): boolean {
  // Expand ~ to the home directory for the comparison.
  const expanded = rawPath.replace(/^~([\\/])/, (_, sep) => `${os.homedir()}${sep}`);
  const resolved = path.resolve(expanded);
  // Fast lexical pre-filter: must contain `.wrongstack` or match the wstack
  // global root prefix.
  const rootStr = wstackGlobalRoot();
  const resolvedNorm = resolved.replace(/\\/g, '/').toLowerCase();
  const rootNorm = path.resolve(rootStr).replace(/\\/g, '/').toLowerCase();
  if (!resolvedNorm.startsWith(rootNorm) && !resolvedNorm.includes('.wrongstack')) {
    return false;
  }
  // Coverage (2): any path inside the global plugin root is a protected
  // write target — not just the .mjs/.js entry, but the whole closure the
  // entry imports. We resolve the plugins root once per call; cheap.
  const pluginsRoot = path.resolve(rootStr, 'plugins');
  const pluginsRootNorm = pluginsRoot.replace(/\\/g, '/').toLowerCase();
  if (resolvedNorm === pluginsRootNorm || resolvedNorm.startsWith(`${pluginsRootNorm}/`)) {
    return true;
  }
  // Coverage (1): basename against the protected list (inlined to avoid a
  // circular import with permission-helpers.ts).
  return PROTECTED_STATE_BASENAMES.test(path.basename(resolved));
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
function splitShellSegments(command: string): string[] {
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

/**
 * An interpreter running an inline payload that deletes, or that runs code it
 * just downloaded.
 *
 * Both halves must sit in the SAME segment, so `git status && node -e
 * "console.log(1)"` is not read as one risky command just because a
 * 200-character window happened to span the `&&`.
 */
function hasRiskyInlinePayload(command: string): boolean {
  for (const segment of splitShellSegments(command)) {
    if (!INLINE_PAYLOAD_INTERPRETERS.some((pattern) => pattern.test(segment))) continue;
    if (PAYLOAD_FETCHES_NETWORK.test(segment) || PAYLOAD_DELETES.test(segment)) return true;
  }
  return false;
}

/**
 * The program an interpreter runs INLINE, with the `-c` / `-e` / `-Command` flag
 * and any wrapping quote stripped — so the payload can be asked the same
 * question as a bare command line.
 *
 * Needed because a quoted payload survives `tokenizeShell` as one token and,
 * more importantly, `SYSTEM_HALT_COMMAND` anchors at the START of a segment: the
 * segment head of `bash -c "shutdown -h now"` is `bash`, so the halt verb is
 * never in command position and the check declined it.
 */
const INLINE_PAYLOAD_AFTER_EVAL_FLAG =
  /\b(?:bash|sh|zsh|ksh|fish|pwsh|powershell|node|python[0-9.]*|perl|ruby)(?:\.exe)?\b[^\n]{0,200}?\s-(?:c|e|E|-eval|Command|command)\s+(.+)$/i;

function inlineEvalPayload(segment: string): string | undefined {
  const payload = INLINE_PAYLOAD_AFTER_EVAL_FLAG.exec(segment)?.[1];
  return payload?.replace(/^(['"])([\s\S]*)\1$/, '$2').trim() || undefined;
}

/**
 * `shutdown` / `reboot` in command position — in any segment of the line, or as
 * the program an interpreter was handed inline.
 *
 * Probe-verified gap (2026-09-22): `bash -c "shutdown -h now"` classified as NOT
 * destructive while `bash -c "rm -rf /"` was gated, because `PAYLOAD_DELETES`
 * reads inside an inline payload and nothing asked the same question about
 * halting. `system-halt` is gated by default and YOLO is on by default, so the
 * one shape that powers the user's machine down ran unprompted.
 *
 * The payload is matched with the SAME anchored `SYSTEM_HALT_COMMAND`, which is
 * what keeps prose out: the payload `echo shutdown` does not start with the verb.
 * A halt buried deeper still (`python -c "os.system('poweroff')"`) stays
 * unclassified on purpose — that is obfuscation, which this module's header
 * documents as out of scope rather than something to chase with more regex.
 */
function haltsTheMachine(command: string): boolean {
  return splitShellSegments(command).some((segment) => {
    if (SYSTEM_HALT_COMMAND.test(segment)) return true;
    const payload = inlineEvalPayload(segment);
    if (payload === undefined) return false;
    return splitShellSegments(payload).some((inner) => SYSTEM_HALT_COMMAND.test(inner));
  });
}

/**
 * WHAT kind of damage a command would do, as the user-facing categories the
 * YOLO confirmation menu is built from.
 *
 * These are not new taxonomy — each one is a check that already existed in this
 * file. Naming them is what lets the user keep, say, `git-history` gated while
 * letting `bulk-delete` through, instead of the all-or-nothing `yoloDestructive`
 * switch (which no surface ever wired up anyway).
 */
export type DestructiveKind =
  /** Wipes a disk or the machine: mkfs, dd to a raw device, format C:, fork bomb. */
  | 'disk-wipe'
  /** Powers the machine down or restarts it. */
  | 'system-halt'
  /** Recursive force-delete that escapes the project, or hits a system/home root. */
  | 'delete-outside'
  /** Deletes across many matches at once: `find -exec rm`, an inline `rmSync`. */
  | 'bulk-delete'
  /** Destroys VCS history or published refs: reset --hard, clean -f, push --force, filter-branch. */
  | 'git-history'
  /** Pushes outward and is hard to retract: npm publish, docker push, kubectl delete namespace. */
  | 'publish'
  /** Runs code fetched off the network — the damage is unknowable in advance. */
  | 'download-and-run'
  /** Writes WrongStack's own trusted state (config.json / trust.json / auth.json). */
  | 'agent-state'
  /** Binds a well-known third-party credential to a provider endpoint. */
  | 'credential-bind';

/**
 * The two kinds that can switch the approval system itself off, and so may
 * never be un-gated from a settings menu.
 *
 * Writing `trust.json` disables prompting permanently; writing `hooks` into
 * `config.json` is boot-time RCE on the next launch; binding
 * `ANTHROPIC_API_KEY` to an attacker-chosen `baseUrl` exfiltrates the key. All
 * three are reachable by prompt injection, and no workflow needs them
 * unattended — so a user "allow" here would only ever be someone being talked
 * into it.
 */
export const LOCKED_DESTRUCTIVE_KINDS: ReadonlySet<DestructiveKind> = new Set([
  'agent-state',
  'credential-bind',
]);

/**
 * Every kind, in the order a settings menu should list them: worst damage
 * first, the two locked ones last. Exhaustiveness is enforced by
 * `UncoveredDestructiveKind` below, so adding a kind to the union without
 * listing it here is a compile error rather than a silently un-gated category.
 */
export const ALL_DESTRUCTIVE_KINDS = [
  'disk-wipe',
  'system-halt',
  'delete-outside',
  'git-history',
  'publish',
  'download-and-run',
  'bulk-delete',
  'agent-state',
  'credential-bind',
] as const satisfies readonly DestructiveKind[];

/**
 * Compile gate for {@link ALL_DESTRUCTIVE_KINDS}. Resolves to `never` while the
 * list is complete; the moment a kind is added to the union without being
 * listed, this becomes that kind and {@link AssertAllKindsListed} fails to
 * compile — naming the offender. Exported so it counts as used.
 */
export type UnlistedDestructiveKind = Exclude<
  DestructiveKind,
  (typeof ALL_DESTRUCTIVE_KINDS)[number]
>;

/**
 * The guard that actually fires. The previous form,
 * `const _assertAllKindsListed: UnlistedDestructiveKind[] = []`, was INERT: an
 * empty array literal is assignable to `X[]` for every `X`, so it compiled with a
 * kind missing. Probe-verified 2026-09-22 by adding an unlisted kind to the union
 * — `packages/core` still typechecked cleanly. That kind would then have been
 * absent from `normalizeYoloConfirmKinds(undefined)`'s default set, i.e. silently
 * UN-GATED under YOLO: the exact failure this gate exists to prevent. A type
 * parameter constrained to `never` rejects anything else outright.
 */
type AssertNever<T extends never> = T;
export type AssertAllKindsListed = AssertNever<UnlistedDestructiveKind>;

/** True when `value` is a kind this build knows — for decoding user config. */
export function isDestructiveKind(value: unknown): value is DestructiveKind {
  return typeof value === 'string' && (ALL_DESTRUCTIVE_KINDS as readonly string[]).includes(value);
}

/**
 * The gated set a policy should actually use: unknown entries dropped, the
 * locked kinds always present.
 *
 * `undefined` means "the user has not chosen" and gates everything — the
 * fail-closed default. An EMPTY set is a real choice (gate only what is
 * locked), which is why it must not be collapsed into `undefined`.
 */
export function normalizeYoloConfirmKinds(
  kinds: Iterable<DestructiveKind> | undefined,
): ReadonlySet<DestructiveKind> {
  if (kinds === undefined) return new Set(ALL_DESTRUCTIVE_KINDS);
  const out = new Set<DestructiveKind>();
  for (const kind of kinds) if (isDestructiveKind(kind)) out.add(kind);
  for (const locked of LOCKED_DESTRUCTIVE_KINDS) out.add(locked);
  return out;
}

/**
 * Decode the user's `autonomy.yoloConfirm` map into the gated set.
 *
 * A key is gated unless the user explicitly wrote `false`, so an unknown or
 * partially-written map only ever un-gates what it names — a truncated file or
 * a kind added by a newer build stays gated rather than silently opening.
 */
export function resolveYoloConfirmKinds(
  preference: Record<string, boolean> | undefined,
): ReadonlySet<DestructiveKind> {
  if (preference === undefined) return new Set(ALL_DESTRUCTIVE_KINDS);
  return normalizeYoloConfirmKinds(
    ALL_DESTRUCTIVE_KINDS.filter((kind) => preference[kind] !== false),
  );
}

/** Set equality, so a no-op update does not flush the permission cache. */
export function sameKindSet(
  a: ReadonlySet<DestructiveKind>,
  b: ReadonlySet<DestructiveKind>,
): boolean {
  if (a.size !== b.size) return false;
  for (const kind of a) if (!b.has(kind)) return false;
  return true;
}

/**
 * Best-effort detection of a *catastrophic* shell command — system-/disk-/
 * home-wide, effectively irreversible destruction, OR a write to WrongStack's
 * own trusted state files that could disable security boundaries.
 *
 * `projectRoot` scopes the delete checks (an in-project cleanup is not an
 * escape); it is deliberately unused for catastrophic and state-root targets,
 * which are resolved absolutely.
 *
 * Returns WHICH kind matched so callers can honour a per-kind user preference.
 * Order matters only for reporting: the most severe kind wins the label.
 */
export function classifyDestructiveCommand(
  command: string,
  projectRoot: string | undefined,
): DestructiveKind | undefined {
  const trimmed = command.trim();
  if (!trimmed) return undefined;
  if (CATASTROPHIC_PATTERNS.some((pattern) => pattern.test(trimmed))) return 'disk-wipe';
  if (haltsTheMachine(trimmed)) return 'system-halt';
  if (hasWriteToAgentStateRoot(trimmed)) return 'agent-state';
  if (HIGH_IMPACT_PATTERNS.some((pattern) => pattern.test(trimmed))) return 'download-and-run';
  if (hasCatastrophicDelete(trimmed)) return 'delete-outside';
  if (hasRecursiveForceDelete(trimmed, projectRoot)) return 'delete-outside';
  if (hasGitHistoryRewrite(trimmed)) return 'git-history';
  if (hasExternalPublish(trimmed)) return 'publish';
  if (hasFindExec(trimmed)) return 'bulk-delete';
  if (hasRiskyInlinePayload(trimmed)) {
    // Both halves already matched inside one segment; the network half is the
    // more severe reading, so it wins the label.
    return splitShellSegments(trimmed).some(
      (segment) =>
        INLINE_PAYLOAD_INTERPRETERS.some((pattern) => pattern.test(segment)) &&
        PAYLOAD_FETCHES_NETWORK.test(segment),
    )
      ? 'download-and-run'
      : 'bulk-delete';
  }
  return undefined;
}

/**
 * Boolean form of {@link classifyDestructiveCommand}, kept because most callers
 * only need "is this gated at all".
 */
export function isClearlyDestructiveBashCommand(
  command: string,
  projectRoot: string | undefined,
): boolean {
  return classifyDestructiveCommand(command, projectRoot) !== undefined;
}
