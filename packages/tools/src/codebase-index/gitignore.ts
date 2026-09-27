/**
 * Minimal but faithful `.gitignore` matcher for the indexer.
 *
 * Supports the parts of the gitignore spec that matter for skipping source
 * files: comments / blanks, `!` negation (last match wins), trailing-slash
 * directory-only rules, leading-slash / embedded-slash anchoring, and the
 * `*` / `**` / `?` / `[...]` globs (via core's {@link compileGlobMatcher}).
 *
 * Only the project-root `.gitignore` is read. Nested `.gitignore` files are not
 * walked — the common build/dependency dirs that would live deeper are already
 * covered by the indexer's always-on `DEFAULT_IGNORE`.
 *
 * Known limitation: a `!negated` file inside an ignored directory will not be
 * re-included, because the indexer prunes ignored directories before descending
 * (a large performance win). This matches most lightweight implementations.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  type CompiledGlobMatcher,
  compileGlobMatcher,
  type GlobBoundary,
} from '@wrongstack/core/utils';

export type IgnoreMatcher = (relPath: string, isDir: boolean) => boolean;

interface Rule {
  /**
   * The body split at each `/**\/`, which must match zero or more whole
   * directories. Handed to core's glob as one pattern, `**\/` compiles to
   * `.*` — it swallows the slash — so `a/**\/b` also matched `a/xb`.
   */
  parts: CompiledGlobMatcher[];
  /** Where the rule body is allowed to begin in the path. */
  isStart: GlobBoundary;
  negated: boolean;
  dirOnly: boolean;
}

/**
 * A gitignore rule is the glob body wrapped in an anchor prefix and a
 * "…or anything under it" suffix. This used to be built by splicing the
 * `compileGlob` regex SOURCE into a larger regex — which inherited that
 * regex's catastrophic backtracking (WS-SEC-ReDoS), and made a
 * repo-committed `.gitignore` line a process-wedging input.
 *
 * The wrapper is expressed as boundary predicates instead, and matched with
 * {@link CompiledGlobMatcher.testSpan}. The equivalence is exact:
 *
 *   `(?:^|.*\/)` before the body ≡ the body may START at index 0 or just
 *       after any `/`.  (Note this is NOT the same as prefixing the glob with
 *       `**\/`: `**\/foo` compiles to `.*foo`, which would also match
 *       `barfoo`. The boundary predicate keeps the required slash.)
 *   `(?:\/.*)?$`  after the body  ≡ the body may END at the end of the path
 *       or immediately before any `/`.
 *   `\/.*$`       after the body  ≡ the body must END immediately before a `/`
 *       (strictly *under* the named directory).
 *
 * All candidate boundaries are explored inside one linear left-to-right pass,
 * so a rule costs O(pattern × path) regardless of path depth.
 */
const START_ANCHORED: GlobBoundary = (index) => index === 0;
const START_ANY_SEGMENT: GlobBoundary = (index, input) => index === 0 || input[index - 1] === '/';
/** End of path, or right before a `/` — the entry itself, or anything under it. */
const END_EQ_OR_UNDER: GlobBoundary = (index, input) =>
  index === input.length || input[index] === '/';
/** Right before a `/` only — strictly under the entry. */
const END_UNDER: GlobBoundary = (index, input) => index < input.length && input[index] === '/';

/**
 * Match `parts` (a body split at `/**\/`) as consecutive spans: each part ends
 * right before a `/`, and the next begins after that `/` or after any later
 * one — the "zero or more directories" in between.
 */
function matchParts(
  parts: readonly CompiledGlobMatcher[],
  p: string,
  isStart: GlobBoundary,
  isEnd: GlobBoundary,
): boolean {
  const [first, ...rest] = parts;
  if (!first) return false;
  if (rest.length === 0) return first.testSpan(p, isStart, isEnd);
  for (let k = p.indexOf('/'); k !== -1; k = p.indexOf('/', k + 1)) {
    if (!first.testSpan(p, isStart, (index) => index === k)) continue;
    const afterSlash: GlobBoundary = (index, input) => index > k && input[index - 1] === '/';
    if (matchParts(rest, p, afterSlash, isEnd)) return true;
  }
  return false;
}

