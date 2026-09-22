import { performance } from 'node:perf_hooks';

import { cloneCredentialPatterns } from '../runtime/credential-patterns.js';

import { withReDoSGuard } from '../runtime/redos-guard.js';

// ---------------------------------------------------------------------------
// Secret patterns — high-confidence only, to keep false positives low.
// ---------------------------------------------------------------------------

export interface SecretPattern {
  kind: string;
  re: RegExp;
}

/**
 * Legacy `kind` names for the shapes this plugin already reported, so the
 * canonical `type` ids from the shared table keep their existing spelling
 * in logs, metrics and the status tool. Anything not listed here is
 * reported under its canonical id.
 */
export const KIND_ALIASES: Readonly<Record<string, string>> = {
  aws_access_key: 'aws-access-key',
  private_key: 'private-key-block',
  github_pat: 'github-token',
  github_oauth_token: 'github-token',
  openai_key: 'openai-key',
  anthropic_key: 'anthropic-key',
  slack_token: 'slack-token',
  gcp_key: 'google-api-key',
  bearer_token: 'bearer-token',
};

/**
 * Patterns unique to this surface.
 *
 * The shared table covers credentials with a distinctive prefix. These
 * two are shape-and-context heuristics that only make sense for an
 * outgoing request (where a false positive costs a redaction, not a
 * blocked write), so they stay local.
 */
