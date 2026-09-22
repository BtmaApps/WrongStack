import { isQuoteBoundary, quoteIsEscaped } from './shell-quoting.js';

export const VALUE_TAKING_GIT_OPTIONS = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--exec-path',
  '--config-env',
  '--attr-source',
]);

export interface ShellToken {
  value: string;
  start: number;
  end: number;
}

export const MAX_LAUNCHER_TOKENS = 256;
export const MAX_LAUNCHER_LENGTH = 64 * 1024;

export function boundedShellTokens(raw: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let token = '';
  let tokenStart = -1;
  let quote: "'" | '"' | null = null;
  const limit = Math.min(raw.length, MAX_LAUNCHER_LENGTH);
  for (let index = 0; index < limit && tokens.length < MAX_LAUNCHER_TOKENS; index += 1) {
    const char = raw[index] ?? '';
    if (tokenStart < 0 && !/\s/.test(char)) tokenStart = index;
    if (char === '\\' && quote !== "'" && index + 1 < limit) {
      const escaped = raw[index + 1] ?? '';
      const shellEscaped =
        quote === '"' ? /[$\x60"\\\r\n]/.test(escaped) : /[\s'"\\;&|()`]/.test(escaped);
      token += shellEscaped ? escaped : `\\${escaped}`;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"') {
      if (quote === char) quote = null;
      else if (quote === null) quote = char;
      else token += char;
      continue;
    }
    if (quote === null && /\s/.test(char)) {
      if (tokenStart >= 0) tokens.push({ value: token, start: tokenStart, end: index });
      token = '';
      tokenStart = -1;
      continue;
    }
    token += char;
  }
  if (tokenStart >= 0 && tokens.length < MAX_LAUNCHER_TOKENS) {
    tokens.push({ value: token, start: tokenStart, end: limit });
  }
  return tokens;
}

export function shellTokens(raw: string): string[] {
  return boundedShellTokens(raw).map((token) => token.value);
}

/**
 * Optional binary-path prefix before a destructive tool name (`/bin/rm`,
 * `/usr/bin/tee`, `C:\tools\dd`). The launcher stripper and the `sh -c`
 * wrapper rule already recognize path-qualified invocations; without the
 * same allowance in the writer/find/git rules, `/bin/rm -rf .env` anchored
 * at a command boundary matched no rule and silently bypassed the guard
 * while the bare `rm -rf .env` was blocked. Non-capturing so the rules'
 * existing group numbers stay stable. No nested quantifiers: the fragment
 * is a single bounded class, so it adds no ReDoS surface.
 */
export const COMMAND_PATH_PREFIX = String.raw`(?:[^\s;&|(){}]+[\\/])?`;

export function gitInvocationArguments(command: string): string[] {
  const argumentsList: string[] = [];
  const quotedIndexes = new Uint8Array(command.length);
  let activeQuote: "'" | '"' | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (isQuoteBoundary(command, index, activeQuote)) {
      quotedIndexes[index] = 1;
      activeQuote = activeQuote === char ? null : char === "'" ? "'" : '"';
    } else if (activeQuote !== null) {
      quotedIndexes[index] = 1;
    }
  }

  const gitStart = new RegExp(
    String.raw`(?:^|[;&|\r\n]\s*|\(\s*|\u0060\s*)${COMMAND_PATH_PREFIX}git\b`,
    'gi',
  );
  let match: RegExpExecArray | null = gitStart.exec(command);
  while (match !== null) {
    const gitOffset = match[0].toLowerCase().lastIndexOf('git');
    if (gitOffset < 0 || quotedIndexes[match.index + gitOffset] === 1) {
      match = gitStart.exec(command);
      continue;
    }
    const start = gitStart.lastIndex;
    let quote: "'" | '"' | null = null;
    let end = start;
    for (; end < command.length; end += 1) {
      const char = command[end] ?? '';
      if (char === '\\' && quote !== "'") {
        end += 1;
        continue;
      }
      if (char === "'" || char === '"') {
        if (quote === char) quote = null;
        else if (quote === null) quote = char;
        continue;
      }
      if (quote === null && /[;&|)`\r\n]/.test(char)) break;
    }
    argumentsList.push(command.slice(start, end));
    gitStart.lastIndex = Math.max(end, start);
    match = gitStart.exec(command);
  }
  return argumentsList;
}

export function gitSubcommandIndex(tokens: string[]): number {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? '';
    if (token === '--') return index + 1 < tokens.length ? index + 1 : -1;
    if (!token.startsWith('-')) return index;
    const optionName =
      token.startsWith('-C') && token !== '-C' ? '-C' : (token.split('=', 1)[0] ?? token);
    const hasAttachedValue = token.includes('=') || (token.startsWith('-C') && token !== '-C');
    if (VALUE_TAKING_GIT_OPTIONS.has(optionName) && !hasAttachedValue) index += 1;
  }
  return -1;
}

