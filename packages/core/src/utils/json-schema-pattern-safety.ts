/**
 * Static safety check for author-supplied regex sources: flags the
 * ambiguous-repetition shapes behind catastrophic backtracking — an
 * unboundedly-quantified group whose body contains another quantifier or an
 * alternation (`(x+x+)+`, `(a|aa)+`, `(\d{2,3})+`), unless the body carries a
 * mandatory literal separator that disambiguates the iterations
 * (`^[a-z0-9]+(?:-[a-z0-9]+)*$` is safe: every iteration must start with `-`,
 * which `[a-z0-9]` cannot match, so segmentations are unique).
 *
 * Conservative by design: alternations are always flagged (branch-overlap is
 * not analyzed — `(red|blue)+` fails closed), negated classes and wildcards
 * never prove disjointness, and unknown escapes match anything. The check
 * never executes the regex; the caller reports a distinct error telling the
 * schema author to restructure.
 */
export function patternIsLikelyCatastrophic(source: string): boolean {
  interface Frame {
    hasAlt: boolean;
    hasQuant: boolean;
    literals: string[];
    quantSets: CharSet[];
  }
  const stack: Frame[] = [];
  let pendingLiteral: string | null = null;
  let pendingSet: CharSet | null = null;

  const flushPending = (): void => {
    const frame = stack[stack.length - 1];
    if (frame !== undefined && pendingLiteral !== null) frame.literals.push(pendingLiteral);
    pendingLiteral = null;
    pendingSet = null;
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '[') {
      // Character-class atom: find the closing bracket (escaped `]` stays).
      let j = i + 1;
      if (source[j] === '^') j++;
      const start = j;
      while (j < source.length && (source[j] !== ']' || source[j - 1] === '\\')) j++;
      const inner = source.slice(start, j);
      const negated = source[i + 1] === '^';
      flushPending();
      pendingSet = (c) => !classContains(inner, negated, c);
      i = j;
      continue;
    }
    if (ch === '(') {
      flushPending();
      stack.push({ hasAlt: false, hasQuant: false, literals: [], quantSets: [] });
      // Skip group markers so `?` in `(?:`/`(?=` is not read as a quantifier.
      if (source[i + 1] === '?') {
        if (source[i + 2] === ':' || source[i + 2] === '=' || source[i + 2] === '!') i += 2;
        else if (source[i + 2] === '<') {
          // Lookbehind `(?<=`/`(?<!` or a named group `(?<name>`: skip the whole
          // marker, or the name and `>` would be read as literal separators.
          if (source[i + 3] === '=' || source[i + 3] === '!') i += 3;
          else {
            const close = source.indexOf('>', i + 3);
            i = close === -1 ? i + 2 : close;
          }
        }
      }
      continue;
    }
    if (ch === ')') {
      flushPending();
      const frame = stack.pop();
      // A nested group's quantified atoms and alternation also repeat under the
      // enclosing group's quantifier; without this, `((a+)a)+` looked like a
      // body with no quantifier and its trailing `a` "disambiguated" it.
      const parent = stack[stack.length - 1];
      if (frame !== undefined && parent !== undefined) {
        if (frame.hasAlt) parent.hasAlt = true;
        if (frame.hasQuant) parent.hasQuant = true;
        parent.quantSets.push(...frame.quantSets);
        // Its literals stay mandatory unless the group itself is optional.
        const next = source[i + 1];
        if (!frame.hasAlt && next !== '?' && next !== '*' && next !== '{') {
          parent.literals.push(...frame.literals);
        }
      }
      if (frame !== undefined && isUnboundedQuantifier(source, i + 1)) {
        // Disambiguated iterations: the body carries a mandatory literal that
        // every quantified atom provably cannot match, so each repetition is
        // pinned and no re-segmentation is possible.
        const disambiguated =
          !frame.hasAlt && frame.literals.some((sep) => frame.quantSets.every((S) => S(sep)));
        if (!disambiguated) return true;
      }
      continue;
    }
    if (ch === '|') {
      const frame = stack[stack.length - 1];
      if (frame !== undefined) frame.hasAlt = true;
      flushPending();
      continue;
    }
    if (ch === '+' || ch === '*') {
      const frame = stack[stack.length - 1];
      if (frame !== undefined) {
        if (pendingSet !== null) frame.quantSets.push(pendingSet);
        frame.hasQuant = true;
      }
      pendingLiteral = null;
      pendingSet = null;
      continue;
    }
    if (ch === '?') {
      // Optional/lazy marker, not an atom: the preceding atom is no longer a
      // mandatory literal, and `?` itself must never become a "separator".
      pendingLiteral = null;
      pendingSet = null;
      continue;
    }
    if (ch === '{') {
      const close = source.indexOf('}', i + 1);
      if (close !== -1 && /^\{\d+(,\d*)?\}$/.test(source.slice(i, close + 1))) {
        const frame = stack[stack.length - 1];
        if (frame !== undefined) {
          if (pendingSet !== null) frame.quantSets.push(pendingSet);
          frame.hasQuant = true;
        }
        pendingLiteral = null;
        pendingSet = null;
        i = close;
      }
      continue;
    }
    if (ch === '^' || ch === '$') {
      // Zero-width anchors are not atoms; they only end atom adjacency.
      flushPending();
      continue;
    }
    const atom = charSetAtom(source, i);
    if (atom.literal !== null) pendingLiteral = atom.literal;
    pendingSet = atom.set;
    i += atom.consumed - 1;
  }
  return false;
}

