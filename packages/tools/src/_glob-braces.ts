/**
 * Brace ALTERNATION (`*.{ts,tsx}`, `{src,lib}/**`) for path globs.
 *
 * core's `compilePathGlob` treats `{`/`}` as literal characters — on purpose:
 * it also matches trust patterns, where alternation would widen approvals. A
 * file-finding glob is different: `**\/*.{ts,tsx}` is the everyday spelling,
 * and reading it literally answered "no such files" instead of the files.
 *
 * Only a group containing a comma alternates; `{id}` stays literal, since both
 * braces are legal in file names. Nested groups expand innermost first. The
 * expansion is capped so a hostile pattern stays a handful of globs.
 */
const ALTERNATION_GROUP = /\{([^{}]*,[^{}]*)\}/;
const MAX_ALTERNATIVES = 64;

export function expandBraceAlternation(pattern: string, limit = MAX_ALTERNATIVES): string[] {
  const m = ALTERNATION_GROUP.exec(pattern);
  if (!m) return [pattern];
  const head = pattern.slice(0, m.index);
  const tail = pattern.slice(m.index + m[0].length);
  const out: string[] = [];
  for (const alt of m[1]!.split(',')) {
    for (const p of expandBraceAlternation(head + alt + tail, limit - out.length)) {
      out.push(p);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