export function normalizeEnvSplitPayload(payload: string): string {
  const removeUnbalanced = (value: string, quote: "'" | '"'): string => {
    let boundaries = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === quote && !quoteIsEscaped(value, index)) boundaries += 1;
    }
    return boundaries % 2 === 0 ? value : value.replaceAll(quote, '');
  };
  return removeUnbalanced(removeUnbalanced(payload, "'"), '"');
}

export function unwrapEnvSplitStringAtBoundary(command: string): string {
  const pattern = /(^|[;&|\r\n]\s*|\(\s*|`\s*)(?:[^\s;&|(){}]+[\\/])?env\b/gi;
  const match = pattern.exec(command);
  if (!match) return command;

  const boundary = match[1] ?? '';
  const afterStart = match.index + match[0].length;
  const after = command.slice(afterStart);
  const tokens = boundedShellTokens(after);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const separator = firstUnquotedShellSeparator(after, token.start, token.end);
    const tokenEnd = separator ?? token.end;
    const tokenValue = boundedShellTokens(after.slice(token.start, tokenEnd))[0]?.value ?? '';

    const attachedShort = /^-[i0v]*S(.+)$/.exec(tokenValue)?.[1];
    const attachedLong = tokenValue.startsWith('--split-string=')
      ? tokenValue.slice('--split-string='.length)
      : undefined;
    const attachedPayload = attachedShort ?? attachedLong;
    if (attachedPayload !== undefined) {
      return `${command.slice(0, match.index)}${boundary}${normalizeEnvSplitPayload(attachedPayload)}${after.slice(tokenEnd)}`;
    }

    if (!/^-[i0v]*S$/.test(tokenValue) && tokenValue !== '--split-string') {
      if (separator !== undefined) return command;
      continue;
    }
    const payload = tokens[index + 1];
    if (!payload) return command;
    const payloadSeparator = firstUnquotedShellSeparator(after, payload.start, payload.end);
    const payloadEnd = payloadSeparator ?? payload.end;
    const payloadValue = boundedShellTokens(after.slice(payload.start, payloadEnd))[0]?.value ?? '';
    return `${command.slice(0, match.index)}${boundary}${normalizeEnvSplitPayload(payloadValue)}${after.slice(payloadEnd)}`;
  }
  return command;
}

export const SUDO_VALUE_TAKING = new Set([
  '-u',
  '-g',
  '-h',
  '-p',
  '-C',
  '-R',
  '-D',
  '-r',
  '-t',
  '--user',
  '--group',
  '--host',
  '--prompt',
  '--close-from',
  '--chroot',
  '--chdir',
  '--role',
  '--type',
  '--command-timeout',
]);

export const ENV_VALUE_TAKING = new Set([
  '-u',
  '-C',
  '-P',
  '-a',
  '--argv0',
  '--unset',
  '--chdir',
  '--split-string',
]);

export const ENV_FLAG_OPTIONS = new Set([
  '-i',
  '-0',
  '-v',
  '--ignore-environment',
  '--null',
  '--debug',
  '--help',
  '--version',
]);

/**
 * Launchers that run another command with the same effect as running it
 * directly, beyond `env` and `sudo`.
 *
 * Probe-verified blind spot (2026-09-22): every writer rule anchors on a
 * command boundary, and a launcher name is not a path prefix, so `rm` in
 * `nohup rm -rf .env` sat mid-argument where no rule looked. 21 of 28 probed
 * launcher forms returned ZERO destructive targets while the bare `rm -rf .env`
 * was caught -- `nohup`, `nice`, `timeout`, `setsid`, `stdbuf`, `ionice`,
 * `command`, `exec`, `time`, `doas`, `flock`, `chroot`, `watch`, `runuser`.
 *
 * Each entry declares its own option arity. Getting that wrong in either
 * direction is a bug: consuming too little leaves the wrapped command
 * unanchored again, consuming too much swallows it. Options that take a value
 * are enumerated rather than guessed, and `positionals` covers the launchers
 * that take an operand of their own before the command (`timeout DURATION`,
 * `chroot NEWROOT`, `flock FILE`).
 *
 * The command-STRING forms (`su -c "..."`, `runuser -c "..."`,
 * `script -qc "..."`) are not argv shapes and are handled by the
 * command-string rule in shell-targets.ts instead. `runuser` appears in both
 * places, so it sets `defersToCommandString`: its `--` form
 * (`runuser -u me -- rm ...`) is stripped here, its `-c` form is left intact
 * for that rule.
 */
export const TRANSPARENT_LAUNCHERS: readonly TransparentLauncher[] = [
  { name: 'nohup', valueTaking: new Set() },
  { name: 'setsid', valueTaking: new Set() },
  { name: 'unbuffer', valueTaking: new Set() },
  { name: 'command', valueTaking: new Set() },
  { name: 'exec', valueTaking: new Set(['-a']) },
  { name: 'time', valueTaking: new Set(['-f', '--format', '-o', '--output']) },
  { name: 'nice', valueTaking: new Set(['-n', '--adjustment']) },
  {
    name: 'ionice',
    valueTaking: new Set(['-c', '-n', '-p', '-P', '-u', '--class', '--classdata', '--pid']),
  },
  {
    name: 'stdbuf',
    valueTaking: new Set(['-i', '-o', '-e', '--input', '--output', '--error']),
  },
  {
    name: 'timeout',
    valueTaking: new Set(['-s', '-k', '--signal', '--kill-after']),
    positionals: 1,
  },
  { name: 'chroot', valueTaking: new Set(['--userspec', '--groups']), positionals: 1 },
  {
    name: 'flock',
    valueTaking: new Set(['-w', '--wait', '--timeout', '-E', '--conflict-exit-code']),
    positionals: 1,
  },
  { name: 'doas', valueTaking: new Set(['-u', '-C']) },
  { name: 'watch', valueTaking: new Set(['-n', '--interval']) },
  {
    name: 'runuser',
    valueTaking: new Set(['-u', '-g', '-G', '-s', '--user', '--shell']),
    defersToCommandString: true,
  },
];

/**
 * Fixed-point passes the launcher stripper will make.
 *
 * Each pass rescans the whole command once per launcher, so nesting depth
 * costs depth x launchers scans: with the table below, `'nohup nice timeout 5
 * '.repeat(2000)` measured 1.3 s and a 3000-deep `timeout` flood 1.8 s on the
 * main thread, over a model-supplied string. Real commands nest one or two
 * launchers; the cap turns an unbounded quadratic into a bounded one.
 *
 * Exceeding it fails CLOSED, matching MAX_DESTRUCTIVE_TARGET_DEPTH: a command
 * too tangled to normalize is reported as touching everything rather than
 * silently reported as touching nothing.
 */
export const MAX_LAUNCHER_STRIP_PASSES = 16;

export function stripTransparentLaunchers(command: string): string {
  let stripped = command;
  let previous: string;
  let passes = 0;
  do {
    if (passes >= MAX_LAUNCHER_STRIP_PASSES) return 'rm -rf **';
    passes += 1;
    previous = stripped;
    let beforeUnwrap: string;
    do {
      beforeUnwrap = stripped;
      stripped = unwrapEnvSplitStringAtBoundary(stripped);
    } while (stripped !== beforeUnwrap);
    stripped = stripLauncherAtBoundary(stripped, 'env', ENV_VALUE_TAKING);
    stripped = stripLauncherAtBoundary(stripped, 'sudo', SUDO_VALUE_TAKING);
    for (const launcher of TRANSPARENT_LAUNCHERS) {
      stripped = stripLauncherAtBoundary(stripped, launcher);
    }
  } while (stripped !== previous);
  return stripped;
}

export function firstUnquotedShellSeparator(
  raw: string,
  start: number,
  end: number,
): number | undefined {
  let quote: "'" | '"' | null = null;
  for (let index = start; index < end; index += 1) {
    const char = raw[index];
    if (isQuoteBoundary(raw, index, quote)) {
      quote = quote === char ? null : char === "'" ? "'" : '"';
      continue;
    }
    if (quote === null && !quoteIsEscaped(raw, index) && /[;&|]/.test(char ?? '')) return index;
  }
  return undefined;
}

export function launcherPrefixLength(
  after: string,
  valueTaking: Set<string>,
  flagOptions?: Set<string>,
): number | undefined {
  const tokens = boundedShellTokens(after);
  let consumed = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i] ?? { value: '', start: 0, end: 0 };
    const token = tok.value;
    const separator = firstUnquotedShellSeparator(after, tok.start, tok.end);
    if (separator !== undefined) return consumed || separator;
    if (token === '--') return tok.end;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      consumed = tok.end;
      continue;
    }
    if (token === '-' || !token.startsWith('-')) break;
    const optionName = token.split('=', 1)[0] ?? token;
    const combinedValueOption = [...valueTaking].find(
      (option) => option.length === 2 && token.startsWith(option) && token !== option,
    );
    const combinedShortValueOption =
      token.startsWith('-') && !token.startsWith('--')
        ? [...valueTaking].find(
            (option) => option.length === 2 && token.includes(option[1] ?? '', 2),
          )
        : undefined;
    const hasAttachedValue = token.includes('=') || combinedValueOption !== undefined;
    if (
      !hasAttachedValue &&
      (valueTaking.has(optionName) || combinedShortValueOption !== undefined)
    ) {
      if (i + 1 >= tokens.length) return flagOptions ? undefined : tok.end;
      const valueToken = tokens[i + 1] ?? tok;
      const valueSeparator = firstUnquotedShellSeparator(after, valueToken.start, valueToken.end);
      if (valueSeparator !== undefined) return consumed || valueSeparator;
      consumed = valueToken.end;
      i += 1;
    } else {
      const knownFlag =
        flagOptions?.has(optionName) || (flagOptions !== undefined && /^-[i0v]+$/.test(token));
      const knownAttachedValue =
        hasAttachedValue && (valueTaking.has(optionName) || combinedValueOption !== undefined);
      if (flagOptions && !knownFlag && !knownAttachedValue) return undefined;
      consumed = tok.end;
    }
  }
  return consumed;
}

