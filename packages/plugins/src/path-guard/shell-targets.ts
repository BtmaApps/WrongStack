import { isDirectoryAmbiguousPath, isUnresolvedPathScope, resolveTargetPath } from './glob.js';
import { maskNonExecutingHeredocBodies } from './shell-heredocs.js';
import {
  COMMAND_PATH_PREFIX,
  gitInvocationArguments,
  gitSubcommandIndex,
  shellTokens,
  stripTransparentLaunchers,
  VALUE_TAKING_GIT_OPTIONS,
} from './shell-launchers.js';
import {
  executableCommandSubstitutions,
  isQuoteBoundary,
  quoteIsEscaped,
} from './shell-quoting.js';

/**
 * xargs option run: bridges any mix of flag tokens and VALUE-taking options
 * (`-n 1`, `-I {}`, `--replace={}`) between `xargs` and the writer it
 * launches. A flags-only run (`(?:\s+-[^\s]+)*`) cannot span a value-taking
 * option, so `xargs -n 1 tee .env` reached the writer boundary unmatched and
 * the writer was never inspected (probe-verified 2026-08-17, chimera
 * review). Value-consuming options are enumerated explicitly so a flag-only
 * `-0` never swallows the writer command as its value.
 *
 * The value is `[^\s-][^\s]*` — NOT `[^\s]+` — and that single character is
 * load-bearing for availability, not just correctness. With `[^\s]+` both
 * alternatives match a token like `-I`: the first consumes it as an option
 * plus the FOLLOWING token as that option's value, while the second consumes
 * it alone as a flag. Every token then forks the parse, so an input of
 * repeated `-I ` costs exponential time in a regex that runs synchronously on
 * the main thread over a model-supplied command (measured before this fix:
 * 731 ms at 110 characters, 19.7 s at 128, 52 s at 134). Requiring the value
 * not to begin with `-` makes the branches mutually exclusive and collapses
 * the search: 0.2 ms at the same 128-character input, 0.6 ms at 20,000.
 *
 * Refusing a `-`-leading value is also the safe direction semantically — such
 * a token is treated as another flag, so scanning continues toward the writer
 * rather than swallowing it as an option value.
 */
const XARGS_OPTIONS = String.raw`(?:\s+(?:(?:-[InLsPjeE]|--(?:arg-file|replace|max-args|max-lines|max-chars|max-procs))\s+[^\s-][^\s]*|-[^\s]+))*`;

/**
 * Command-start boundary shared by every destructive-writer rule. All writer
 * rules (rm-family, cp|install, tee, dd, sed|ln, find) MUST use this same
 * class: a rule that only knows `[;&|\r\n]` is blind to `{ group; }`,
 * `( subshell )` and `xargs` continuations, which silently exempts that
 * writer from the guard — probe-verified 2026-08-17, where `{ cp src .env; }`
 * and `( dd if=src of=.env )` returned zero targets. The `(?<![$(])`
 * lookbehind keeps `$(` / `((` substitution opens off this path; substitution
 * bodies are inspected by the recursive destructiveTargetsAtDepth pass.
 */
const COMMAND_BOUNDARY = String.raw`(?:^|[;&|\r\n]\s*|\{\s*|(?<![$(])\(\s*|\bxargs${XARGS_OPTIONS}\s+)`;

