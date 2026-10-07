import { buildCombinedRegex, patternTypeForGroups, scannerPatterns } from './scanner-patterns.js';

/**
 * Combined single-pass regex. Each alternative is a capturing group so
 * the matcher callback can identify which pattern fired (only one group
 * is non-undefined at match time). Rebuilt whenever scannerPatterns.patterns changes.
 *
 * @internal
 */
export let COMBINED_REGEX = buildCombinedRegex(scannerPatterns.patterns);

export function setCombinedRegex(regex: RegExp): void {
  COMBINED_REGEX = regex;
}

// ---------------------------------------------------------------------------
// ReDoS protection
// ---------------------------------------------------------------------------

/**
 * Size of one scan window.
 *
 * Long inputs are scanned in windows of this size rather than handed to
 * the regex engine whole — a single `exec()` over a multi-megabyte string
 * is where catastrophic backtracking would actually hurt.
 *
 * This used to be a hard skip: any input longer than 100 KB was not
 * scanned at all. That turned the size of a write into a bypass — paste a
 * credential into a large file and the gate waved it through, which is
 * precisely the case a pre-tool secret gate exists to catch. Windowing
 * keeps the ReDoS ceiling (no single huge `exec`) without the bypass.
 */
export const SCAN_WINDOW_LENGTH = 100_000;

/**
 * Overlap between consecutive windows. A credential straddling a window
 * boundary would otherwise be split in half and matched by neither side.
 * This covers bounded token formats; unusually long multi-line credentials
 * that exceed the overlap remain subject to the documented windowing limit.
 */
export const SCAN_WINDOW_OVERLAP = 4_096;

/**
 * Hard ceiling on total characters scanned per string leaf. Beyond this the input is
 * reported as unscannable by the caller rather than silently passed —
 * see `TOO_LARGE_MARKER`.
 */
export const MAX_TOTAL_SCAN_LENGTH = 8 * 1024 * 1024;

/**
 * Pseudo-match type reported when an input exceeds `MAX_TOTAL_SCAN_LENGTH`.
 * Callers surface it instead of treating the input as clean: "we could not
 * check this" must never render as "this is fine".
 */
export const TOO_LARGE_MARKER = 'unscannable_oversized_input';

/**
 * Pseudo-match type reported when an input nests deeper than the scan's
 * recursion guard. Same rule as {@link TOO_LARGE_MARKER}: a subtree the scan
 * declined to read is reported, never passed as clean.
 */
export const TOO_DEEP_MARKER = 'unscannable_nested_input';

/**
 * Cumulative regex execution timeout in ms. If the combined regex's
 * `while (exec(...))` loop runs longer than this, the scan throws a
 * ReDoS error. Because the hook's policy is `failurePolicy: 'closed'`,
 * the throw is caught by the hook runner and treated as a block.
 *
 * This guard catches the case where a moderate-length input triggers
 * many pattern matches (e.g. a concatenated list of tokens), causing
 * cumulative time to grow. A single long-running exec() call is
 * protected by the length guard above.
 */
export const RE_DOS_TIMEOUT_MS = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find every pattern that fires on `text`. Returns the list of matched
 * `type` ids (deduped). The combined regex is one pass; the capture
 * group index maps back to the pattern via the parallel scannerPatterns.patterns array.
 *
 * Determinism: returns matched types in sorted order so scan results
 * are reproducible across runs.
 */
/** Scan one window with the combined regex, accumulating matched types. */
export function scanWindow(window: string, found: Set<string>, startTime: number): void {
  COMBINED_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec loop
  while ((m = COMBINED_REGEX.exec(window)) !== null) {
    // ReDoS guard: abort if cumulative regex time exceeds the threshold.
    // The throw propagates through buildHook synchronously; with
    // failurePolicy: 'closed' it is caught and treated as a block.
    if (performance.now() - startTime > RE_DOS_TIMEOUT_MS) {
      throw new Error(
        `secret-scanner: ReDoS timeout — regex scan exceeded ${RE_DOS_TIMEOUT_MS}ms on ${window.length}-char window`,
      );
    }
    // Determine which pattern fired. Group offsets come from the table
    // built with the regex — a pattern containing its own capture groups
    // shifts every later pattern, so `m[i + 1]` is not reliable.
    const type = patternTypeForGroups(m.slice(1));
    if (type !== undefined) found.add(type);
    // Defensive: avoid infinite loop on zero-width matches (none of the
    // current patterns are zero-width, but future additions might be).
    if (m.index === COMBINED_REGEX.lastIndex) {
      COMBINED_REGEX.lastIndex += 1;
    }
  }
}

