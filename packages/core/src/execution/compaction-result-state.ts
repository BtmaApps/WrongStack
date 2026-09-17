import type { Context } from '../core/context.js';
import { contextHistoryVersion } from '../core/context-history-version.js';
import type { CompactReport } from '../types/compactor.js';

interface ReportState {
  historyVersion: number;
  sessionId: string | undefined;
  providerId: string | undefined;
  model: string;
}

// Only primitive provenance is retained; a stored report must not keep a closed
// context, writer or provider alive. These stamps are not serialized to the UI.
const states = new WeakMap<object, ReportState>();
const staleResults = new WeakSet<object>();

export function stampCompactionReport<T extends CompactReport>(report: T, ctx: Context): T {
  states.set(report, {
    historyVersion: contextHistoryVersion(ctx),
    sessionId: ctx.session?.id,
    providerId: ctx.provider?.id,
    model: ctx.model,
  });
  return report;
}

export function markStaleCompactionReport<T extends CompactReport>(report: T): T {
  staleResults.add(report);
  return report;
}

export function compactionReportStillCurrent(report: CompactReport, ctx: Context): boolean {
  if (staleResults.has(report)) return false;
  const state = states.get(report);
  // Preserve compatibility with custom compactors without internal stamps.
  return (
    !state ||
    (state.historyVersion === contextHistoryVersion(ctx) &&
      state.sessionId === ctx.session?.id &&
      state.providerId === ctx.provider?.id &&
      state.model === ctx.model)
  );
}
