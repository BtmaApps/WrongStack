export { describeSessionActivity, isTabBusy } from './session-activity.js';

/**
 * session-tab-store.ts — The four slots, and the only place a tab is opened,
 * switched or closed.
 *
 * The model, stated plainly:
 *
 *   - There are exactly FOUR slots. Never more, never a fifth "just for now".
 *   - A slot holds AT MOST one session, and a session sits in AT MOST one slot.
 *     Both directions are enforced here; nothing else is allowed to bind them.
 *   - Switching slots moves a pointer. It does not park, copy, restore or clear
 *     anything, because every slot's state already lives in its own lane
 *     (`chat-lanes.ts`, `session-lanes.ts`) whether or not it is on screen.
 *   - Closing a slot disposes that lane. A closed tab keeps nothing alive.
 *
 * Think of the four slots as four layouts side by side. What makes them
 * side-by-side rather than one surface with four costumes is that no slot can
 * name another slot's state: the lane registries are keyed by session id and
 * every writer must name the session it is writing to.
 */

import { create } from 'zustand';
import { chatLane, readLane } from './chat-lanes';
import { useFleetStore } from './fleet-store';
import { isTabBusy } from './session-activity.js';
import { readSessionLane, useSessionLanes } from './session-lanes';
import {
  activate,
  declareOpenTabsNow,
  foregroundTabId,
  releaseTab,
  repointForegroundAfterRelease,
} from './session-tab-activation';
import {
  pruneTabsToLiveSessionsIn,
  type RestoreOpenTabsOptions,
  restoreOpenTabsOnBootIn,
  restoreTabsAfterBootIn,
} from './session-tab-boot-restore';
import { openTabInStore } from './session-tab-open';
import { MAX_OPEN_TABS, readStoredTabs, writeStoredTabs } from './session-tab-persistence';
import type { SessionTabState, TabSummary } from './session-tab-types';
import { useUIStore } from './ui-store';

export { releaseTab } from './session-tab-activation';
export { resetBootRestoreLatchForTests } from './session-tab-boot-restore';
export {
  MAX_OPEN_TABS,
  readStoredTabs,
  TAB_STORAGE_KEY,
  writeStoredTabs,
} from './session-tab-persistence';
export type { OpenTabResult, TabSummary } from './session-tab-types';

/** See `pruneTabsToLiveSessionsIn` (session-tab-boot-restore.ts). */
export function pruneTabsToLiveSessions(live: readonly string[]): string[] {
  return pruneTabsToLiveSessionsIn(useSessionTabStore, live);
}

/** See `restoreTabsAfterBootIn` (session-tab-boot-restore.ts). */
export function restoreTabsAfterBoot(
  live: readonly string[] | undefined,
  options: RestoreOpenTabsOptions = {},
): string[] {
  return restoreTabsAfterBootIn(useSessionTabStore, live, options);
}

/** See `restoreOpenTabsOnBootIn` (session-tab-boot-restore.ts). */
export function restoreOpenTabsOnBoot(options: RestoreOpenTabsOptions = {}): string[] {
  return restoreOpenTabsOnBootIn(useSessionTabStore, options);
}