export function findMatches(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const startTime = performance.now();

  if (text.length <= SCAN_WINDOW_LENGTH) {
    scanWindow(text, found, startTime);
    return Array.from(found).sort();
  }

  // Oversized input: report it rather than pass it. Silently returning "no
  // matches" for something we declined to read is indistinguishable from
  // "clean", and that is the wrong default for a security gate.
  if (text.length > MAX_TOTAL_SCAN_LENGTH) {
    return [TOO_LARGE_MARKER];
  }

  // Long input: scan in overlapping windows. Keeps every individual
  // `exec()` bounded (the actual ReDoS risk) while still inspecting the
  // whole input — previously anything past 100 KB was skipped outright,
  // so file size alone was enough to walk a credential past the gate.
  const stride = SCAN_WINDOW_LENGTH - SCAN_WINDOW_OVERLAP;
  for (let offset = 0; offset < text.length; offset += stride) {
    scanWindow(text.slice(offset, offset + SCAN_WINDOW_LENGTH), found, startTime);
  }
  return Array.from(found).sort();
}

/**
 * Walk an arbitrary input value, return the first set of matched types
 * found in any string-typed leaf. Returns `null` if nothing matched
 * anywhere — saves the caller from scanning more fields once a hit is
 * confirmed.
 */
export function scanInput(input: unknown, depth = 0): string[] | null {
  if (input === null || input === undefined) return null;
  // ReDoS guard: limit recursion depth to prevent stack overflow on
  // deeply nested objects crafted to bypass the string-length check. The
  // unread subtree is reported: returning null here let a credential nested
  // past the guard through the block and redact gates as "no match".
  if (depth > 50) return [TOO_DEEP_MARKER];
  if (typeof input === 'string') {
    const found = findMatches(input);
    return found.length > 0 ? found : null;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = scanInput(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof input === 'object') {
    for (const value of Object.values(input as Record<string, unknown>)) {
      const found = scanInput(value, depth + 1);
      if (found) return found;
    }
    return null;
  }
  // Numbers, booleans, bigints — credentials are strings, no point scanning.
  return null;
}

/** A redaction either produces a complete safe clone or fails closed. */
export type RedactionResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'oversized_input' | 'maximum_depth_exceeded' };

/** Redact one bounded string without using an unguarded global replace. */
export function redactString(text: string): RedactionResult {
  // Windowed scanning can safely detect a match across large input, but
  // reconstructing overlapping redaction windows without duplicate or partial
  // replacements is a different operation. Fail closed instead of running the
  // combined regex over a multi-window string in one unbounded replace pass.
  if (text.length > SCAN_WINDOW_LENGTH) {
    return { ok: false, reason: 'oversized_input' };
  }

  const startTime = performance.now();
  let cursor = 0;
  let output = '';
  COMBINED_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec loop
  while ((match = COMBINED_REGEX.exec(text)) !== null) {
    if (performance.now() - startTime > RE_DOS_TIMEOUT_MS) {
      return { ok: false, reason: 'oversized_input' };
    }
    const type = patternTypeForGroups(match.slice(1));
    output += text.slice(cursor, match.index);
    output += `[REDACTED:${type ?? 'unknown'}]`;
    cursor = COMBINED_REGEX.lastIndex;
    if (match.index === COMBINED_REGEX.lastIndex) {
      COMBINED_REGEX.lastIndex += 1;
    }
  }
  if (cursor === 0) return { ok: true, value: text };
  return { ok: true, value: output + text.slice(cursor) };
}

/**
 * Walk an arbitrary input value, returning a deep clone with every
 * string-typed leaf redacted. Only used in `mode: 'redact'`.
 *
 * Every string leaf is independently redacted through the bounded exec loop.
 * This is intentional even though buildHook already found one match:
 * scanInput stops at the first match, while redaction must prove that every
 * sibling is within the redactor's size/time bounds. If any leaf cannot be
 * processed, no partially-redacted input is returned.
 */
export function redactInput(input: unknown, depth = 0): RedactionResult {
  if (input === null || input === undefined) return { ok: true, value: input };
  // Unlike scan-only mode, returning the original subtree here would allow
  // uninspected content through a hook that claims to have redacted it.
  if (depth > 50) return { ok: false, reason: 'maximum_depth_exceeded' };
  if (typeof input === 'string') {
    return redactString(input);
  }
  if (Array.isArray(input)) {
    const out: unknown[] = [];
    for (const item of input) {
      const redacted = redactInput(item, depth + 1);
      if (!redacted.ok) return redacted;
      out.push(redacted.value);
    }
    return { ok: true, value: out };
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const redacted = redactInput(v, depth + 1);
      if (!redacted.ok) return redacted;
      Object.defineProperty(out, k, {
        value: redacted.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return { ok: true, value: out };
  }
  return { ok: true, value: input };
}
