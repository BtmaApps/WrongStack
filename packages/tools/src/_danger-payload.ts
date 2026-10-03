/** Interpreters whose `-c` / `-e` / `-Command` operand is a command LINE. */
const INLINE_PAYLOAD_FLAGS = new Set([
  '-c',
  '-e',
  '-E',
  '--eval',
  '-eval',
  '-command',
  '--command',
  '-commandwithargs',
]);

const INLINE_PAYLOAD_HOSTS = new Set([
  'bash',
  'sh',
  'zsh',
  'ksh',
  'fish',
  'pwsh',
  'powershell',
  'node',
  'python',
  'python2',
  'python3',
  'perl',
  'ruby',
]);

/** Shell/PowerShell operators that end one command in a line and start the next. */
const PAYLOAD_SEPARATORS = new Set([';', '&&', '||', '|', '&', '\n']);

/**
 * Split a command line into the argv of each command it chains, keeping a
 * quoted run as one token. `cd /tmp && rm -rf x` is two commands; read as one,
 * `rm` was only an argument of `cd` and no cmd-keyed rule saw it.
 */
function splitPayload(payload: string): string[][] {
  const commands: string[][] = [];
  let current: string[] = [];
  for (const token of payload.match(/"[^"]*"|'[^']*'|&&|\|\||[;|&\n]|[^\s;|&]+/g) ?? []) {
    if (PAYLOAD_SEPARATORS.has(token)) {
      if (current.length > 0) commands.push(current);
      current = [];
      continue;
    }
    current.push(token.replace(/^(['"])([\s\S]*)\1$/, '$2'));
  }
  if (current.length > 0) commands.push(current);
  return commands;
}

/**
 * The (cmd, args) pairs hiding inside an inline interpreter payload, one per
 * chained command.
 *
 * A real invocation ships the payload as ONE argv string —
 * `powershell -Command "Remove-Item -Recurse -Force C:\Users\x"` arrives as
 * `['-Command', 'Remove-Item -Recurse -Force C:\Users\x']`. Every rule here
 * matches its flags per-ARG and anchored, so nothing in that single string
 * matched and the assessment came back `safe` (probe-verified 2026-09-22) — while
 * the artificially pre-split spelling the tests used was flagged. The core-side
 * permission gate joins cmd+args into a line and classified these correctly, so
 * the confirmation still happened; the banner that explains WHY did not.
 *
 * Returned as an extra pair rather than by rewriting the input, reusing the same
 * mechanism the launcher unwrapping already uses — so a rule keyed on the
 * interpreter itself (`inline-eval`, `pipe-to-shell`) keeps firing too.
 */
export function inlinePayloadPairs(
  cmd: string,
  args: readonly string[],
): Array<{ cmd: string; args: readonly string[] }> {
  const base = cmd
    .toLowerCase()
    .replace(/^.*[\\/]/, '')
    .replace(/\.(?:exe|cmd|bat|com)$/, '');
  if (!INLINE_PAYLOAD_HOSTS.has(base)) return [];
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i]?.toLowerCase();
    if (flag === undefined || !INLINE_PAYLOAD_FLAGS.has(flag)) continue;
    const payload = args[i + 1];
    // Only a payload that actually looks like a command LINE is worth
    // re-reading: a single bare token is already visible to every rule.
    if (payload === undefined || !/\s/.test(payload.trim())) return [];
    return splitPayload(payload).map(([head = '', ...rest]) => ({ cmd: head, args: rest }));
  }
  return [];
}
