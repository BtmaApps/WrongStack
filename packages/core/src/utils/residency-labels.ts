/**
 * Display vocabulary for context residency — shared by the CLI `/context
 * residency` report, the TUI context panel and the WebUI context dashboard so
 * every surface names the same request segment, cache lane and retention
 * class the same way. Dependency-free (types only) so browser bundles can
 * import it through its own `@wrongstack/core/utils/residency-labels` entry.
 */
import type { CacheLane, CacheVerdict, ResidencySegmentKind } from './request-layout.js';

export type {
  CacheBreaker,
  CacheBreakerKind,
  CacheLane,
  CacheMechanism,
  CacheVerdict,
  RequestResidency,
  ResidencySegment,
  ResidencySegmentKind,
} from './request-layout.js';

/** Retention class of a durable message — see `getHistoryRetention`. */
export type RetentionClass =
  | 'protected'
  | 'elision-candidate'
  | 'compactable'
  | 'elided'
  | 'digest';

/** What the next compaction keeps — produced by `getHistoryRetention`. */
export interface HistoryRetention {
  preserveK: number;
  eliseThreshold: number;
  /** Index of the first message inside the preserve window. */
  preserveStart: number;
  classes: Record<RetentionClass, { messages: number; tokens: number }>;
  total: number;
}

export const RESIDENCY_SEGMENT_LABELS: Record<ResidencySegmentKind, string> = {
  tools: 'tool definitions',
  system: 'system prompt (stable)',
  'history-prior': 'history · sent before',
  'history-new': 'history · new this request',
  'live-snapshots': 'live context · earlier snapshots',
  'live-tail': 'live context · this request',
  'request-scoped': 'request-scoped (mail) · sent once',
};

export const CACHE_LANE_ORDER: readonly CacheLane[] = ['cached', 'written', 'uncached'];

export const CACHE_LANE_LABELS: Record<CacheLane, string> = {
  cached: 'cached',
  written: 'written',
  uncached: 'not cached',
};

export const CACHE_LANE_HINTS: Record<CacheLane, string> = {
  cached: 'served from the provider cache',
  written: 'new prefix — billed fresh now, reusable by the next request',
  uncached: 'per-request live state — never part of a reusable prefix',
};

export const CACHE_VERDICT_LABELS: Record<CacheVerdict, string> = {
  pending: 'waiting for the response',
  cold: 'cold start — the first request builds the cache',
  hit: 'hit — the prefix was reused as expected',
  partial: 'partial — less was read from cache than the layout allows',
  miss: 'miss — nothing was read from cache',
  unsupported: 'this provider does not cache prompts',
};

/** Retention classes in display order: what stays first, what is already gone last. */
export const RETENTION_CLASSES: readonly RetentionClass[] = [
  'protected',
  'elision-candidate',
  'compactable',
  'elided',
  'digest',
];

export const RETENTION_LABELS: Record<RetentionClass, string> = {
  protected: 'protected (recent turns)',
  'elision-candidate': 'elision candidates',
  compactable: 'compactable',
  elided: 'already elided',
  digest: 'compaction digests',
};