/**
 * Operands a launcher consumes BEFORE the command it runs -- `timeout 5 rm ...`,
 * `chroot /jail rm ...`, `flock /tmp/lock rm ...`. Stripping only the launcher
 * NAME is not enough for these: every writer rule anchors on a command
 * boundary, and `5 rm -rf .env` leaves `rm` mid-argument where no rule looks.
 */
function consumePositionals(after: string, from: number, count: number): number | undefined {
  let cursor = from;
  for (let remaining = count; remaining > 0; remaining -= 1) {
    const token = boundedShellTokens(after.slice(cursor))[0];
    if (!token) return undefined;
    const absoluteEnd = cursor + token.end;
    // Never step over a command separator to find an operand: in
    // `timeout; rm x` the `rm` is its own command and must stay visible.
    if (firstUnquotedShellSeparator(after, cursor, absoluteEnd) !== undefined) return undefined;
    if (token.value.startsWith('-')) return undefined;
    cursor = absoluteEnd;
  }
  return cursor;
}

export interface TransparentLauncher {
  /** Command name, matched case-insensitively and allowing a path prefix. */
  name: string;
  /** Options that consume the following token as their value. */
  valueTaking: Set<string>;
  /** Options accepted as bare flags; when set, an unknown option aborts the strip. */
  flagOptions?: Set<string> | undefined;
  /** Operands consumed after the option run and before the wrapped command. */
  positionals?: number | undefined;
  /**
   * Launcher that ALSO accepts the command as a quoted string (`runuser -c
   * "..."`). Stripping the launcher in that form would delete the only token
   * the command-string rule recognises and leave a bare `-c "rm -rf .env"`
   * behind, so the strip stands down and lets that rule handle it.
   */
  defersToCommandString?: boolean | undefined;
}

