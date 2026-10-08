/**
 * leader-effort-store.ts — the leader's own reasoning effort, per tab.
 *
 * The leader can change its OWN effort mid-session (`leader_effort_set`); the
 * server announces it as `leader.effort_changed`. That choice never becomes
 * the tab's `reasoningEffort` pref — the select keeps showing what the USER
 * picked — and it stops applying the moment the user changes effort for that
 * tab. So this store remembers, next to the leader's effort, what the tab's
 * pref was when the leader spoke; the composer shows the leader's value only
 * while the pref still matches. The server applies the same rule
 * (`core/utils/leader-effort-override.ts`), so the hint and the wire agree.
 *
 * In-memory on purpose: the override is conversation state, and a reload that
 * re-seeds the tab from the server should not resurrect a stale hint.
 */

import { create } from 'zustand';
import { sessionPref } from './local-prefs';

export interface LeaderEffortEntry {
  effort: string;
  /** The tab's `reasoningEffort` pref when the leader changed its effort. */
  userEffort: string;
  reason?: string | undefined;
}

interface LeaderEffortState {
  bySession: Record<string, LeaderEffortEntry>;
  /** Record a change; `effort` undefined = the leader reset to the user's setting. */
  record: (sessionId: string, effort: string | undefined, reason?: string | undefined) => void;
}

export const useLeaderEffortStore = create<LeaderEffortState>((set) => ({
  bySession: {},
  record: (sessionId, effort, reason) =>
    set((state) => {
      const next = { ...state.bySession };
      if (effort) {
        next[sessionId] = {
          effort,
          userEffort: String(sessionPref(sessionId, 'reasoningEffort') ?? ''),
          ...(reason ? { reason } : {}),
        };
      } else {
        delete next[sessionId];
      }
      return { bySession: next };
    }),
}));

/** The leader's effort for a tab while it is still in force, else undefined. */
export function activeLeaderEffortEntry(
  entry: LeaderEffortEntry | undefined,
  currentUserEffort: string | undefined,
): LeaderEffortEntry | undefined {
  if (!entry) return undefined;
  return entry.userEffort === String(currentUserEffort ?? '') ? entry : undefined;
}
