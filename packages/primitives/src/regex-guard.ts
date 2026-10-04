import type { CharSet } from './regex-character-sets.js';
import {
  charSetsIntersect,
  directChildGroupContents,
  fixedTokenSets,
  foldForCompare,
  GROUP_PREFIX_RE,
  matchesEmptyToken,
  singleTokenCharSet,
  unwrapGroupBranch,
} from './regex-character-sets.js';
/**
 * Compile a user-supplied regex with conservative bounds against ReDoS.
 *
 * Canonical home (card #5 first slice): previously three drifted copies —
 * `core/src/utils/regex-guard.ts`, `tools/src/_regex.ts`, and
 * `kanban/src/verification/safe-regex.ts` — held in sync only by
 * `tools/tests/regex-guard-parity.test.ts` because kanban sits below both
 * packages in the workspace DAG. This package is a dependency leaf (no
 * workspace deps), so all three import tiers can share one implementation
 * without inverting the layer graph.
 *
 * V8's regex engine is backtracking-based and cannot interrupt a
 * synchronous match — a pattern like `(a+)+$` against a sufficiently
 * long line will pin a worker for seconds. Two coarse bounds:
 *
 *  1. Cap pattern length — practically all legitimate user patterns are
 *     under 256 characters.
 *  2. Reject patterns containing the most obvious super-linear structures.
 *     This is a coarse filter (false-positives are likely; we accept that
 *     for hostile-input contexts).
 *
 * Callers should additionally bound the *subject* length via `capSubject`.
 */

import { detectQuantifiedAmbiguity } from './regex-ambiguity.js';

const MAX_PATTERN_LEN = 256;

// Heuristics for catastrophic-backtracking constructs. Not exhaustive; bias
// toward false-positives in tools that accept LLM-generated input.
const DANGEROUS_PATTERNS: ReadonlyArray<RegExp> = [
  // (a+)+, (.*)+, etc — nested quantifier on a group with internal quantifier
  /(\([^)]*[+*][^)]*\))[+*]/,
  /(\(\?:[^)]*[+*][^)]*\))[+*]/,
  // Adjacent quantifiers: a++ a*+
  /[+*]{2,}/,
  // Quantifier on alternation with length 2+
  /\([^|)]+\|[^)]+\)[+*][+*]/,
  // Greedy quantifier inside lookahead/lookbehind — (?!.*a+)
  /\(\?<?[!=][^)]*[+*][^)]*\)/,
];

function stripGroupPrefix(inner: string): string {
  return inner.replace(GROUP_PREFIX_RE, '');
}

/** Split group content on top-level `|` — nested groups, character classes,
 * and escape pairs stay intact inside their branch. */