export function stripLauncherAtBoundary(
  command: string,
  launcher: TransparentLauncher | 'env' | 'sudo',
  valueTaking?: Set<string>,
): string {
  const spec: TransparentLauncher =
    typeof launcher === 'string'
      ? {
          name: launcher,
          valueTaking: valueTaking ?? new Set<string>(),
          flagOptions: launcher === 'env' ? ENV_FLAG_OPTIONS : undefined,
        }
      : launcher;
  const pattern = new RegExp(
    `(^|[;&|\\r\\n]\\s*|\\(\\s*|\u0060\\s*)(?:[^\\s;&|(){}]+[\\\\/])?${spec.name}\\b`,
    'i',
  );
  const match = pattern.exec(command);
  if (!match) return command;
  const boundary = match[1] ?? '';
  const afterStart = match.index + match[0].length;
  const after = command.slice(afterStart);
  if (
    spec.defersToCommandString &&
    boundedShellTokens(after)
      .slice(0, 6)
      .some((token) => /^-[A-Za-z]{0,8}c$/.test(token.value))
  ) {
    return command;
  }
  const consumed = launcherPrefixLength(after, spec.valueTaking, spec.flagOptions);
  if (consumed === undefined) {
    return `${command.slice(0, match.index)}${boundary}rm -rf **`;
  }
  const afterPositionals = spec.positionals
    ? consumePositionals(after, consumed, spec.positionals)
    : consumed;
  // An unconsumable operand means the shape was not understood. Leave the
  // command alone rather than rewrite it into something the rules would read
  // differently from the shell.
  if (afterPositionals === undefined) return command;
  return `${command.slice(0, match.index)}${boundary}${after.slice(afterPositionals).replace(/^\s+/, '')}`;
}
