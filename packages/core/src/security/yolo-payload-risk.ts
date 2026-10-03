import { COMMAND_STRING_FLAGS, splitShellSegments } from './yolo-shell-scan.js';

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
/**
 * Start of a command word: line start, after a separator / subshell / opening
 * quote (`pwsh -Command "Clear-Disk …"`), or after `sudo`/`doas` and its flags.
 * Keeps the disk tools below from firing on prose that merely names them.
 */
export const CMD_START = String.raw`(?:^|[;&|(){}\n"'\x60]\s*|\b(?:sudo|doas)\s+(?:-\S+\s+)*)`;

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
export const INLINE_PAYLOAD_INTERPRETERS: RegExp[] = [
  /\b(?:bash|sh|zsh|ksh|fish|pwsh|powershell)\b[\s\S]{0,200}-c\s*[\s$"'(]/i,
  /\b(?:node|python[0-9.]*|perl|ruby)\b[\s\S]{0,200}-[ecE]\b/i,
];

/** The payload reaches the network — the download half of download-and-run. */
export const PAYLOAD_FETCHES_NETWORK =
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
// Which flags take a SEPARATED value, PER LAUNCHER — the same fact
// `ARGV_LAUNCHERS.valueFlags` records on the tools side.
//
// A single global letter set cannot express this. `-[ugCncpskioe]` was the UNION
// of every launcher's flags applied to all of them, so `exec` was credited with
// `timeout`'s `-s`, `command` with `stdbuf`'s `-o`, and `sudo` with `-k` and `-i`
// — which sudo(8) documents as taking NO value. Each credited flag then swallowed
// the following word as its "value", promoting that word's own argument into the
// anchored verb slot: `exec -S grep shutdown` classified a plain `grep` as a
// power-down (122 such shapes measured). The union was also INCOMPLETE, which is
// how it under-credits: `-a` was missing, so the real halt
// `exec -a NAME shutdown -h now` went undetected. Scoping per launcher fixes both
// directions at once; pruning letters from the union could only trade one for the
// other.
//
// `time` is this module's own addition (absent from ARGV_LAUNCHERS); GNU time's
// `-o FILE` / `-f FORMAT` do take values.
//
// Exported for the parity guard in packages/tools/tests/danger-detect.test.ts,
// which pins this table against `ARGV_LAUNCHERS.valueFlags` so the two copies
// cannot drift apart again. Recorded as a test-only export in
// architecture/test-only-exports.json.
export const HALT_LAUNCHER_VALUE_FLAGS: ReadonlyMap<string, readonly string[]> = new Map([
  [
    'sudo',
    [
      '-u',
      '-g',
      '-C',
      '-p',
      '-h',
      '-r',
      '-t',
      '-D',
      '-R',
      '-T',
      '-U',
      '--user',
      '--group',
      '--close-from',
      '--prompt',
      '--host',
      '--role',
      '--type',
      '--chdir',
      '--chroot',
      '--command-timeout',
      '--other-user',
    ],
  ],
  ['doas', ['-u', '-C', '-a']],
  ['env', ['-u', '-C', '--unset', '--chdir']],
  ['timeout', ['-s', '-k', '--signal', '--kill-after']],
  ['nice', ['-n', '--adjustment']],
  ['ionice', ['-c', '-n', '-p']],
  ['stdbuf', ['-i', '-o', '-e']],
  ['exec', ['-a']],
  ['time', ['-o', '-f']],
  ['command', []],
  ['nohup', []],
  ['setsid', []],
  ['unbuffer', []],
]);

// The value is ONE argv token, so a quoted span is consumed whole — never as its
// first whitespace-delimited fragment, which is how `"grep -r shutdown src/"`
// used to leak `shutdown` into the verb slot. Listing the quoted spans first is
// NOT enough on its own: alternation is a preference, not an exclusion, so when
// the whole-span branch stops the overall match the engine backtracks into the
// fragment branch anyway. The unquoted branch therefore refuses a first character
// that OPENS a quote (`[^\s-"']`): a quoted value is consumed complete or not at
// all, and an unbalanced quote ends the run there — the fail-closed direction.
const HALT_LAUNCHER_VALUE = String.raw`(?:'[^']*'|"[^"]*"|[^\s-"'][^\s]*)`;

/** Longest flag first, so `--user` is never truncated to the `-u` branch. */
function haltFlagAlt(flags: readonly string[]): string {
  if (flags.length === 0) return '';
  const alts = [...flags]
    .sort((a, b) => b.length - a.length)
    .map((flag) => flag.replace(/[\\^-]/g, '\\$&'))
    .join('|');
  return `(?:${alts})\\s+${HALT_LAUNCHER_VALUE}|`;
}

// The bare numeric operand is a duration or priority — fractional included:
// GNU timeout takes `1.5m` / `.5`, and an integer-only operand left
// `timeout 1.5m shutdown -h now` unclassified (no YOLO confirmation).
const HALT_LAUNCHER_PREFIX = `(?:${[...HALT_LAUNCHER_VALUE_FLAGS]
  .map(
    ([name, flags]) =>
      `(?:${name}\\b(?:\\s+(?:${haltFlagAlt(flags)}-[^\\s]+|[A-Za-z_][A-Za-z0-9_]*=[^\\s]*|(?:\\d+(?:\\.\\d*)?|\\.\\d+)[smhd]?))*\\s+)`,
  )
  .join('|')}){0,8}`;

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

/**
 * An interpreter running an inline payload that deletes, or that runs code it
 * just downloaded.
 *
 * Both halves must sit in the SAME segment, so `git status && node -e
 * "console.log(1)"` is not read as one risky command just because a
 * 200-character window happened to span the `&&`.
 */
export function hasRiskyInlinePayload(command: string): boolean {
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
/**
 * The command line a launcher was handed inside ONE argv token, read from the
 * SAME {@link COMMAND_STRING_FLAGS} table that `tokenizeShell` expands for every
 * other destructive family.
 *
 * `inlineEvalPayload` carries its own hand-written list of launchers and flags,
 * and that list DRIFTS from the table. Four table entries are in no version of
 * the payload regex — `env` (whose `-S` / `--split-string` flags the regex does
 * not list either), `dash`, `ash` and `cmd` — so
 * `cmd /c "shutdown /s /t 0"`, the ordinary Windows spelling of a power-down,
 * reached the anchored halt regex as inert text inside one quoted token while
 * `cmd /c rm -rf ~` was gated. Asking the table is what keeps the two halves
 * from disagreeing again. The launchers both lists already know (`sh`, `bash`,
 * `zsh`, `ksh`, `fish`, `pwsh`, `powershell`) classify identically either way
 * and are pinned as parity, not as evidence of this fix.
 *
 * Anchored at the start of the segment, because the question is "what does this
 * segment RUN", not "what does it mention": `git commit -m "notes; shutdown
 * deferred"` starts with `git` and stays prose. The `=` branch covers the glued
 * `--split-string=<cmd>` spelling. Longer flags are alternated first so
 * `-command` is not truncated to `-c`.
 */
const COMMAND_STRING_PAYLOAD = new RegExp(
  `^(?:${[...COMMAND_STRING_FLAGS]
    .map(
      ([cmd, flags]) =>
        `${cmd}\\s+(?:${[...flags]
          .sort((a, b) => b.length - a.length)
          .map((flag) => flag.replace(/[\\^-]/g, '\\$&'))
          .join('|')})(?:=|\\s+)`,
    )
    .join('|')})(.+)$`,
  'i',
);

/** A halt handed to a command-string launcher: `env -S "shutdown now"`. */
function tableCommandStringPayload(segment: string): string | undefined {
  const payload = COMMAND_STRING_PAYLOAD.exec(segment)?.[1];
  return payload?.replace(/^(['"])([\s\S]*)\1$/, '$2').trim() || undefined;
}

export function haltsTheMachine(command: string): boolean {
  const asks = (segment: string): boolean => {
    if (SYSTEM_HALT_COMMAND.test(segment)) return true;
    for (const payload of [inlineEvalPayload(segment), tableCommandStringPayload(segment)]) {
      if (payload === undefined) continue;
      // The payload is asked the SAME anchored question as a bare line, which is
      // what keeps prose out: `env -S "echo shutdown"` does not start with the
      // halt verb, and a halt buried inside a language-level string stays
      // unclassified on purpose — the module header documents obfuscation as out
      // of scope rather than something to chase with more regexes.
      if (splitShellSegments(payload).some((inner) => SYSTEM_HALT_COMMAND.test(inner))) {
        return true;
      }
    }
    return false;
  };
  return splitShellSegments(command).some(asks);
}
