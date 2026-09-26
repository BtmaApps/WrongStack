/**
 * Opt-in per-request prompt-cache prefix probe.
 *
 * The question this answers is not "what is the hit ratio" — the session
 * ledger already reports that — but "WHICH PART of the request stopped
 * matching the previous request". We compare instructions, tools and input
 * items locally. The backend's rendered prefix, token boundaries and routing
 * are not observable here; character overlap is not a cache-hit prediction.
 *
 * So the probe fingerprints the three segments per request, diffs them against
 * the previous request of the same account/provider/model/thread/settings,
 * and appends one JSONL line saying where the divergence was. The usage line
 * that follows carries what the backend actually charged, so a reader can pair
 * "prefix broke at item 4" with "cached_tokens collapsed to 0".
 *
 * Off unless `WRONGSTACK_CACHE_PROBE` is set (`1` for the default path, or a
 * path to write to). Nothing here runs — not a hash, not a stat — when it is
 * unset: an always-on instrument that hashes every input item on every request
 * would itself be a per-turn cost on the path it is measuring.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { wstackGlobalRoot } from '@wrongstack/core/utils';

/** Per-session fingerprint of the previous request's cacheable prefix. */
export interface CacheProbeFingerprint {
  instructions: string;
  instructionsChars: number;
  tools: string;
  toolsChars: number;
  /** One hash per input item, in wire order. */
  items: string[];
  /** Serialized length of each input item, in wire order. */
  itemChars: number[];
}

/** What changed between two consecutive requests of one session. */
export interface CacheProbeDiff {
  instructionsChanged: boolean;
  toolsChanged: boolean;
  /**
   * Index of the first input item whose bytes differ from the previous
   * request, or `null` when every shared item matched (append-only growth —
   * the healthy case).
   */
  firstDivergentItem: number | null;
  /**
   * Local matching characters in tools → instructions → input order.
   * Historical field name; this does not establish a server cache entry or
   * eligible breakpoint at the end of the matching text.
   */
  cacheablePrefixChars: number;
  /** Total characters in the cacheable segments of this request. */
  promptChars: number;
}

const MAX_TRACKED_SESSIONS = 32;

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/**
 * Fingerprint the cacheable segments of one request body.
 *
 * `items` are hashed individually rather than as one blob: the whole point is
 * to report WHERE the prefix broke, and a single hash over the array can only
 * report THAT it broke.
 */
export function fingerprintCacheProbe(segments: {
  instructions: string;
  tools: readonly unknown[] | undefined;
  items: readonly unknown[];
}): CacheProbeFingerprint {
  const toolsJson = JSON.stringify(segments.tools ?? []);
  const items: string[] = [];
  const itemChars: number[] = [];
  for (const item of segments.items) {
    const json = JSON.stringify(item ?? null);
    items.push(sha(json));
    itemChars.push(json.length);
  }
  return {
    instructions: sha(segments.instructions),
    instructionsChars: segments.instructions.length,
    tools: sha(toolsJson),
    toolsChars: toolsJson.length,
    items,
    itemChars,
  };
}

/**
 * Diff two fingerprints into a local prefix comparison.
 *
 * Follow the documented rendered order: tools precede developer instructions,
 * then conversation input. Each segment is compared as a whole; hidden server
 * content, partial segment matches and eligible cache boundaries are unknown.
 * This is character overlap, not a cache verdict, even when it reaches 100%.
 */
export function diffCacheProbe(
  prev: CacheProbeFingerprint | undefined,
  cur: CacheProbeFingerprint,
): CacheProbeDiff {
  const promptChars =
    cur.instructionsChars + cur.toolsChars + cur.itemChars.reduce((a, b) => a + b, 0);
  if (!prev) {
    return {
      instructionsChanged: false,
      toolsChanged: false,
      firstDivergentItem: null,
      cacheablePrefixChars: 0,
      promptChars,
    };
  }
  const instructionsChanged = prev.instructions !== cur.instructions;
  const toolsChanged = prev.tools !== cur.tools;

  let firstDivergentItem: number | null = null;
  const shared = Math.min(prev.items.length, cur.items.length);
  for (let i = 0; i < shared; i++) {
    if (prev.items[i] !== cur.items[i]) {
      firstDivergentItem = i;
      break;
    }
  }

  let cacheablePrefixChars = 0;
  if (toolsChanged) {
    cacheablePrefixChars = 0;
  } else if (instructionsChanged) {
    cacheablePrefixChars = cur.toolsChars;
  } else {
    cacheablePrefixChars = cur.instructionsChars + cur.toolsChars;
    const upTo = firstDivergentItem ?? shared;
    for (let i = 0; i < upTo; i++) cacheablePrefixChars += cur.itemChars[i] ?? 0;
  }

  return {
    instructionsChanged,
    toolsChanged,
    firstDivergentItem,
    cacheablePrefixChars,
    promptChars,
  };
}