export function commandRecursivelyDeletes(command: string): boolean {
  const stripped = stripTransparentLaunchers(maskNonExecutingHeredocBodies(command));
  if (
    new RegExp(
      String.raw`(?:^|[;&|\r\n]\s*|\{\s*|\$\(\s*|\(\s*|\u0060\s*)${COMMAND_PATH_PREFIX}find\b[^;&|)\u0060]*(?:-delete\b|-exec(?:dir)?\s+(?:[^\s;&|]+[\\/])?(?:rm|rmdir)\b)`,
      'i',
    ).test(stripped)
  ) {
    return true;
  }
  const destructive = new RegExp(
    String.raw`${COMMAND_BOUNDARY}${COMMAND_PATH_PREFIX}(rm|rmdir|del|rd|Remove-Item)\s+((?:"[^"]*"|'[^']*'|\\.|\{[^}]*\}|\([^()]*\)|[^;&|\r\n}])+)`,
    'gi',
  );
  let match: RegExpExecArray | null = destructive.exec(stripped);
  while (match !== null) {
    const tool = match[1]?.toLowerCase();
    if (tool === 'rmdir') return true;

    const tokens = (match[2]?.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []).map((arg) =>
      arg.replace(/^["']|["']$/g, ''),
    );
    let recursive = false;
    for (const token of tokens) {
      if (token === '--') break;
      if (tool === 'rm') {
        if (token === '--recursive' || /^-[^-]*[rR]/.test(token)) recursive = true;
      } else if (tool === 'remove-item') {
        if (/^-Recurse$/i.test(token) || /^-r$/i.test(token)) recursive = true;
      } else if (/^\/[a-z]*s[a-z]*$/i.test(token)) {
        recursive = true;
      }
    }
    if (recursive) return true;
    match = destructive.exec(stripped);
  }
  return false;
}

export const MAX_DESTRUCTIVE_TARGET_DEPTH = 64;

/**
 * Strip trailing `)` characters that close an enclosing subshell rather than
 * belonging to the operand text. In the compact form `(cp src .env)` the
 * closer glues onto the capture (`src .env)`) and the destination tokenizes
 * as `.env)` — which matches no protect glob, silently defeating the guard
 * (chimera review 2026-08-17). A `)` that balances an earlier `(` inside the
 * text is filename punctuation (`notes(2)`) and is preserved; parens inside
 * quotes are ignored, so quoted operands ending in `)` survive too.
 */
function stripSubshellClosers(raw: string): string {
  let result = raw.trimEnd();
  while (result.endsWith(')')) {
    // An escaped trailing `\)` is filename text, not a subshell closer —
    // stripping it corrupted the reported target (`protected\)` became
    // `protected\`, matching no protect glob). Same convention as
    // executableCommandSubstitutions: escaped parens do not count.
    if (quoteIsEscaped(result, result.length - 1)) break;
    let quote: "'" | '"' | null = null;
    let depth = 0;
    for (let index = 0; index < result.length - 1; index += 1) {
      const char = result[index];
      if (isQuoteBoundary(result, index, quote)) {
        quote = quote === char ? null : char === "'" ? "'" : '"';
        continue;
      }
      if (quote !== null) continue;
      if (char === '(' && !quoteIsEscaped(result, index)) depth += 1;
      else if (char === ')' && !quoteIsEscaped(result, index)) depth -= 1;
    }
    // Keep the closer only when it balances an open paren in the operand.
    if (depth > 0) break;
    result = result.slice(0, -1).trimEnd();
  }
  return result;
}

export function destructiveTargets(command: string): string[] {
  return destructiveTargetsAtDepth(command, 0);
}

export function destructiveTargetsAtDepth(command: string, depth: number): string[] {
  if (depth >= MAX_DESTRUCTIVE_TARGET_DEPTH) return ['**'];

  const normalizedCommand = stripTransparentLaunchers(maskNonExecutingHeredocBodies(command));
  const targets: string[] = [];
  const quotedIndexes = new Uint8Array(normalizedCommand.length);
  let activeQuote: "'" | '"' | null = null;
  for (let index = 0; index < normalizedCommand.length; index += 1) {
    const char = normalizedCommand[index];
    if (isQuoteBoundary(normalizedCommand, index, activeQuote)) {
      quotedIndexes[index] = 1;
      activeQuote = activeQuote === char ? null : char === "'" ? "'" : '"';
    } else if (activeQuote !== null) {
      quotedIndexes[index] = 1;
    }
  }
  const tokenIsQuoted = (match: RegExpExecArray, token: string): boolean => {
    const offset = match[0].toLowerCase().indexOf(token.toLowerCase());
    return offset >= 0 && quotedIndexes[match.index + offset] === 1;
  };
  const shellOperandTokens = (raw: string): string[] => {
    const tokens = shellTokens(raw);
    const redirectIndex = tokens.findIndex((token) => /^(?:\d*(?:<>|>>?|<)|&>>?)/.test(token));
    return redirectIndex === -1 ? tokens : tokens.slice(0, redirectIndex);
  };
  const shellArgs = (raw: string): string[] => {
    const lastNonWhitespace = raw.search(/\s*$/) - 1;
    let quote: "'" | '"' | null = null;
    for (let index = 0; index < lastNonWhitespace; index += 1) {
      if (isQuoteBoundary(raw, index, quote)) {
        const char = raw[index];
        quote = quote === char ? null : char === "'" ? "'" : '"';
      }
    }
    const args =
      raw[lastNonWhitespace] === ')' && quote === null && !quoteIsEscaped(raw, lastNonWhitespace)
        ? raw.slice(0, lastNonWhitespace)
        : raw;
    return shellOperandTokens(args).filter((arg) => arg.length > 0 && !arg.startsWith('-'));
  };

  for (const body of executableCommandSubstitutions(normalizedCommand)) {
    let executableBody = body.trim();
    while (executableBody.startsWith('(') && executableBody.endsWith(')')) {
      executableBody = executableBody.slice(1, -1).trim();
    }
    targets.push(...destructiveTargetsAtDepth(executableBody, depth + 1));
  }

  const destructive = new RegExp(
    String.raw`${COMMAND_BOUNDARY}(?:sudo\s+)?${COMMAND_PATH_PREFIX}(rm|rmdir|del|rd|Remove-Item|unlink|truncate|shred|mv)\s+((?:"[^"]*"|'[^']*'|\\.|\{[^}]*\}|\([^()]*\)|[^;&|\r\n}])+)`,
    'gi',
  );
  let m: RegExpExecArray | null = destructive.exec(normalizedCommand);
  while (m !== null) {
    // No stripSubshellClosers needed here: shellArgs() already drops one
    // trailing subshell closer and keeps it when escaped (`.env\)` stays
    // literal filename text) — the same convention stripSubshellClosers
    // enforces for the cp/install and dd paths.
    if (!tokenIsQuoted(m, m[1] ?? '')) targets.push(...shellArgs(m[2] ?? ''));
    m = destructive.exec(normalizedCommand);
  }

  const copy = new RegExp(
    String.raw`${COMMAND_BOUNDARY}(?:sudo\s+)?${COMMAND_PATH_PREFIX}(cp|install)\s+([^;&|\r\n]+)`,
    'gi',
  );
  let c: RegExpExecArray | null = copy.exec(normalizedCommand);
  while (c !== null) {
    if (tokenIsQuoted(c, c[1] ?? '')) {
      c = copy.exec(normalizedCommand);
      continue;
    }
    // Strip subshell closers from the raw capture before tokenizing: in the
    // compact form `(cp src .env)` the closer glues onto the destination
    // token (`.env)`), which matches no protect glob. Done at the raw level
    // (not per token) so balanced parens in filenames (`notes(2)`) and
    // quoted operands survive.
    const tokens = shellTokens(stripSubshellClosers(c[2] ?? ''));
    let destination: string | undefined;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token === '-t' || token === '--target-directory') {
        destination = tokens[index + 1];
        break;
      }
      if (token?.startsWith('--target-directory=')) {
        destination = token.slice('--target-directory='.length);
        break;
      }
    }
    destination ??= tokens.filter((arg) => arg.length > 0 && !arg.startsWith('-')).at(-1);
    if (destination) targets.push(destination);
    c = copy.exec(normalizedCommand);
  }

  const tee = new RegExp(
    String.raw`${COMMAND_BOUNDARY}(?:sudo\s+)?${COMMAND_PATH_PREFIX}(tee)\s+([^;&|\r\n]+)`,
    'gi',
  );
  let t: RegExpExecArray | null = tee.exec(normalizedCommand);
  while (t !== null) {
    if (!tokenIsQuoted(t, t[1] ?? '')) targets.push(...shellArgs(t[2] ?? ''));
    t = tee.exec(normalizedCommand);
  }

  const dd = new RegExp(
    String.raw`${COMMAND_BOUNDARY}(?:sudo\s+)?${COMMAND_PATH_PREFIX}(dd)\s+([^;&|\r\n]+)`,
    'gi',
  );
  let d: RegExpExecArray | null = dd.exec(normalizedCommand);
  while (d !== null) {
    if (!tokenIsQuoted(d, d[1] ?? '')) {
      const outputMatch = /(?:^|\s)of=("[^"]*"|'[^']*'|[^\s]+)/i.exec(d[2] ?? '');
      // stripSubshellClosers runs before quote-stripping so a quoted operand
      // ending in `)` (`of="notes(2)"`) is not mistaken for subshell punctuation.
      const output = outputMatch?.[1]
        ? stripSubshellClosers(outputMatch[1]).replace(/^['"]|['"]$/g, '')
        : undefined;
      if (output) targets.push(output);
    }
    d = dd.exec(normalizedCommand);
  }

  const overwrite = new RegExp(
    String.raw`${COMMAND_BOUNDARY}(?:sudo\s+)?${COMMAND_PATH_PREFIX}(sed|ln)\s+([^;&|\r\n]+)`,
    'gi',
  );
  let o: RegExpExecArray | null = overwrite.exec(normalizedCommand);
  while (o !== null) {
    const rawArgs = o[2] ?? '';
    const tool = o[1]?.toLowerCase();
    if (tool && tokenIsQuoted(o, tool)) {
      o = overwrite.exec(normalizedCommand);
      continue;
    }
    if (tool === 'sed' && /(?:^|\s)-i(?:[^\s]*)?(?:\s|$)/.test(rawArgs)) {
      const args = shellArgs(rawArgs);
      targets.push(...args.slice(1));
    } else if (tool === 'ln' && /(?:^|\s)-[^\s]*f[^\s]*(?:\s|$)/.test(rawArgs)) {
      const destination = shellArgs(rawArgs).at(-1);
      if (destination) targets.push(destination);
    }
    o = overwrite.exec(normalizedCommand);
  }

  const xargsPipeline = new RegExp(
    String.raw`\b(?:echo|printf)\s+([^|]+)\|\s*xargs${XARGS_OPTIONS}\s+(?:sudo\s+)?${COMMAND_PATH_PREFIX}(?:rm|rmdir|del|unlink|truncate|shred)\b`,
    'gi',
  );
  let x: RegExpExecArray | null = xargsPipeline.exec(normalizedCommand);
  while (x !== null) {
    if (!tokenIsQuoted(x, 'xargs')) targets.push(...shellArgs(x[1] ?? ''));
    x = xargsPipeline.exec(normalizedCommand);
  }

  for (const rawArguments of gitInvocationArguments(normalizedCommand)) {
    const invocationTokens = shellOperandTokens(rawArguments);
    const commandIndex = gitSubcommandIndex(invocationTokens);
    if (commandIndex >= 0) {
      let gitCwd = '';
      let workTree: string | undefined;
      for (let index = 0; index < commandIndex; index += 1) {
        const token = invocationTokens[index] ?? '';
        if (token === '--') continue;
        const optionName =
          token.startsWith('-C') && token !== '-C' ? '-C' : (token.split('=', 1)[0] ?? token);
        let optionValue = token.includes('=') ? token.slice(token.indexOf('=') + 1) : undefined;
        if (token.startsWith('-C') && token !== '-C') optionValue = token.slice(2);
        if (VALUE_TAKING_GIT_OPTIONS.has(optionName) && optionValue === undefined) {
          optionValue = invocationTokens[index + 1];
          index += 1;
        }
        if (optionName === '-C' && optionValue)
          gitCwd = resolveTargetPath(optionValue, gitCwd || undefined);
        if (optionName === '--work-tree' && optionValue) workTree = optionValue;
      }
      const subcommand = invocationTokens[commandIndex]?.toLowerCase();
      const tokens = invocationTokens.slice(commandIndex + 1);
      const gitTreeRoot = workTree ? resolveTargetPath(workTree, gitCwd || undefined) : gitCwd;
      const gitTarget = (target: string): string => {
        const resolved = resolveTargetPath(target, gitTreeRoot || undefined);
        return target.endsWith('/') && !resolved.endsWith('/') ? `${resolved}/` : resolved;
      };
      const gitPathspecTargets = (pathspec: string): string[] => {
        if (isUnresolvedPathScope(pathspec) || !isDirectoryAmbiguousPath(pathspec)) {
          return [gitTarget(pathspec)];
        }
        return [gitTarget(`${pathspec.replace(/\/$/, '')}/**`)];
      };
      const fileSourcedPathspecScope = (pathspecTokens: string[]): string | undefined => {
        const usesPathspecFile = pathspecTokens.some(
          (token, index) =>
            token.startsWith('--pathspec-from-file=') ||
            (token === '--pathspec-from-file' && pathspecTokens[index + 1] !== undefined),
        );
        return usesPathspecFile ? gitTarget('**') : undefined;
      };
      if (subcommand === 'clean') {
        const dryRun = tokens.some((t) => t === '--dry-run' || /^-[^-]*n/.test(t));
        if (!dryRun) {
          const operands: string[] = [];
          for (let i = 0; i < tokens.length; i += 1) {
            const t = tokens[i] ?? '';
            if (t === '-e' || t === '--exclude' || t === '--exclude-from') {
              i += 1;
              continue;
            }
            if (
              t.startsWith('--exclude=') ||
              t.startsWith('--exclude-from=') ||
              /^-e.+/.test(t) ||
              t.startsWith('-')
            )
              continue;
            operands.push(t);
          }
          targets.push(
            ...(operands.length ? operands : ['.']).map((operand) =>
              gitTarget(operand.endsWith('/') ? `${operand}**` : operand),
            ),
          );
        }
      } else if (subcommand === 'rm') {
        const writes = !tokens.includes('--cached') || tokens.includes('--worktree');
        if (writes) {
          const recursive = tokens.some((t) => t === '--recursive' || /^-[^-]*r/.test(t));
          const operands = tokens.filter((t) => t !== '--' && !t.startsWith('-'));
          targets.push(...operands.map((o) => gitTarget(recursive ? `${o}/**` : o)));
          const unresolvedFileScope = fileSourcedPathspecScope(tokens);
          if (unresolvedFileScope) targets.push(unresolvedFileScope);
        }
      } else if (subcommand === 'restore') {
        const staged = tokens.includes('--staged') || tokens.some((t) => /^-[^-]*S/.test(t));
        const worktree = tokens.includes('--worktree') || tokens.some((t) => /^-[^-]*W/.test(t));
        if (!staged || worktree) {
          const operands: string[] = [];
          for (let index = 0; index < tokens.length; index += 1) {
            const token = tokens[index] ?? '';
            if (token === '--source' || token === '-s') {
              index += 1;
              continue;
            }
            if (token.startsWith('--source=') || (/^-s.+/.test(token) && token !== '--staged')) {
              continue;
            }
            if (token !== '--' && !token.startsWith('-')) operands.push(token);
          }
          targets.push(...operands.flatMap(gitPathspecTargets));
          const unresolvedFileScope = fileSourcedPathspecScope(tokens);
          if (unresolvedFileScope) targets.push(unresolvedFileScope);
        }
      } else if (subcommand === 'checkout' || subcommand === 'switch') {
        const separator = tokens.indexOf('--');
        if (separator >= 0) {
          const paths = tokens.slice(separator + 1);
          targets.push(...paths.flatMap(gitPathspecTargets));
        } else {
          const createFlags =
            subcommand === 'checkout'
              ? new Set(['-b', '-B', '--branch', '--orphan'])
              : new Set(['-c', '-C', '--create', '--force-create']);
          const createIndex = tokens.findIndex((token) => createFlags.has(token));
          const branchNameIndex = createIndex >= 0 ? createIndex + 1 : -1;
          const operands = tokens.filter(
            (token, index) => !token.startsWith('-') && index !== branchNameIndex,
          );
          if (operands.length > 0) targets.push(gitTarget('.'));
        }
      } else if (subcommand === 'stash') {
        const action = tokens.find((token) => !token.startsWith('-'))?.toLowerCase();
        if (action === undefined || /^(?:push|save|pop|apply)$/.test(action)) {
          targets.push(gitTarget('.'));
        }
      } else if (
        subcommand === 'reset' &&
        tokens.some((t) => t === '--hard' || t === '--merge' || t === '--keep')
      )
        targets.push(gitTarget('.'));
    }
  }

  const findDelete = new RegExp(
    String.raw`(?:^|[;&|\r\n]\s*|\{\s*|\$\(\s*|\(\s*|\u0060\s*)${COMMAND_PATH_PREFIX}find\b([^;&|)\u0060]*(?:\s-delete(?:[\s;})]|$)|\s-exec(?:dir)?\s+(?:[^\s;&|]+[\\/])?(?:rm|rmdir)\b)[^;&|)\u0060]*)`,
    'gi',
  );
  let f: RegExpExecArray | null = findDelete.exec(normalizedCommand);
  while (f !== null) {
    const tokens = shellTokens(f[1] ?? '');
    const expressionIndex = tokens.findIndex(
      (token) => token.startsWith('-') || token === '!' || token === '(',
    );
    const roots = (expressionIndex === -1 ? tokens : tokens.slice(0, expressionIndex)).filter(
      (token) => token.length > 0,
    );
    targets.push(...(roots.length > 0 ? roots : ['.']));
    f = findDelete.exec(normalizedCommand);
  }

  const shellWrapper = /\b(?:(?:ba|z|k)?sh|pwsh|powershell)\s+(?:-c|-Command)\s+(['"])(.*?)\1/gi;
  let w: RegExpExecArray | null = shellWrapper.exec(normalizedCommand);
  while (w !== null) {
    if (w[2] && !tokenIsQuoted(w, w[0].split(/\s/)[0] ?? '')) {
      targets.push(...destructiveTargetsAtDepth(w[2], depth + 1));
    }
    w = shellWrapper.exec(normalizedCommand);
  }

  let quote: "'" | '"' | null = null;
  for (let index = 0; index < normalizedCommand.length; index += 1) {
    const char = normalizedCommand[index];
    if (char === '\n') {
      quote = null;
      continue;
    }
    if (isQuoteBoundary(normalizedCommand, index, quote)) {
      quote = quote === char ? null : char === "'" ? "'" : '"';
      continue;
    }
    if (quote !== null || char !== '>') continue;
    const redirectsBothStreams = normalizedCommand[index + 1] === '&';
    const overridesNoclobber = normalizedCommand[index + 1] === '|';
    if (redirectsBothStreams || overridesNoclobber || normalizedCommand[index + 1] === '>') {
      index += 1;
    }
    while (normalizedCommand[index + 1] === ' ' || normalizedCommand[index + 1] === '\t') {
      index += 1;
    }
    const targetQuote = normalizedCommand[index + 1];
    let end = index + 1;
    let target: string;
    if (targetQuote === "'" || targetQuote === '"') {
      end = normalizedCommand.indexOf(targetQuote, index + 2);
      if (end === -1) continue;
      target = normalizedCommand.slice(index + 2, end);
    } else {
      while (end < normalizedCommand.length && !/[\s;&|>()]/.test(normalizedCommand[end] ?? '')) {
        end += 1;
      }
      target = normalizedCommand.slice(index + 1, end);
    }
    if (target && !(redirectsBothStreams && (/^\d+$/.test(target) || target === '-'))) {
      targets.push(target);
    }
    index = end;
  }
  return [
    ...new Set(
      targets
        .map((target) => target.replace(/^['"]|['"]$/g, ''))
        .filter((target) => target !== '/dev/null' && target.toLowerCase() !== 'nul'),
    ),
  ];
}
export type { HeredocDelimiter } from './shell-heredocs.js';
export {
  commandSegmentBeforeHeredoc,
  heredocDelimiterOnLine,
  maskNonExecutingHeredocBodies,
} from './shell-heredocs.js';
export type { ShellToken } from './shell-launchers.js';
export {
  boundedShellTokens,
  ENV_FLAG_OPTIONS,
  ENV_VALUE_TAKING,
  firstUnquotedShellSeparator,
  gitInvocationArguments,
  gitSubcommandIndex,
  launcherPrefixLength,
  MAX_LAUNCHER_LENGTH,
  MAX_LAUNCHER_TOKENS,
  normalizeEnvSplitPayload,
  SUDO_VALUE_TAKING,
  shellTokens,
  stripLauncherAtBoundary,
  stripTransparentLaunchers,
  unwrapEnvSplitStringAtBoundary,
  VALUE_TAKING_GIT_OPTIONS,
} from './shell-launchers.js';
export {
  executableCommandSubstitutions,
  isQuoteBoundary,
  quoteIsEscaped,
} from './shell-quoting.js';

export function commandDeletesImplicitScope(command: string): boolean {
  const stripped = stripTransparentLaunchers(maskNonExecutingHeredocBodies(command));
  for (const rawArguments of gitInvocationArguments(stripped)) {
    const tokens = shellTokens(rawArguments);
    const commandIndex = gitSubcommandIndex(tokens);
    const subcommand = commandIndex >= 0 ? tokens[commandIndex]?.toLowerCase() : undefined;
    const operands = tokens.slice(commandIndex + 1);
    if (/^(?:clean|restore|reset|checkout|switch)$/.test(subcommand ?? '')) return true;
    if (subcommand === 'stash') {
      const action = operands.find((token) => !token.startsWith('-'))?.toLowerCase();
      if (action === undefined || /^(?:push|save|pop|apply)$/.test(action)) return true;
    }
  }
  return false;
}