function splitTopLevelBranches(inner: string): string[] {
  const branches: string[] = [];
  let current = '';
  let d = 0;
  let cls = false;
  for (let k = 0; k < inner.length; k++) {
    const ch = inner[k];
    if (ch === '\\') {
      current += ch + (inner[k + 1] ?? '');
      k++;
      continue;
    }
    if (cls) {
      if (ch === ']') cls = false;
      current += ch;
      continue;
    }
    if (ch === '[') {
      cls = true;
      current += ch;
      continue;
    }
    if (ch === '(') d++;
    if (ch === ')') d--;
    if (ch === '|' && d === 0) {
      branches.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  branches.push(current);
  return branches;
}

/** Original pairwise overlap test extended in round 13: two branches that
 * are equal, prefix-related, empty, zero-width-only, or whose single-char
 * token sets intersect can consume the same text. */
function branchesOverlap(branches: string[], foldCase: boolean, dotAll: boolean): boolean {
  // Round 13 compared ONLY the unwrap-normalized branches, which replaced
  // the raw textual comparisons instead of extending them: `((\w)x|(\w))+`
  // has raw branches where one is a strict prefix of the other (clear
  // overlap), but after unwrapping the wrapper group they are `(\w)x` vs
  // `\w` — neither a prefix of the other, and neither the char-set rules
  // nor the fixed-token rules can see it (unequal token counts). Run the
  // pairwise suite on BOTH forms: normalization catches redundant wrappers,
  // the raw strings keep the original textual-prefix signal
  // (security-review handoff 2026-09-01).
  const norm = branches.map(unwrapGroupBranch);
  for (const list of [branches, norm]) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const x = list[a] as string;
        const y = list[b] as string;
        if (x === '' || y === '') return true;
        // A lone zero-width token (anchor, word boundary, lookaround) matches
        // the empty string — under a quantifier that is the empty-branch case.
        if (matchesEmptyToken(x) || matchesEmptyToken(y)) return true;
        if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
        // Round 13: a literal inside a character class (`(\w|a)+`) is overlap
        // the string rules cannot see. Only single-character tokens are set-
        // compared: a 1-char branch can never equal a 2+-char branch, so
        // multi-token branches correctly stay out of this check.
        const sx0 = singleTokenCharSet(x, dotAll);
        const sy0 = singleTokenCharSet(y, dotAll);
        // `i`: fold BEFORE intersecting — the modeled sets stay ⊆ the real
        // flagged languages, so an intersection proves a real overlap.
        const sx = sx0 && foldCase ? foldForCompare(sx0) : sx0;
        const sy = sy0 && foldCase ? foldForCompare(sy0) : sy0;
        if (sx && sy && charSetsIntersect(sx, sy)) return true;
        // Round 14: fixed-length multi-token sequences — exact per-position
        // language intersection. `(\w\w|ab)+`: \w∩{a} and \w∩{b} both
        // intersect, so 'ab' is matchable by both branches; a length mismatch
        // or any single disjoint position (`(\w\d|ab)+`: \d∩{b}=∅) means no
        // common string exists and the pair stays allowed.
        const fx0 = fixedTokenSets(x, dotAll);
        const fy0 = fixedTokenSets(y, dotAll);
        const fx = fx0 && foldCase ? fx0.map(foldForCompare) : fx0;
        const fy = fy0 && foldCase ? fy0.map(foldForCompare) : fy0;
        if (
          fx &&
          fy &&
          fx.length === fy.length &&
          fx.every((s, idx) => charSetsIntersect(s, fy[idx] as CharSet))
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Ambiguity check for the content of a QUANTIFIED group (prefix stripped):
 * overlapping top-level branches, or — the round-12 fix — an ambiguous
 * alternation nested one or more groups down inside any branch.
 *
 * `((a|a))+` used to pass because its quantified group has a SINGLE branch
 * (the nested group) while the nested group itself carries no quantifier, so
 * nothing ever compared `a` with `a`. The outer quantifier amplifies a nested
 * choice exactly like a direct one (same ~2^n choice tree), so the check
 * recurses into nested groups. Disjoint nested alternations (`(x(y|z))+`)
 * stay allowed, and unquantified wrappers (`((a|a))`) are never analysed —
 * only groups reached from a quantifier are.
 */
function hasAmbiguousBranches(content: string, foldCase: boolean, dotAll: boolean): boolean {
  const branches = splitTopLevelBranches(content);
  if (branches.length >= 2 && branchesOverlap(branches, foldCase, dotAll)) return true;
  for (const branch of branches) {
    for (const child of directChildGroupContents(branch)) {
      if (hasAmbiguousBranches(stripGroupPrefix(child), foldCase, dotAll)) return true;
    }
  }
  return false;
}

function hasAmbiguousQuantifiedAlternation(pattern: string, flags: string): boolean {
  // Flags participate in the analysis: `i` folds ASCII case into every char
  // set (`(ab|aB)+` is identical branches under i), `s` widens dot to every
  // code point (`(.a|\na)+` overlaps under s). Other flags (g, m, y) do not
  // change branch languages; `u` only changes pattern VALIDITY, which the
  // engine check below already handles.
  const foldCase = /i/.test(flags);
  const dotAll = /s/.test(flags);
  // Character-class and escape state tracked across the WHOLE scan, not just
  // per group probe. A `(` inside `[...]` is literal — a probe started there
  // runs off the end of the pattern and aborts the scan with `false` before
  // a real `(a|a)+` later in the string is ever examined. And `(` after an ODD
  // escape run is a literal `\(`, while `\\(` (escaped backslash) still opens
  // a real group — the old one-character lookbehind misclassified the latter.
  let outerInClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      i++; // escape pair — the following character belongs to it
      continue;
    }
    if (outerInClass) {
      if (ch === ']') outerInClass = false;
      continue;
    }
    if (ch === '[') {
      outerInClass = true;
      continue;
    }
    if (ch !== '(') continue;
    let depth = 0;
    let inClass = false;
    let j = i;
    for (; j < pattern.length; j++) {
      const ch = pattern[j];
      if (ch === '\\') {
        j++;
        continue;
      }
      if (inClass) {
        if (ch === ']') inClass = false;
        continue;
      }
      if (ch === '[') {
        inClass = true;
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (j >= pattern.length) return false; // unbalanced — RegExp() will reject
    const next = pattern[j + 1];
    if (next !== '+' && next !== '*' && next !== '{') continue;
    if (next === '{') {
      const m = /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(j + 1));
      if (!m) continue; // non-quantifier brace literal (e.g. {foo}) — not a repetition
      const min = Number.parseInt(m[1]!, 10);
      const max =
        m[2] === undefined
          ? min
          : m[2] === ''
            ? Number.POSITIVE_INFINITY
            : Number.parseInt(m[2]!, 10);
      if (max < 2) continue; // {0}, {1}, {0,1} cannot cause catastrophic repetition
    }
    const inner = pattern.slice(i + 1, j);
    const stripped = stripGroupPrefix(inner);
    if (hasAmbiguousBranches(stripped, foldCase, dotAll)) {
      return true;
    }
    // ADR-004 semantic layer — additive final check. Answers the ambiguity
    // question exactly for the parseable subset (squared product over
    // char-source pairs + Sardinas–Patterson code check); budget and
    // out-of-subset content both under-reject (allow), so this can only
    // ADD rejections on top of the static layers above.
    if (
      detectQuantifiedAmbiguity(inner, flags).verdict === 'ambiguous' ||
      detectQuantifiedAmbiguity(stripped, flags).verdict === 'ambiguous'
    ) {
      return true;
    }
  }
  return false;
}

export interface CompileResult {
  ok: true;
  regex: RegExp;
}

export interface CompileFail {
  ok: false;
  reason: string;
}

export type CompileUserRegexResult = CompileResult | CompileFail;

const COMPILED_CACHE = new Map<string, CompileUserRegexResult>();
const CACHE_MAX_SIZE = 500;

export function compileUserRegex(pattern: string, flags: string = ''): CompileResult | CompileFail {
  if (typeof pattern !== 'string') {
    return { ok: false, reason: 'pattern must be a string' };
  }
  if (typeof flags !== 'string') {
    return { ok: false, reason: 'flags must be a string' };
  }
  const cacheKey = JSON.stringify([flags, pattern]);
  const cached = COMPILED_CACHE.get(cacheKey);
  if (cached !== undefined) {
    // The cache stores the VERDICT only — never the instance that is handed
    // out. RegExp is mutable (`lastIndex`), and this cache is process-global:
    // returning the same object to every consumer of a pattern would let one
    // caller's match state (a `g`/`y` flag, an exec loop) silently leak into
    // another caller's results. Reconstruct a fresh instance from the
    // validated source on every call; the expensive ReDoS heuristics are
    // already skipped by the cache hit.
    return cached.ok ? { ok: true, regex: new RegExp(pattern, flags) } : { ...cached };
  }

  if (COMPILED_CACHE.size >= CACHE_MAX_SIZE) {
    let evicted = 0;
    const target = Math.floor(CACHE_MAX_SIZE / 4);
    for (const key of COMPILED_CACHE.keys()) {
      COMPILED_CACHE.delete(key);
      if (++evicted >= target) break;
    }
  }

  const result = compileUncached(pattern, flags);
  COMPILED_CACHE.set(cacheKey, result);
  // Same instance-isolation as the cache-hit path above: callers get a fresh
  // RegExp, so mutating `lastIndex` on one result cannot corrupt another.
  return result.ok ? { ok: true, regex: new RegExp(pattern, flags) } : { ...result };
}

function compileUncached(pattern: string, flags: string): CompileUserRegexResult {
  if (pattern.length === 0) {
    return { ok: false, reason: 'pattern is empty' };
  }
  if (pattern.length > MAX_PATTERN_LEN) {
    return { ok: false, reason: `pattern exceeds ${MAX_PATTERN_LEN} characters` };
  }
  for (const rx of DANGEROUS_PATTERNS) {
    if (rx.test(pattern)) {
      return {
        ok: false,
        reason:
          'pattern looks vulnerable to catastrophic backtracking — rewrite without nested quantifiers',
      };
    }
  }
  if (hasAmbiguousQuantifiedAlternation(pattern, flags)) {
    return {
      ok: false,
      reason:
        'pattern quantifies an alternation with overlapping branches — rewrite so no two branches can match the same text',
    };
  }
  try {
    return { ok: true, regex: new RegExp(pattern, flags) };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'invalid regex',
    };
  }
}

/**
 * Maximum subject length handed to a user-supplied regex before matching.
 * A linear-time pattern over a multi-megabyte line is still a stall; tools
 * that need exact-line matching against very long lines should use ripgrep
 * externally rather than the native walker.
 */
export const MAX_SUBJECT_LEN = 64 * 1024;

/** Truncate a subject line to {@link MAX_SUBJECT_LEN} for synchronous regex eval. */
export function capSubject(line: string): string {
  if (typeof line !== 'string') return '';
  return line.length > MAX_SUBJECT_LEN ? line.slice(0, MAX_SUBJECT_LEN) : line;
}