export const useSessionTabStore = create<SessionTabState>((set, get) => ({
  openTabIds: readStoredTabs(),
  lastSeenCounts: {},
  attention: {},

  setOpenTabIds: (ids) => {
    const seen = new Set<string>();
    const valid: string[] = [];
    for (const id of ids) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      valid.push(id);
      if (valid.length === MAX_OPEN_TABS) break;
    }
    // A session that lost its slot loses everything the slot owned. This used
    // to dispose the two lanes and stop, so a tab dropped through this path
    // (history purge, slot recycling, a re-announce) left its preference
    // overrides, auto-submit streak, unread count and attention flag behind —
    // and a later session that reused the id inherited them.
    const dropped = get().openTabIds.filter((id) => !seen.has(id));
    for (const id of dropped) releaseTab(id);
    const keep = <T>(record: Record<string, T>): Record<string, T> =>
      Object.fromEntries(Object.entries(record).filter(([id]) => seen.has(id)));
    set({
      openTabIds: valid,
      lastSeenCounts: keep(get().lastSeenCounts),
      attention: keep(get().attention),
    });
    writeStoredTabs(valid);
    if (dropped.length > 0) repointForegroundAfterRelease(valid, get().markSeen);
  },
  openTab: (sessionId, options) => openTabInStore(get, set, sessionId, options),

  closeTab: (sessionId) => {
    const tabs = get().openTabIds;
    const next = tabs.filter((id) => id !== sessionId);

    // Free the lane BEFORE re-pointing, so nothing can land in a slot that no
    // longer exists.
    releaseTab(sessionId);

    const { [sessionId]: _seen, ...lastSeenCounts } = get().lastSeenCounts;
    const { [sessionId]: _att, ...attention } = get().attention;
    set({ openTabIds: next, lastSeenCounts, attention });
    writeStoredTabs(next);
    // Re-point FIRST: the delete below is tagged with whichever session is in
    // front, and the server needs that tag (the session it should move the
    // runtime onto) to allow deleting its own current session.
    repointForegroundAfterRelease(next, get().markSeen);
    declareOpenTabsNow(next);
  },

  closeTabsForSessions: (sessionIds) => {
    // The server refuses to delete a session with an active run, so a busy
    // session is neither closable nor deletable here — its tab stays visible
    // and its run stays observable.
    const removable = new Set(sessionIds.filter((id) => !isTabBusy(id)));
    const tabs = [...get().openTabIds];
    if (removable.size === 0) return [];

    if (tabs.length === 0) return [...removable];

    let keep = tabs.filter((id) => !removable.has(id));
    if (keep.length === 0) {
      // Every slot belongs to a doomed session. The strip never drops to
      // zero: keep exactly one tab — the foreground when possible — and
      // report its session as NOT removable so the caller skips deleting it.
      const active = foregroundTabId();
      const spared = active && removable.has(active) ? active : tabs[tabs.length - 1];
      keep = [spared];
      removable.delete(spared);
    }

    get().setOpenTabIds(keep);
    // Declare the shrunken set before the caller's deletes go out, so the
    // deletions cannot be refused as "still displayed by this connection".
    declareOpenTabsNow(keep);
    return [...removable];
  },

  swapTabSession: (retiredId, nextId) => {
    if (!retiredId || !nextId || retiredId === nextId) return;
    const tabs = get().openTabIds;
    const slot = tabs.indexOf(retiredId);
    // The retired session never had a tab here (replaced from another
    // surface, or this page simply never opened it): nothing to rebind. The
    // normal open/focus path in `handleSessionStart` decides whether the
    // newcomer gets a slot at all.
    if (slot === -1) return;

    // Compute BEFORE releasing: releaseTab leaves the lane pointer aimed at
    // a disposed lane when the retired session was in front, and the pointer
    // is what says which slot that was.
    const wasForeground = foregroundTabId() === retiredId;

    // Free everything the retired session owned BEFORE the strip learns its
    // replacement, so no store ever holds two sessions' state under one slot.
    releaseTab(retiredId);

    // Same slot, new session. Length never changes, so a full strip swaps
    // without touching the four-slot ceiling an `openTab` would have hit.
    const next = tabs.map((id, i) => (i === slot ? nextId : id));
    const { [retiredId]: _seen, ...lastSeenCounts } = get().lastSeenCounts;
    const { [retiredId]: _att, ...attention } = get().attention;
    set({ openTabIds: next, lastSeenCounts, attention });
    writeStoredTabs(next);

    // The foreground follows the slot only when the retired session was in
    // front — a background slot swapped out from under another surface must
    // not yank the pointer off the tab this user is typing in.
    if (wasForeground) {
      activate(nextId);
      get().markSeen(nextId);
    }
    // The retired id is closed server-side; the newcomer must be in the
    // declared open set or its broadcasts stop at the wire.
    declareOpenTabsNow(next);
  },

  markSeen: (sessionId) =>
    set((s) => ({
      lastSeenCounts: { ...s.lastSeenCounts, [sessionId]: readLane(sessionId).messages.length },
      attention: { ...s.attention, [sessionId]: false },
    })),

  setAttention: (sessionId, needsAttention) =>
    set((s) => ({ attention: { ...s.attention, [sessionId]: needsAttention } })),
}));

/**
 * Everything the tab strip and the tab map need about one slot, read straight
 * from the lane registries. There is no separate per-tab mirror to drift.
 */
export function summarizeTab(sessionId: string, slot: number): TabSummary {
  const chat = readLane(sessionId);
  const meta = readSessionLane(sessionId);
  const tabState = useSessionTabStore.getState();
  const activeId = useSessionLanes.getState().activeSessionId;

  let agentsRunning = 0;
  let agentsTotal = 0;
  for (const agent of useFleetStore.getState().agents.values()) {
    if (agent.sessionId !== sessionId) continue;
    agentsTotal += 1;
    if (agent.status === 'running') agentsRunning += 1;
  }

  const seen = tabState.lastSeenCounts[sessionId] ?? chat.messages.length;
  const isActive = sessionId === activeId;
  const tokens = meta.totalTokens.input + meta.totalTokens.output;

  return {
    slot,
    sessionId,
    isActive,
    title:
      useUIStore.getState().sessionNicknames[sessionId] ||
      meta.session?.title ||
      sessionId.slice(0, 8),
    provider: meta.session?.provider ?? '',
    model: meta.session?.model ?? '',
    mode: meta.mode,
    isRunning: chat.isLoading,
    messageCount: chat.messages.length,
    unread: isActive ? 0 : Math.max(0, chat.messages.length - seen),
    queued: chat.queue.length,
    agentsRunning,
    agentsTotal,
    tokens,
    cost: meta.cost,
    contextPct:
      meta.maxContext > 0 && meta.lastInputTokens > 0
        ? Math.min(100, Math.round((meta.lastInputTokens / meta.maxContext) * 100))
        : 0,
    needsAttention: !isActive && tabState.attention[sessionId] === true,
  };
}

/** Which slot a session sits in, or -1. Enforces the one-session-one-tab rule
 *  at read time so callers cannot invent a second home for a session. */
export function slotOf(sessionId: string): number {
  return useSessionTabStore.getState().openTabIds.indexOf(sessionId);
}

export { chatLane };