/** Compile a list of raw `.gitignore` lines into a matcher. */
export function compileGitignore(lines: string[]): IgnoreMatcher {
  const rules: Rule[] = [];

  for (const raw of lines) {
    let line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    line = line.trim();

    let negated = false;
    if (line.startsWith('!')) {
      negated = true;
      line = line.slice(1);
    } else if (line.startsWith('\\#') || line.startsWith('\\!')) {
      // git's escapes for a name that really begins with `#` / `!`.
      line = line.slice(1);
    }

    let dirOnly = false;
    if (line.endsWith('/')) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    if (!line) continue;

    // A slash anywhere (after the trailing slash is stripped) anchors the
    // pattern to the gitignore's directory (the project root here). A bare name
    // matches at any depth.
    let anchored = line.startsWith('/') || line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    // A leading `**/` means "in any directory": the same start rule as a bare
    // name, not an anchored `.*` prefix (which also matched `barfoo` for
    // `**/foo`).
    if (line.startsWith('**/')) {
      while (line.startsWith('**/')) line = line.slice(3);
      anchored = false;
    }
    if (!line) continue;

    rules.push({
      // `/**/**/` is one "zero or more directories", not two.
      parts: line
        .replace(/(?:\/\*\*)+\//g, '/**/')
        .split('/**/')
        .map((part) => compileGlobMatcher(part)),
      isStart: anchored ? START_ANCHORED : START_ANY_SEGMENT,
      negated,
      dirOnly,
    });
  }

  const hasNegation = rules.some((r) => r.negated);

  return (relPath: string, isDir: boolean): boolean => {
    const p = relPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    let ignored = false;
    for (const r of rules) {
      // A directory-only rule never matches a file by its own name; it only
      // matches files that live strictly beneath the named directory.
      const isEnd = r.dirOnly && !isDir ? END_UNDER : END_EQ_OR_UNDER;
      if (matchParts(r.parts, p, r.isStart, isEnd)) {
        ignored = !r.negated;
        if (!hasNegation && ignored) return true;
      }
    }
    return ignored;
  };
}

/** Paths remembered per compiled matcher before the memo starts over. */
const MATCH_MEMO_LIMIT = 100_000;

/**
 * Remember answers per path. Every full run asks about every listed path, and
 * a `!negation` anywhere in the file (this repository has one) disables the
 * early exit, so each question walked all ~300 rules — about 100 ms a run
 * spent re-deriving answers that only change when `.gitignore` does.
 */
function memoizeMatcher(matcher: IgnoreMatcher): IgnoreMatcher {
  const files = new Map<string, boolean>();
  const dirs = new Map<string, boolean>();
  return (relPath, isDir) => {
    const memo = isDir ? dirs : files;
    const known = memo.get(relPath);
    if (known !== undefined) return known;
    const answer = matcher(relPath, isDir);
    if (memo.size >= MATCH_MEMO_LIMIT) memo.clear();
    memo.set(relPath, answer);
    return answer;
  };
}

/** Compiled matcher per project root, reused while `.gitignore` is unchanged. */
const matcherCache = new Map<string, { raw: string; matcher: IgnoreMatcher }>();

/** Read `<projectRoot>/.gitignore` and compile it. Missing file → matches nothing. */
export async function loadGitignoreMatcher(projectRoot: string): Promise<IgnoreMatcher> {
  let raw = '';
  try {
    raw = await fs.readFile(path.join(projectRoot, '.gitignore'), 'utf8');
  } catch {
    // No .gitignore — nothing extra to ignore beyond the indexer defaults.
  }
  const cached = matcherCache.get(projectRoot);
  if (cached?.raw === raw) return cached.matcher;
  const matcher = memoizeMatcher(compileGitignore(raw ? raw.split('\n') : []));
  matcherCache.set(projectRoot, { raw, matcher });
  return matcher;
}
