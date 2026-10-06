import { getWSClient } from '@/lib/ws-client';
import { disposeStreakState } from './auto-submit-streak';
import { disposeLane, readLane, setActiveLane } from './chat-lanes';
import { useChimeraReportsStore } from './chimera-reports-store';
import { useFallbackStore } from './fallback-store';
import { useFileStore } from './file-store';
import { useFleetStore } from './fleet-store';
import { useGitChangesStore } from './git-changes-store';
import { useHistoryStore } from './history-store';
import { useLocalPrefs } from './local-prefs';
import {
  activeSessionLaneId,
  disposeSessionLane,
  ensureSessionLane,
  SESSION_DEFAULT_LANE_ID,
  setActiveSessionLane,
} from './session-lanes';
import { useSessionStore } from './session-store';
import { useSystemPromptStore } from './system-prompt-store';
import { useToolStatsStore } from './tool-stats-store';
import { useUIStore } from './ui-store';
import { useUserInputStore } from './user-input-store';

/*
 * Foreground binding, slot release, and server declarations for the tab
 * store: moving the lane pointer, freeing everything a slot owned, and telling
 * the server which tabs are open / in front.
 */

function syncUrl(sessionId: string) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('session') === sessionId) return;
    url.searchParams.set('session', sessionId);
    window.history.replaceState({}, '', url.toString());
  } catch {
    // ignore
  }
}

/**
 * Which slot is in front, or `null` before any session is bound.
 *
 * The LANE POINTER, and only the lane pointer. `useSessionStore().session?.id`
 * reads the foreground lane's SessionInfo instead, and that record is null
 * from the moment a tab is opened until its `session.start` lands — during
 * which this store believed no tab was in front and happily opened a second
 * slot for the session already sitting in one.
 */
export function foregroundTabId(): string | null {
  const pointer = activeSessionLaneId();
  return pointer && pointer !== SESSION_DEFAULT_LANE_ID ? pointer : null;
}

/**
 * Bind the foreground to one session. Both registries move together — a lane
 * pair that disagrees is how a transcript ended up next to another tab's token
 * counters.
 */
export function activate(sessionId: string) {
  ensureSessionLane(sessionId);
  setActiveLane(sessionId);
  setActiveSessionLane(sessionId);
  useSessionStore.getState().switchSession(sessionId);
  // Arriving at a tab always lands on the Leader chat — subagent focus is
  // foreground-only and never follows the user across tabs (setSubagentChatFocus
  // still stamps the session so ChatView can clear a focus that names another).
  const ui = useUIStore.getState();
  ui.bindSessionChrome(sessionId);
  ui.setSubagentChatFocus(null, sessionId);
  // Raise this tab's own unanswered approval prompt, and never another tab's:
  // the dialog is a single global surface, so switching away from a tab with a
  // live prompt must take it down with the tab.
  const lane = readLane(sessionId);
  const parked = lane.pendingConfirm;
  if (parked) ui.showConfirm(parked);
  else ui.hideConfirm();
  // Same rule for the provider-fallback dialog: one global surface, so it
  // shows this tab's unanswered prompt and comes down with the tab that
  // raised it.
  const parkedFallback = lane.pendingFallback;
  if (parkedFallback) useFallbackStore.getState().setPending(parkedFallback);
  else useFallbackStore.getState().clear();
  // The two diagnostic logs used to be wiped here: they were single global
  // objects that their handlers only ever filled for the tab in front, so on a
  // switch they held the PREVIOUS tab's memory injections and Brain panels and
  // nothing for this one — the chat header even counted them. They are now one
  // store instance per conversation (`createSessionScopedStore`), which is why
  // nothing is cleared: this tab's own records are already what shows, and the
  // tab we just left keeps its own instead of being emptied by a click.
  // The session catalogue is shared, but its "current" marker is not: it
  // disables resume on that row, drives the `active` filter, and spares the
  // row from the empty-session sweep. Re-point it at the tab now in front.
  useHistoryStore.getState().rebindCurrent(sessionId);
  // Slash-opened overlays (/queue, /kill, /cron) are one surface. Left open
  // they would operate on the tab we switched to — dequeueing, killing
  // processes — so they come down with the tab that opened them.
  ui.setQueuePanelOpen(false);
  ui.setProcessMonitorOpen(false);
  ui.setCronJobsOpen(false);
  syncUrl(sessionId);
}