/** True when the atom's set provably does not match `ch` (conservative: false). */
type CharSet = (ch: string) => boolean;

/** Parse the regex atom at `i` into a char-set predicate, a literal (when it
 *  matches exactly one character), and its source width. */
function charSetAtom(
  source: string,
  i: number,
): { set: CharSet; literal: string | null; consumed: number } {
  const c = source[i];
  if (c === undefined) return { set: () => false, literal: null, consumed: 1 };
  if (c === '.') return { set: () => false, literal: null, consumed: 1 };
  if (c === '\\') {
    const e = source[i + 1] ?? '';
    if (e === 'd') return { set: (ch) => !/\d/.test(ch), literal: null, consumed: 2 };
    if (e === 'w') return { set: (ch) => !/\w/.test(ch), literal: null, consumed: 2 };
    if (e === 's') return { set: (ch) => !/\s/.test(ch), literal: null, consumed: 2 };
    if (e === 'D') return { set: (ch) => /\d/.test(ch), literal: null, consumed: 2 };
    if (e === 'W') return { set: (ch) => /\w/.test(ch), literal: null, consumed: 2 };
    if (e === 'S') return { set: (ch) => /\s/.test(ch), literal: null, consumed: 2 };
    return { set: (ch) => ch !== e, literal: e, consumed: 2 };
  }
  return { set: (ch) => ch !== c, literal: c, consumed: 1 };
}

/** Whether the character class with raw `inner` content (negation flagged)
 *  matches `ch`. Unknown escapes match anything (conservative). */
function classContains(inner: string, negated: boolean, ch: string): boolean {
  const found = classWalk(inner, ch);
  return negated ? !found : found;
}

function classWalk(inner: string, ch: string): boolean {
  let i = 0;
  while (i < inner.length) {
    const c = inner[i];
    if (c === undefined) return false;
    if (c === '\\') {
      const e = inner[i + 1] ?? '';
      if (e === 'd' && /\d/.test(ch)) return true;
      if (e === 'w' && /\w/.test(ch)) return true;
      if (e === 's' && /\s/.test(ch)) return true;
      if (e === 'D' && !/\d/.test(ch)) return true;
      if (e === 'W' && !/\w/.test(ch)) return true;
      if (e === 'S' && !/\s/.test(ch)) return true;
      if (e === ch) return true;
      i += 2;
      continue;
    }
    const hi = inner[i + 2];
    if (inner[i + 1] === '-' && hi !== undefined && hi !== ']') {
      if (c <= ch && ch <= hi) return true;
      i += 3;
      continue;
    }
    if (c === ch) return true;
    i++;
  }
  return false;
}

/** True for `+`, `*`, and open-ended `{n,}` — quantifiers with no upper bound. */
function isUnboundedQuantifier(source: string, i: number): boolean {
  if (source[i] === '+' || source[i] === '*') return true;
  if (source[i] === '{') {
    const close = source.indexOf('}', i + 1);
    if (close !== -1) {
      const m = /^\{(\d+)(,(\d+)?)?\}$/.exec(source.slice(i, close + 1));
      // {n} and {n,m} are bounded; {n,} is not.
      return m !== null && m[2] !== undefined && m[3] === undefined;
    }
  }
  return false;
}
