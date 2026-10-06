import { toast } from '@/components/Toaster';
import { i18n } from '@/i18n';
import { readLane } from './chat-lanes';
import { useHistoryStore } from './history-store';
import { useResumeProgressStore } from './resume-progress-store';
import { describeSessionActivity, isTabBusy, notifyBusyTabLeftBehind } from './session-activity.js';
import { activate, focusOnServer, foregroundTabId } from './session-tab-activation';
import { MAX_OPEN_TABS, writeStoredTabs } from './session-tab-persistence';
import type { OpenTabResult, SessionTabState } from './session-tab-types';

/**
 * `useSessionTabStore().openTab` — bind a session to a slot: focus it when it
 * is already open, take a free slot, recycle one empty background slot when
 * the strip is full, or refuse.
 */
export function openTabInStore(
  get: () => SessionTabState,
  set: (partial: Partial<SessionTabState>) => void,
  sessionId: string,
  options?: { resumeSession?: (id: string) => void; recycleReentry?: boolean },
): OpenTabResult {
  if (!sessionId) return { success: false, reason: 'tabs_full' };
  const recycleReentry = options?.recycleReentry === true;
  const activeId = foregroundTabId();
  const tabs = [...get().openTabIds];

  // The session in front always owns a slot, even if the strip has not
  // caught up with it yet.
  if (activeId && !tabs.includes(activeId) && tabs.length < MAX_OPEN_TABS) tabs.push(activeId);

  if (sessionId === activeId) {
    // Guard against the STORED strip, not the local copy above: the push
    // already put the foreground session into `tabs`, so a local check can
    // never fire — the strip stayed without the tab in front (dead branch),
    // and no tab appeared no matter how often that session was opened.
    if (!get().openTabIds.includes(sessionId)) {
      const next = [...tabs.slice(0, MAX_OPEN_TABS - 1), sessionId];
      // Route through setOpenTabIds so a displaced slot (a strip skewed full
      // without the foreground) is RELEASED, not silently overwritten.
      get().setOpenTabIds(next);
    }
    get().markSeen(sessionId);
    return { success: true, reason: 'already_active' };
  }

  // Already open: switch to its slot. One session, one slot — never a
  // second copy of the same session in another tab.
  //
  // A session on screen is NEVER resumed again. Resuming re-reads a
  // conversation the page is already displaying and answers with a replay
  // rebuilt from the working set — no live tool cards, no audit markers,
  // every message under a new id — so a click that should have moved a
  // pointer rewrote the tab instead. What the server actually needs to know
  // is only which tab is in front, and that is `session.focus`: it moves the
  // runtime's session, the connection's acting id and the todo board, and
  // sends no transcript. (A focus on a session the server is not holding —
  // a page that outlived its process — still falls through to a real resume
  // server-side, so a stale tab is not left blank.)
  //
  // The busy-tab toast is emitted ONLY on the three branches that actually
  // move the foreground off `activeId` — a tabs_full refusal leaves the
  // busy tab in front and must not claim it "keeps running in background".
  // The recycle re-entry passes `recycleReentry`, so its hop stays silent.
  if (tabs.includes(sessionId)) {
    if (activeId && !recycleReentry) notifyBusyTabLeftBehind(activeId);
    activate(sessionId);
    get().markSeen(sessionId);
    // An EMPTY slot is the one focus that may turn into a real wait. The
    // server answers a focus for a session it holds with no transcript
    // (the tab already has it), but a page that outlived its process is
    // focusing a session the runtime has never opened — and there the
    // focus falls through to a full journal resume server-side. That slot
    // has nothing on screen meanwhile, which is the same blank pane the
    // resume indicator exists for. A focus the server answers immediately
    // clears the flag on arrival, so marking it costs nothing.
    if (readLane(sessionId).messages.length === 0) {
      useResumeProgressStore.getState().begin(sessionId);
    }
    focusOnServer(sessionId);
    return { success: true, reason: 'switched' };
  }

  if (tabs.length < MAX_OPEN_TABS) {
    if (activeId && !recycleReentry) notifyBusyTabLeftBehind(activeId);
    const next = [...tabs, sessionId];
    set({ openTabIds: next });
    writeStoredTabs(next);
    activate(sessionId);
    get().markSeen(sessionId);
    // Mark the wait BEFORE the request goes out. The slot is already on
    // screen and the lane is empty, so without this the pane renders the
    // welcome screen for however long the server needs to replay the
    // journal — which on a large one is long enough to read as "the
    // transcript is gone". Every resume reaches the server through this
    // callback, so one call here covers the history list, the tab strip, the
    // command palette and the restore-tabs modal alike.
    if (options?.resumeSession) {
      useResumeProgressStore.getState().begin(sessionId);
      options.resumeSession(sessionId);
    }
    // A re-entry through the recycle path reports the honest reason: the
    // strip did not simply gain a slot — an empty slot was REPLACED.
    return {
      success: true,
      reason: recycleReentry ? 'replaced_empty_tab' : 'opened_new_tab',
    };
  }

  // Strip full: before refusing, recycle ONE empty background slot — a tab
  // whose session never started (no transcript, no run, no agents, no
  // parked prompts) has nothing to lose, so its slot can host the new
  // session instead of bouncing the user with "all four slots are full".
  // The tab in front is never recycled, and a busy slot is never recycled
  // (isTabBusy covers a live run and running subagents). closeTab frees the
  // lane and its per-session state exactly like a manual close; the
  // recursive call then takes the normal below-cap path and terminates —
  // the strip is below MAX, so it cannot re-enter this branch.
  const recyclable = tabs.find((id) => {
    if (id === activeId || isTabBusy(id)) return false;
    // Boot-restore ensures lanes WITHOUT replaying transcripts, so an
    // in-memory-empty lane can still belong to a session with REAL
    // persisted history. Mirror SessionList's empty-session sweep: the
    // record must be content-free (no tokens, no messages) before its
    // slot may host a new session. No record at all = never persisted.
    const entry = useHistoryStore.getState().entries.find((e) => e.id === id);
    if (entry && (entry.tokenTotal > 0 || (entry.messageCount ?? 0) > 0)) return false;
    const lane = readLane(id);
    return (
      describeSessionActivity(id).isEmpty &&
      lane.pendingConfirm === null &&
      lane.pendingFallback === null &&
      lane.pendingRefinement === null
    );
  });
  if (recyclable) {
    if (activeId && !recycleReentry) notifyBusyTabLeftBehind(activeId);
    get().closeTab(recyclable);
    return get().openTab(sessionId, { ...options, recycleReentry: true });
  }

  toast.error(
    i18n.t('activity:sessions.allTabsRunning', {
      defaultValue:
        'Maksimum 4 aktif sekme dolu. Başka bir oturum açmak için önce bir sekmeyi kapatın.',
    }),
  );
  return { success: false, reason: 'tabs_full' };
}