export const EXTRA_PATTERNS: SecretPattern[] = [
  {
    // AWS secret access keys have no prefix — only a 40-char base64-ish
    // shape — so they need a nearby `aws`/`secret` mention to be worth
    // acting on.
    //
    // The previous spelling required the word "aws" to appear AFTER the
    // key and wrapped the run in `\b`. Both are wrong: the real layout is
    // `AWS_SECRET_ACCESS_KEY=<key>` (context first), and a `\b` cannot
    // hold next to the `+` or `/` that base64 keys routinely end with. The
    // pattern therefore never fired on a real key. Anchor on the context
    // token instead and let the key follow it.
    kind: 'aws-secret-key',
    re: /(?:aws|amazon)[A-Za-z0-9_-]*(?:secret|key)[A-Za-z0-9_-]*\s*[:=]\s*['"]?([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+])/gi,
  },
  {
    kind: 'generic-secret-assignment',
    re: /\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*['"]?[A-Za-z0-9._/+-]{12,}['"]?/gi,
  },
];

/**
 * Effective pattern set: every shape the canonical table knows about,
 * plus this plugin's own heuristics.
 *
 * Sharing the table with `secret-scanner` is the point — the two lists
 * had drifted, so whether a credential was caught depended on which side
 * of the pipeline it crossed.
 */
export const PATTERNS: SecretPattern[] = [
  ...cloneCredentialPatterns().map((p) => ({
    kind: KIND_ALIASES[p.type] ?? p.type,
    re: p.regex,
  })),
  ...EXTRA_PATTERNS,
];

export interface Detection {
  kind: string;
  count: number;
}

/**
 * A pattern excluded from a scan pass. `redos-timeout` = the pattern blew
 * its wall-clock budget on the guarded probe and was skipped (fail-open
 * with a visible counter — this surface trades blocking for availability;
 * `secret-scanner` is the fail-closed tool-side gate).
 */
export interface ScanSkip {
  kind: string;
  reason: 'redos-timeout';
}

/**
 * Per-pattern wall-clock budget for the guarded probe pass (issue #362
 * residual). Matches secret-scanner's per-exec scale; a clean pattern
 * finishes in well under a millisecond on typical request text.
 */
export const PATTERN_BUDGET_MS = 250;

/**
 * Probe window size. The probe decides "can this regex run without
 * exploding" per window; 100 KB keeps each worker round-trip bounded
 * while the windowed walk (with overlap) still covers the entire input.
 */
export const GUARD_PROBE_LENGTH = 100_000;

/**
 * Overlap between probe windows so a credential-shaped (or pathological)
 * run straddling a boundary is still exercised. Matches secret-scanner's
 * window overlap.
 */
export const GUARD_PROBE_OVERLAP = 4_096;

/**
 * Cumulative wall-clock budget for one full scan pass (issue #370).
 * Mirrors secret-scanner's RE_DOS_TIMEOUT_MS model: the probe licenses a
 * pattern per window, but the scan itself (exec-to-exhaustion /
 * replace-all across every leaf) also runs under a deadline. Once the
 * deadline passes, further pattern work for that pass is skipped, the
 * tripped kinds join the skip set, and the pass fails open loudly —
 * consistent with the probe-timeout semantics.
 */
export const SCAN_PASS_BUDGET_MS = 250;

/**
 * Mutable deadline shared across one scan pass. `tripped` collects the
 * kinds that blew the budget mid-pass; the caller merges them into the
 * visible skip surface (status + counters + warn log).
 */
export interface ScanDeadline {
  deadline: number;
  tripped: Set<string>;
}

/** Create a fresh deadline for one scan pass (performance.now-based). */
export function createScanDeadline(): ScanDeadline {
  return { deadline: performance.now() + SCAN_PASS_BUDGET_MS, tripped: new Set<string>() };
}

// ---------------------------------------------------------------------------
// Windowed scanning (issue #371): no synchronous regex receives full
// unbounded input.
//
// The scan-pass budget (#370) fires only BETWEEN exec calls, so a single
// catastrophic exec on the full leaf could still block the loop. The scan
// now runs over bounded windows — same stride geometry as the probe — with
// three seam-safety rules:
//
//  1. Accept-region partition. Window i accepts only matches STARTING in
//     [i*stride, i*stride + stride) (final window: to end of text). Fresh
//     regions partition every position, so each match is found exactly
//     once regardless of window overlap — no double counts, no gaps.
//  2. True-context prefix. Each window's slice starts `GUARD_PROBE_OVERLAP`
//     before its accept region, so lookbehinds (`(?<![A-Za-z0-9])`, the
//     json-key `(?<="…")`, telegram's `bot` lookbehind) and the
//     private-key `(?:^|\n)` anchor are evaluated against the REAL
//     preceding characters, not against a synthetic string start.
//  3. Guaranteed containment + bounded growth. The slice extends
//     SCAN_WINDOW_TAIL beyond the accept region, so every bounded pattern
//     (max match ~11 KB: postgres URIs, PEM blocks) is fully contained in
//     its accepting window. A match that still touches its slice end while
//     text continues is re-measured by `growMatch` on a dedicated slice
//     that doubles up to SCAN_MAX_GROWTH windows — every exec input stays
//     ≤ SCAN_WINDOW_LIMIT * growth, never the full text.
// ---------------------------------------------------------------------------

/** Accept-region stride: window i accepts matches starting here. */
export const SCAN_WINDOW_STRIDE = GUARD_PROBE_LENGTH - GUARD_PROBE_OVERLAP;

/**
 * Extra slice headroom past the accept region so bounded-shape patterns
 * (PEM blocks ~3 KB, postgres URIs ~11 KB) are fully contained in their
 * accepting window instead of truncated at its seam.
 */
export const SCAN_WINDOW_TAIL = 65_536;

/**
 * Hard bound on any single synchronous regex input in a scan pass. The
 * structural guarantee of #371: even a growth-loop re-measure never hands
 * a regex the full unbounded leaf.
 */
export const SCAN_WINDOW_LIMIT = GUARD_PROBE_LENGTH + SCAN_WINDOW_TAIL;

/** Growth-loop cap (in probe windows) for monster matches. */
export const SCAN_MAX_GROWTH = 16;

/** One regex match with absolute offsets into the scanned text. */
export interface WindowedMatch {
  start: number;
  end: number;
  matched: string;
}

/**
 * Re-measure a match that touched its window's slice end while text
 * continued: it may be truncated. Runs the pattern on a dedicated slice
 * starting at the match's own start (bounded, doubling), and returns the
 * full match once it ends strictly inside a slice or reaches end of text.
 * Returns null when the growth cap is hit or the pattern cannot match
 * from that start — the caller keeps the windowed (possibly truncated)
 * match, consistent with fail-open.
 */
export function growMatch(
  re: RegExp,
  p: SecretPattern,
  text: string,
  absStart: number,
  deadline: ScanDeadline | undefined,
): WindowedMatch | null {
  let size = GUARD_PROBE_LENGTH;
  for (let grown = 0; grown < SCAN_MAX_GROWTH; grown++) {
    if (deadline && performance.now() > deadline.deadline) {
      deadline.tripped.add(p.kind);
      return null;
    }
    const extEnd = Math.min(text.length, absStart + size);
    const ext = text.slice(absStart, extEnd);
    re.lastIndex = 0;
    const em = re.exec(ext);
    if (em?.index !== 0 || em[0].length === 0) return null;
    const end = absStart + em[0].length;
    if (end < extEnd || extEnd === text.length) {
      return { start: absStart, end, matched: em[0] };
    }
    size *= 2; // still touching the slice end with text remaining — grow
  }
  return null; // cap exceeded: keep the truncated windowed match (documented)
}

/**
 * Yield every match of `p` over `text`, one accepting window at a time.
 * Zero-width matches are skipped before yielding (a future pattern without
 * a length floor must not emit spurious markers). A deadline trip ends the
 * walk early and records the kind as tripped — callers keep their
 * fail-open semantics.
 */
export function* execWindowed(
  p: SecretPattern,
  text: string,
  deadline: ScanDeadline | undefined,
): Generator<WindowedMatch, void, undefined> {
  const flags = p.re.flags.includes('g') ? p.re.flags : `${p.re.flags}g`;
  const re = new RegExp(p.re.source, flags);
  let acceptLo = 0;
  // High-water mark (chimera finding): a GROWN match can extend past a
  // later window's accept region, so a match starting inside an
  // already-yielded span is nested — emitting it again would double-mark
  // in redaction and re-emit content in cleartext via the tail slice.
  // Starts are ordered (disjoint accept regions), so start < highWater
  // means fully nested: skip.
  let highWater = 0;
  for (let window = 0; acceptLo < text.length; window++) {
    const sliceStart = window === 0 ? 0 : acceptLo - GUARD_PROBE_OVERLAP;
    const sliceEnd = Math.min(text.length, sliceStart + SCAN_WINDOW_LIMIT);
    const slice = text.slice(sliceStart, sliceEnd);
    // Accept regions are ALWAYS disjoint: [acceptLo, min(acceptLo+stride,
    // text.length)). Deriving acceptHi from sliceEnd (e.g. widening to the
    // text end when this window's slice reaches it) is wrong — with a
    // 165 536-char slice and a 95 904 stride, several trailing windows'
    // slices reach text end simultaneously and their regions would overlap,
    // double-accepting matches caught by the regression suite (#371).
    const acceptHi = Math.min(acceptLo + SCAN_WINDOW_STRIDE, text.length);
    re.lastIndex = 0;
    let m: RegExpExecArray | null = re.exec(slice);
    while (m !== null) {
      if (deadline && performance.now() > deadline.deadline) {
        deadline.tripped.add(p.kind);
        return;
      }
      const matched = m[0];
      if (matched.length === 0) {
        re.lastIndex += 1; // impossible for PATTERNS; keeps the loop safe
        m = re.exec(slice);
        continue;
      }
      const absStart = sliceStart + m.index;
      const absEnd = absStart + matched.length;
      if (absStart >= acceptLo && absStart < acceptHi) {
        let final = { start: absStart, end: absEnd, matched };
        if (absEnd === sliceEnd && sliceEnd < text.length) {
          // Touched the slice end with text remaining — possibly truncated.
          // growMatch runs the SAME regex (shared lastIndex): after it, the
          // generator must resume the slice scan from the match end, not
          // from growMatch's stale extended-slice position.
          final = growMatch(re, p, text, absStart, deadline) ?? final;
          re.lastIndex = m.index + final.matched.length;
        }
        if (final.start >= highWater) {
          highWater = Math.max(highWater, final.end);
          yield final;
        } // else: nested in an already-yielded match — already covered
      }
      m = re.exec(slice);
    }
    acceptLo += SCAN_WINDOW_STRIDE;
  }
}

/** Shared match core: count per-kind hits in `text`. */
export function countMatches(
  p: SecretPattern,
  text: string,
  allow: RegExp[],
  counts: Map<string, number>,
  deadline?: ScanDeadline,
): void {
  // Pre-exec gate (#370): an expired pass pays no regex work at all.
  if (deadline && performance.now() > deadline.deadline) {
    deadline.tripped.add(p.kind);
    return;
  }
  for (const m of execWindowed(p, text, deadline)) {
    if (!allow.some((a) => a.test(m.matched))) {
      counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
    }
  }
}

/**
 * Shared redaction core: replace hits of one pattern with `[REDACTED:<kind>]`.
 *
 * Windowed since #371 — no synchronous regex sees the full leaf. On a
 * deadline trip mid-walk the unprocessed tail is returned as-is
 * (fail-open, surfaced by the caller).
 */
export function replacePattern(
  p: SecretPattern,
  text: string,
  allow: RegExp[],
  redactions: { n: number },
  deadline?: ScanDeadline,
): string {
  if (deadline && performance.now() > deadline.deadline) {
    deadline.tripped.add(p.kind);
    return text;
  }
  let out = '';
  let copied = 0;
  for (const m of execWindowed(p, text, deadline)) {
    out += text.slice(copied, m.start);
    if (allow.some((a) => a.test(m.matched))) {
      out += m.matched;
    } else {
      redactions.n += 1;
      out += `[REDACTED:${p.kind}]`;
    }
    copied = m.end;
  }
  return out + text.slice(copied); // natural end or deadline trip — same tail
}

/** Redact secret matches in text, replacing each with `[REDACTED:<kind>]`. */
export function redactSecrets(
  text: string,
  allow: RegExp[],
  deadline?: ScanDeadline,
): { text: string; redactions: number } {
  const redactions = { n: 0 };
  let out = text;
  for (const p of PATTERNS) out = replacePattern(p, out, allow, redactions, deadline);
  return { text: out, redactions: redactions.n };
}

// Distinct kinds — several patterns can share a kind via KIND_ALIASES, so
// the probe's early-exit must compare against unique kinds, not pattern
// count (a shared kind means the skip set can never reach PATTERNS.length).
export const DISTINCT_PATTERN_KINDS = new Set(PATTERNS.map((p) => p.kind)).size;

/**
 * Guarded probe: which patterns cannot complete within `PATTERN_BUDGET_MS`.
 * The ENTIRE input is probed in overlapping windows (issue #362: probing
 * only a prefix would let late-input pathology through) — one
 * combined-alternation worker per window in the common clean case; the
 * per-pattern fallback runs only for windows where the combined regex
 * trips, to identify the offender(s) for the skip set.
 */
export async function probeTimedOutPatterns(text: string): Promise<Set<string>> {
  const timedOut = new Set<string>();
  if (text.length === 0) return timedOut;

  const probeWindow = (offset: number): Promise<void> => {
    const window = text.slice(offset, offset + GUARD_PROBE_LENGTH);
    const combined = new RegExp(PATTERNS.map((p) => `(${p.re.source})`).join('|'), 'gi');
    return withReDoSGuard(combined, window, PATTERN_BUDGET_MS).then(async (combinedResult) => {
      if (!combinedResult.timedOut) return;
      for (const p of PATTERNS) {
        if (timedOut.has(p.kind)) continue;
        const result = await withReDoSGuard(p.re, window, PATTERN_BUDGET_MS);
        if (result.timedOut) timedOut.add(p.kind);
      }
    });
  };

  const stride = GUARD_PROBE_LENGTH - GUARD_PROBE_OVERLAP;
  for (let offset = 0; offset < text.length; offset += stride) {
    // Early exit: once every distinct kind has blown its budget somewhere,
    // later windows cannot add anything — the skip set is already complete.
    if (timedOut.size >= DISTINCT_PATTERN_KINDS) break;
    await probeWindow(offset);
  }
  return timedOut;
}

/**
 * Detect secret matches, skipping patterns that blow the ReDoS budget on
 * the guarded probe. The skip set is returned so callers can surface it
 * (status counters / logs) instead of silently trusting the result.
 */
export async function detectSecretsGuarded(
  text: string,
  allow: RegExp[],
): Promise<{ detections: Detection[]; skipped: ScanSkip[] }> {
  const timedOut = await probeTimedOutPatterns(text);
  // Cumulative scan-pass budget (issue #370): the count loop itself runs
  // under a deadline, not just the probe's single exec. Tripped kinds join
  // the probe's skip set — same fail-open surfacing either way.
  const deadline = createScanDeadline();
  const counts = new Map<string, number>();
  for (const p of PATTERNS) {
    if (!timedOut.has(p.kind)) countMatches(p, text, allow, counts, deadline);
  }
  const allSkipped = new Set([...timedOut, ...deadline.tripped]);
  return {
    detections: [...counts.entries()].map(([kind, count]) => ({ kind, count })),
    skipped: [...allSkipped].sort().map((kind) => ({ kind, reason: 'redos-timeout' as const })),
  };
}

/**
 * Redact secret matches, skipping the given timed-out patterns (reuse the
 * set from `detectSecretsGuarded` so a request pays the probe once).
 */
export function redactSecretsGuarded(
  text: string,
  allow: RegExp[],
  skip: ReadonlySet<string>,
  deadline?: ScanDeadline,
): { text: string; redactions: number } {
  const redactions = { n: 0 };
  let out = text;
  for (const p of PATTERNS) {
    if (!skip.has(p.kind)) out = replacePattern(p, out, allow, redactions, deadline);
  }
  return { text: out, redactions: redactions.n };
}

// ---------------------------------------------------------------------------
// Request/response text walking (redact in-place on a clone)
// ---------------------------------------------------------------------------

/** Concatenate all string text under system + messages for scanning. */
export function collectText(request: Record<string, unknown>): string {
  const parts: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') parts.push(v);
    else if (Array.isArray(v)) for (const i of v) walk(i);
    else if (v && typeof v === 'object')
      for (const val of Object.values(v as Record<string, unknown>)) walk(val);
  };
  walk(request['system']);
  walk(request['messages']);
  return parts.join('\n');
}

/** Mutable char budget shared across one redaction walk. */
export interface ScanBudget {
  remaining: number;
  /** True only when a leaf was actually skipped for exceeding the budget. */
  truncated: boolean;
}

/** Deep-clone `value`, redacting every string leaf. Returns [clone, count]. */
export function redactDeep(
  value: unknown,
  allow: RegExp[],
  counter: { n: number },
  skip?: ReadonlySet<string>,
  budget?: ScanBudget,
  deadline?: ScanDeadline,
): unknown {
  if (typeof value === 'string') {
    if (budget) {
      // A leaf larger than the remaining budget is skipped whole — scanning
      // it would unbind the walk (chimera review finding), and slicing
      // mid-leaf could half-redact a credential. The caller surfaces the
      // truncation; the unscanned tail is returned as-is.
      if (value.length > budget.remaining) {
        budget.remaining = 0;
        budget.truncated = true;
        return value;
      }
      budget.remaining -= value.length;
    }
    const { text, redactions } = skip
      ? redactSecretsGuarded(value, allow, skip, deadline)
      : redactSecrets(value, allow, deadline);
    counter.n += redactions;
    return text;
  }
  if (Array.isArray(value))
    return value.map((v) => redactDeep(v, allow, counter, skip, budget, deadline));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v, allow, counter, skip, budget, deadline);
    }
    return out;
  }
  return value;
}
