import type { AgentTranscriptEntry, FleetTimelineEvent, SubagentView } from './types.js';

// ── Fleet store (live subagent roster; not persisted) ───────────────────────

export const SPARKLINE_BINS = 12;

export const MAX_TIMELINE = 20;

export const MAX_AGENT_TRANSCRIPT = 1000;

export function blankAgent(id: string, name?: string, sessionId?: string): SubagentView {
  return {
    id,
    name: name?.trim() || id,
    sessionId,
    status: 'running',
    iteration: 0,
    toolCalls: 0,
    costUsd: 0,
    ctxPct: 0,
    ctxTokens: 0,
    maxContext: 0,
    extensions: 0,
    startedAt: Date.now(),
    toolLog: [],
    sparklineBins: Array(SPARKLINE_BINS).fill(0),
  };
}

export function pushTimeline(
  timeline: FleetTimelineEvent[],
  event: FleetTimelineEvent,
): FleetTimelineEvent[] {
  return [event, ...timeline].slice(0, MAX_TIMELINE);
}

export function canMergeTranscriptEntry(a: AgentTranscriptEntry, b: AgentTranscriptEntry): boolean {
  if (a.subagentId !== b.subagentId) return false;
  if (a.kind !== b.kind) return false;
  if (a.iteration !== b.iteration) return false;
  if (a.toolName !== b.toolName) return false;
  if (a.toolOk !== b.toolOk) return false;
  return a.kind === 'text' || a.kind === 'thinking';
}

export function appendTranscriptEntry(
  entries: AgentTranscriptEntry[],
  entry: AgentTranscriptEntry,
): AgentTranscriptEntry[] {
  const last = entries[entries.length - 1];
  if (last && canMergeTranscriptEntry(last, entry)) {
    return [
      ...entries.slice(0, -1),
      { ...last, content: `${last.content}${entry.content}`, ts: entry.ts },
    ].slice(-MAX_AGENT_TRANSCRIPT);
  }
  return [...entries, entry].slice(-MAX_AGENT_TRANSCRIPT);
}

/** Update sparkline bins for an agent — bump bin 0 and shift left.
 *  The bins array has index 0 as the most recent bucket.
 *  Each event bumps bin 0, then the array is truncated to SPARKLINE_BINS. */
export function bumpSparkline(bins: number[]): number[] {
  // `?? 0`: an agent whose bins never got seeded (rehydrated state, or a
  // tool/iteration event arriving before 'spawned') made this `undefined + 1`
  // = NaN — and the shift below then carries that NaN through every later
  // bump, so the sparkline stays broken for the life of the agent.
  return [(bins[0] ?? 0) + 1, ...bins.slice(0, SPARKLINE_BINS - 1)];
}

export function clampContextPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}
