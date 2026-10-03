import * as os from 'node:os';
import * as path from 'node:path';
import { wstackGlobalRoot } from '../utils/wstack-paths.js';
import { INLINE_PAYLOAD_INTERPRETERS } from './yolo-payload-risk.js';
import { commandSegment, SHELL_OPERATORS, tokenizeShell } from './yolo-shell-scan.js';

/**
 * Basenames under the wstack global root that constitute WrongStack's own
 * trusted state. Duplicated from permission-helpers.ts to avoid a circular
 * import (permission-helpers imports getInputString from yolo-risk).
 * Keep in sync with AGENT_STATE_SENSITIVE_BASENAMES.
 */
const PROTECTED_STATE_BASENAMES =
  /^(?:config(?:\.local)?\.json(?:\..+)?|trust\.json|auth\.json|\.key)$/i;

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
 *   3. Anything else under the global root — the same line the write/edit
 *      tools draw (`isInsideAgentStateRoot` in permission-policy's
 *      hasAgentStateWriteTarget). The root holds more state that decides what
 *      runs or what is approved than the two cases above: session journals
 *      carry `permission_overrides` that come back live on resume, and
 *      `updates/pending.json` names the executable swapped in at exit. With
 *      only (1)+(2) a shell `echo >>` reached them while the write tool was
 *      stopped (WS-2026-09-26-04). This judges WRITES only, so the agent
 *      still reads memory and sessions without a prompt.
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
  // Coverage (3), which subsumes (2): the whole global root.
  if (resolvedNorm === rootNorm || resolvedNorm.startsWith(`${rootNorm}/`)) return true;
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
