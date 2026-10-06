import * as os from 'node:os';
import * as path from 'node:path';
import {
  isAgentStateExtractionTarget,
  isAgentStateWriteTarget,
  isSensitiveAgentStateBasename,
} from './agent-state-sensitivity.js';
import { INLINE_PAYLOAD_INTERPRETERS } from './yolo-payload-risk.js';
import { commandSegment, SHELL_OPERATORS, tokenizeShell } from './yolo-shell-scan.js';

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
export function hasWriteToAgentStateRoot(command: string): boolean {
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

  // 3b. `ln` and `mv` change agent-state through their SOURCE too. A hard link
  //     (`ln ~/.wrongstack/trust.json cache/t`) gives a benign name to the same
  //     inode — no realpath reveals it, so a later write to `cache/t` rewrites
  //     `trust.json`. Moving a state file away drops it (persisted deny rules,
  //     a session's overrides) just as surely as overwriting it.
  for (let i = 0; i < tokens.length; i++) {
    const base = tokens[i]
      ?.toLowerCase()
      .replace(/^.*[\\/]/, '')
      .replace(/\.exe$/, '');
    if (base !== 'ln' && base !== 'mv' && base !== 'move') continue;
    for (const arg of commandSegment(tokens, i + 1)) {
      if (SHELL_OPERATORS.has(arg)) break;
      if (!arg.startsWith('-') && looksLikeAgentStateTarget(arg)) return true;
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
 * True when extracting an archive into `rawPath` could plant agent-state.
 *
 * An extraction writes whatever names the archive carries, so the question is
 * not the directory's own name but what loads from it: the root itself, the
 * profile/project directories configs are read from, and the sensitive
 * subtrees (`agent-state-sensitivity.ts`). Extracting into a benign subtree such
 * as `cache/` stays silent.
 */
function resolvesInsideAgentStateRoot(rawPath: string): boolean {
  if (!rawPath) return false;
  const expanded = rawPath.replace(/^~([\\/])/, (_, sep) => `${os.homedir()}${sep}`);
  if (isAgentStateExtractionTarget(path.resolve(expanded))) return true;
  // Lexical fallback: the configured global root is not always the literal
  // `~/.wrongstack` (tests and alternate homes relocate it), and extracting
  // into a directory of that name plants state wherever the root points.
  const resolved = path.resolve(expanded).replace(/\\/g, '/').toLowerCase();
  return resolved.endsWith('/.wrongstack');
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
 * Does a shell write to `rawPath` land on agent-state?
 *
 * Under the global root the shared classifier decides
 * (`agent-state-sensitivity.ts`): code that runs, approval state, secrets, and
 * instructions every session obeys stay gated; the agent's own working state
 * (plans, specs, caches, logs, project memory) does not. The classifier sees
 * through symlinks, so `cache/t -> trust.json` is still `trust.json`.
 *
 * Outside it, a path that merely contains a `.wrongstack` segment (an
 * alternate home, a project's `.wrongstack/`) is judged by the sensitive
 * basenames alone, as before.
 */
function looksLikeAgentStateTarget(rawPath: string): boolean {
  // Expand ~ to the home directory for the comparison.
  const expanded = rawPath.replace(/^~([\\/])/, (_, sep) => `${os.homedir()}${sep}`);
  const resolved = path.resolve(expanded);
  if (isAgentStateWriteTarget(resolved)) return true;
  const resolvedNorm = resolved.replace(/\\/g, '/').toLowerCase();
  if (!resolvedNorm.includes('/.wrongstack/')) return false;
  return isSensitiveAgentStateBasename(path.basename(resolved));
}
