import { ensureLane } from './chat-lanes';
import { useHistoryStore } from './history-store';
import { useLocalPrefs } from './local-prefs';
import { useRestoreTabsStore } from './restore-tabs-store';
import { ensureSessionLane, readSessionLane } from './session-lanes';
import {
  activate,
  declareOpenTabsNow,
  focusOnServer,
  foregroundTabId,
  releaseTab,
  repointForegroundAfterRelease,
} from './session-tab-activation';
import { MAX_OPEN_TABS, writeStoredTabs } from './session-tab-persistence';
import type { SessionTabStoreApi } from './session-tab-types';
import { useUIStore } from './ui-store';

/*
 * Boot-time reconciliation of the persisted tab strip with the server, and
 * promotion of the surviving slots into live, foregrounded tabs. The store
 * (`useSessionTabStore`) is passed in; `session-tab-store.ts` exports the
 * store-bound entry points.
 */

/**
 * Foreground picker for `restoreOpenTabsOnBoot`. Deterministic for tests.
 *
 * The persisted `openTabIds` order reflects the user's last tab strip;
 * `lastVisitedAt` is per-tab and survives F5 inside `useSessionLanes`.
 * Picking the most-recently-visited tab and falling back to the persisted
 * order on a tie keeps the foreground where the user left it without
 * inventing a new ordering rule. The `now` parameter is injected so the
 * helper stays pure and testable.
 */
type RestorePickForeground = (candidates: string[], now: number) => string | null;

const defaultPickForeground: RestorePickForeground = (candidates, _now) => {
  // `_now` is the RestorePickForeground test seam (tests inject a frozen
  // clock); the default picker is clock-free — most-recently-visited wins.
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestVisited = readSessionLane(best).lastVisitedAt || 0;
  for (let i = 1; i < candidates.length; i += 1) {
    const id = candidates[i]!;
    const visited = readSessionLane(id).lastVisitedAt || 0;
    if (visited > bestVisited) {
      best = id;
      bestVisited = visited;
    }
  }
  return best;
};

export interface RestoreOpenTabsOptions {
  /** Injected clock for tests. Defaults to `Date.now()`. */
  now?: number;
  /** Injected picker for tests. Defaults to `defaultPickForeground`. */
  pickForeground?: RestorePickForeground;
}

/**
 * Promote the persisted slot list into active, foregrounded tabs at boot.
 *
 * The inverse of `releaseTab`: every id stored in
 * `wrongstack.open_session_tabs` has its chat lane and session lane
 * ensured, its per-session preferences bound, and its subagent focus and
 * history rebinds wired up. The most-recently-visited id (or the first
 * stored id on a tie) becomes the foreground, re-routing through
 * `activate()` so URL sync, modal disposal, slash-overlay closing and
 * history rebinding happen exactly the way they do when the user clicks
 * the tab. Finally the open set is declared to the WS client so the
 * server resumes broadcasts to all four lanes on the very first paint.
 *
 * Called once from `useF5Resilience` at app mount; safe to call again
 * later but a no-op once the foreground has been set.
 */
/**
 * Drop persisted tabs the SERVER is not holding, and return what survives.
 *
 * The tab strip lives in `localStorage`, so it outlives the process that
 * created it. After a restart every id in it names a session this runtime has
 * never heard of — and promoting them anyway is what made a fresh
 * `wstack --webui` open wearing the previous run's tabs, front a conversation
 * from days ago, and sit through a full journal resume (todo board included)
 * before the user had typed a character.
 *
 * A dropped tab is not a deleted session: the transcript stays on disk and in
 * History, where reopening it is an explicit act. This only says it is no
 * longer *open*.
 *
 * `live` is the runtime's own list (`openSessionIds` on the boot frame). An
 * empty or absent list means "trust nothing" and is treated as no tabs — the
 * caller then seeds the strip with the session the server just announced.
 */
export function pruneTabsToLiveSessionsIn(
  store: SessionTabStoreApi,
  live: readonly string[],
): string[] {
  const alive = new Set(live.filter((id) => typeof id === 'string' && id.length > 0));
  const stored = store.getState().openTabIds;
  const kept = stored.filter((id) => alive.has(id));
  if (kept.length === stored.length) return kept;
  for (const id of stored) {
    if (!alive.has(id)) releaseTab(id);
  }
  writeStoredTabs(kept);
  store.setState({ openTabIds: kept });
  return kept;
}

/** One-shot latch: the boot restore may only run once per page load. */
let bootRestoreDone = false;
/** A frame carrying `openSessionIds` already reconciled the strip. */
let bootFrameReconciled = false;

/** Test seam — lets a suite re-arm the one-shot latch. */
export function resetBootRestoreLatchForTests(): void {
  bootRestoreDone = false;
  bootFrameReconciled = false;
}

/**
 * Reconcile the persisted tab strip with the server, then promote what is left.
 *
 * Runs once per page load, driven by whichever comes first:
 *
 * - the boot `session.start` frame, which carries `openSessionIds` — the
 *   sessions this runtime is actually holding. Stale slots are dropped, and if
 *   NOTHING survives the strip stays empty so the announced session becomes the
 *   single tab. That is the whole point: a fresh `wstack --webui` must open on
 *   an empty conversation, not on a tab strip from a previous run.
 * - a fallback timer, for a server too old to send the field or a page that
 *   never connects. There the strip is restored unfiltered, which is the
 *   behaviour that existed before this reconciliation.
 *
 * `live === undefined` means "no answer", NOT "nothing is live" — the two must
 * not collapse, or an old server would wipe the user's tabs on every open.
 */