// ── the opt-in recorder ─────────────────────────────────────────────────────

let enabledCache: string | null | undefined;

/** Resolved output path, or null when the probe is off. */
function probePath(): string | null {
  if (enabledCache !== undefined) return enabledCache;
  const raw = process.env['WRONGSTACK_CACHE_PROBE'];
  if (!raw || raw === '0' || raw === 'false') {
    enabledCache = null;
    return null;
  }
  enabledCache =
    raw === '1' || raw === 'true'
      ? path.join(wstackGlobalRoot(), 'cache-probe.jsonl')
      : path.resolve(raw);
  return enabledCache;
}

/** Test seam — the env var is read once per process in normal operation. */
export function resetCacheProbeState(): void {
  enabledCache = undefined;
  lastBySession.clear();
}

/** Whether anything below will do work. Callers guard on this before building segments. */
export function isCacheProbeEnabled(): boolean {
  return probePath() !== null;
}

const lastBySession = new Map<string, CacheProbeFingerprint>();

function append(line: Record<string, unknown>): void {
  const file = probePath();
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf8');
  } catch {
    // A diagnostic must never be able to fail a request.
  }
}

/**
 * Record local prefix similarity. Keep the wire partition key for attribution,
 * but compare individual threads/models rather than siblings sharing that key.
 */
export function recordCacheProbeRequest(input: {
  provider: string;
  sessionKey: string;
  model: string;
  threadId?: string | undefined;
  requestId?: string | undefined;
  accountScope?: string | undefined;
  settings?: unknown;
  instructions: string;
  tools: readonly unknown[] | undefined;
  items: readonly unknown[];
}): void {
  if (!isCacheProbeEnabled()) return;
  const cur = fingerprintCacheProbe(input);
  const identity = JSON.stringify([
    input.provider,
    input.accountScope,
    input.model,
    input.sessionKey,
    input.threadId,
    input.settings,
  ]);
  const prev = lastBySession.get(identity);
  const diff = diffCacheProbe(prev, cur);

  lastBySession.delete(identity);
  lastBySession.set(identity, cur);
  while (lastBySession.size > MAX_TRACKED_SESSIONS) {
    const oldest = lastBySession.keys().next().value;
    if (oldest === undefined) break;
    lastBySession.delete(oldest);
  }

  append({
    kind: 'req',
    ts: new Date().toISOString(),
    provider: input.provider,
    session: input.sessionKey,
    model: input.model,
    threadId: input.threadId,
    requestId: input.requestId,
    first: prev === undefined,
    items: cur.items.length,
    prevItems: prev?.items.length ?? 0,
    instructionsChars: cur.instructionsChars,
    toolsChars: cur.toolsChars,
    instructionsChanged: diff.instructionsChanged,
    toolsChanged: diff.toolsChanged,
    firstDivergentItem: diff.firstDivergentItem,
    cacheablePrefixChars: diff.cacheablePrefixChars,
    promptChars: diff.promptChars,
    // JSON character overlap is diagnostic evidence, not a prediction of
    // token cache hits: server rendering, breakpoints and routing are unknown.
    matchingPrefixCharsPct:
      diff.promptChars > 0 ? Math.round((diff.cacheablePrefixChars / diff.promptChars) * 100) : 0,
  });
}

/** Record what the backend actually charged for the request just sent. */
export function recordCacheProbeUsage(input: {
  provider: string;
  sessionKey: string;
  model?: string | undefined;
  threadId?: string | undefined;
  requestId?: string | undefined;
  /** Subset of output tokens, never added to the charged output total. */
  reasoningTokens?: number | undefined;
  usage: {
    input: number;
    output: number;
    cacheRead?: number | undefined;
    cacheWrite?: number | undefined;
  };
}): void {
  if (!isCacheProbeEnabled()) return;
  const cacheRead = input.usage.cacheRead ?? 0;
  const cacheWrite = input.usage.cacheWrite ?? 0;
  const prompt = input.usage.input + cacheRead + cacheWrite;
  append({
    kind: 'usage',
    ts: new Date().toISOString(),
    provider: input.provider,
    session: input.sessionKey,
    model: input.model,
    threadId: input.threadId,
    requestId: input.requestId,
    promptTokens: prompt,
    cachedTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    outputTokens: input.usage.output,
    reasoningOutputTokens: input.reasoningTokens,
    actualHitPct: prompt > 0 ? Math.round((cacheRead / prompt) * 100) : 0,
  });
}

/** Transport reuse is separate from backend token cache hits. No prompt text is logged. */
export function recordCacheProbeTransport(input: {
  provider: string;
  sessionKey: string;
  threadId?: string | undefined;
  requestId?: string | undefined;
  model: string;
  mode: 'full' | 'delta';
  reason: string;
  fullInputItems: number;
  sentInputItems: number;
}): void {
  if (!isCacheProbeEnabled()) return;
  append({ kind: 'transport', ts: new Date().toISOString(), ...input });
}