/**
 * Everything one slot owns, freed in one place.
 *
 * `closeTab` and `setOpenTabIds` both retire a tab, and they used to free
 * different things: the lanes always, the preference overrides and
 * auto-submit streak only on the explicit close. A tab dropped by the other
 * path left state that the NEXT session to be handed that id silently
 * inherited, which is the one thing the four-lane model exists to prevent.
 * The boot-time lane/slot reconciler in `useF5Resilience` retires through this
 * same path for the same reason. `restoreOpenTabsOnBoot` is the symmetric
 * opposite: it REBINDS every persisted slot so a browser refresh leaves the
 * user's tabs where they were, not as a half-empty welcome screen.
 */
export function releaseTab(sessionId: string): void {
  disposeLane(sessionId);
  disposeSessionLane(sessionId);
  useLocalPrefs.getState().forgetSession(sessionId);
  useSystemPromptStore.getState().dropSession(sessionId);
  useUIStore.getState().forgetSession(sessionId);
  useUserInputStore.getState().forgetSession(sessionId);
  useFileStore.getState().forgetSessionFiles(sessionId);
  useGitChangesStore.getState().forgetSessionGitChanges(sessionId);
  useFleetStore.getState().applyEvent({ kind: 'session_stopped', sessionId });
  useChimeraReportsStore.getState().forgetSession(sessionId);
  useToolStatsStore.getState().resetSession(sessionId);
  disposeStreakState(sessionId);
}

/**
 * Put the foreground back on a slot that still exists.
 *
 * Disposing the lane a pointer names does not move the pointer, and a pointer
 * aimed at a freed lane is worse than no pointer: the lane registries recreate
 * a lane on first write, so the next stray event for the closed session
 * resurrects it — invisible, unclosable, and counting against the four-lane
 * ceiling that a real new tab needs. With no slots left the pointer goes back
 * to "nothing in front", which is also what lets untagged events land again.
 */
export function repointForegroundAfterRelease(
  remaining: string[],
  markSeen: (sessionId: string) => void,
): void {
  const pointer = activeSessionLaneId();
  if (pointer !== SESSION_DEFAULT_LANE_ID && remaining.includes(pointer)) return;
  const fallback = remaining[remaining.length - 1];
  if (fallback !== undefined) {
    activate(fallback);
    markSeen(fallback);
    return;
  }
  setActiveLane(null);
  setActiveSessionLane(SESSION_DEFAULT_LANE_ID);
  // With no tab in front there is no `activate()` to take the modals down, and
  // both of them ask a question ON BEHALF of a session that no longer exists —
  // an approval or a model choice answered here would be sent for a closed
  // conversation.
  useUIStore.getState().hideConfirm();
  useFallbackStore.getState().clear();
}

/**
 * Declare the open set to the server NOW, not on the next React commit.
 *
 * A deletion sent right after a tab close must not overtake the subscription
 * update on the socket: the server refuses to delete a session a connection
 * still declares, and the effect in `useSessionSubscription` that re-declares
 * runs only after paint. `subscribeSessions` dedupes, so the later effect
 * call for the same set is a no-op.
 */
/**
 * Tell the server this tab is in front. Never asks for its conversation back —
 * that is `session.resume`, and a tab already on screen must not be resumed.
 */
export function focusOnServer(sessionId: string): void {
  try {
    getWSClient().focusSessionById(sessionId);
  } catch {
    // No socket (tests, a page before connect): the foreground is a client-side
    // pointer either way, and the next stamped message names the session.
  }
}

export function declareOpenTabsNow(openTabIds: string[]): void {
  const active = foregroundTabId();
  const ids = active && !openTabIds.includes(active) ? [...openTabIds, active] : openTabIds;
  if (ids.length === 0) return;
  try {
    getWSClient().subscribeSessions(ids);
  } catch {
    // No socket yet — the reconnect path re-declares.
  }
}