export function restoreTabsAfterBootIn(
  store: SessionTabStoreApi,
  live: readonly string[] | undefined,
  options: RestoreOpenTabsOptions = {},
): string[] {
  if (live === undefined) {
    // Old server / page that never connects: the designed unfiltered fallback.
    // It only promotes — a boot frame that arrives later still reconciles.
    if (bootRestoreDone) return [];
    bootRestoreDone = true;
    return restoreOpenTabsOnBootIn(store, options);
  }

  // Later frames fall straight through: the strip was already reconciled once,
  // and re-running the picker must never yank the user off the tab they read.
  if (bootFrameReconciled) return [];

  const alive = new Set(live.filter((id) => typeof id === 'string' && id.length > 0));
  const stale = store.getState().openTabIds.filter((id) => !alive.has(id));
  bootFrameReconciled = true;

  if (!bootRestoreDone) {
    // Frame-first (the normal path): prune stale slots BEFORE promotion, then
    // promote what survived and offer what was dropped.
    bootRestoreDone = true;
    pruneTabsToLiveSessionsIn(store, live);
    const restored = restoreOpenTabsOnBootIn(store, options);
    // Offered, not resumed. A session the runtime does not hold costs a full
    // journal read to bring back, and doing that unasked is what made a fresh
    // WebUI open on somebody else's conversation.
    if (stale.length > 0) useRestoreTabsStore.getState().offer(stale);
    return restored;
  }

  // Fallback-timer-first (slow connect): the timer promoted the strip
  // unfiltered, so it may front sessions this runtime does not hold. The late
  // frame's reconcile must not be latched away — prune the stale ids, repoint
  // the foreground off any pruned slot, and offer them (never resume unasked).
  pruneTabsToLiveSessionsIn(store, live);
  if (stale.length > 0) {
    repointForegroundAfterRelease(store.getState().openTabIds, (id) =>
      store.getState().markSeen(id),
    );
    useRestoreTabsStore.getState().offer(stale);
  }
  return [];
}

export function restoreOpenTabsOnBootIn(
  store: SessionTabStoreApi,
  options: RestoreOpenTabsOptions = {},
): string[] {
  // Doc-promise guard: once any foreground is bound, a repeat call is a
  // no-op — re-running the picker would yank the user off the tab they are
  // reading back to the boot pick.
  if (foregroundTabId()) return [];
  const now = options.now ?? Date.now();
  const pick = options.pickForeground ?? defaultPickForeground;
  const slots = store.getState().openTabIds.slice(0, MAX_OPEN_TABS);
  if (slots.length === 0) return [];

  // Every persisted slot gets its lane pair ensured and its per-session
  // chrome bound, so the user's preferences, subagent focus, file/git
  // state and queued messages for that tab are not dormant after F5.
  for (const id of slots) {
    ensureLane(id);
    ensureSessionLane(id);
    // Bind per-session overrides so a switch to a rehydrated tab shows
    // ITS autonomy/yolo/context-strategy, not whatever defaults leaked
    // from the foreground. `forgetSession` on close is the symmetric move
    // and `releaseTab` already does it; this is the other half of the
    // contract that keeps state from leaking across id reuse.
    useLocalPrefs.getState().bindSession(id);
    // Subagent focus, slash overlays, queue/process/cron panel flags and
    // confirm/fallback visibility are tab-owned; rebinding here means a
    // switch back to the tab finds ITS focus, not the one left in front.
    useUIStore.getState().bindSessionChrome(id);
    // The session catalogue's "current" marker is the row the user is
    // editing; without the rebind the tab strip would show the row as
    // resumable, which would let the user open a duplicate of it.
    useHistoryStore.getState().rebindCurrent(id);
  }

  // Pick the foreground deterministically. `activate()` does the heavy
  // lifting — URL sync, modal disposal, slash-overlay closing, history
  // rebind — exactly as if the user clicked the tab.
  const foreground = pick(slots, now) ?? slots[0];
  if (foreground) {
    activate(foreground);
    store.getState().markSeen(foreground);
    // Tell the server which tab this page came back on. Without it the runtime
    // stays wherever it was, which after a RESTART is a session that has
    // nothing to do with the restored strip: every message from the tab in
    // front is then answered with "this WebUI runtime is currently on …" and
    // the page looks alive but cannot be typed into. A focus on a session the
    // process is not holding opens it, so this doubles as the moment a
    // reloaded page reclaims its conversation.
    focusOnServer(foreground);
  }

  // Declare the open set to the server BEFORE the first React commit so
  // broadcasts for every lane reach this page on the very first message
  // after reload. `useSessionSubscription` will re-declare on the next
  // effect run; `subscribeSessions` dedupes (see `ws-client.ts`), so the
  // later effect call is a no-op.
  declareOpenTabsNow(slots);

  return slots;
}
