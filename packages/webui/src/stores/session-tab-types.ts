import type { StoreApi } from 'zustand';

/** State + result contracts of `useSessionTabStore` (see `session-tab-store.ts`). */

export interface OpenTabResult {
  success: boolean;
  reason: 'already_active' | 'switched' | 'opened_new_tab' | 'replaced_empty_tab' | 'tabs_full';
}

/** What the tab strip and the tab map render for one slot. */
export interface TabSummary {
  slot: number;
  sessionId: string;
  isActive: boolean;
  title: string;
  provider: string;
  model: string;
  mode: string;
  isRunning: boolean;
  messageCount: number;
  unread: number;
  queued: number;
  agentsRunning: number;
  agentsTotal: number;
  tokens: number;
  cost: number;
  contextPct: number;
  needsAttention: boolean;
}

export interface SessionTabState {
  /** Slot order. Length is always <= MAX_OPEN_TABS. */
  openTabIds: string[];
  /** Transcript length each tab had when the user last looked at it. */
  lastSeenCounts: Record<string, number>;
  /** Tabs with a tool confirmation waiting. Set by the confirm handler. */
  attention: Record<string, boolean>;

  setOpenTabIds: (ids: string[]) => void;
  openTab: (
    sessionId: string,
    options?: { resumeSession?: (id: string) => void; recycleReentry?: boolean },
  ) => OpenTabResult;
  closeTab: (sessionId: string) => void;
  /**
   * Close every open tab bound to one of `sessionIds` so the caller can ask
   * the server to delete those records (a session a connection still
   * declares is refused). Returns the subset that is safe to delete:
   * sessions without a busy tab, minus the one tab kept so the strip never
   * drops to zero.
   */
  closeTabsForSessions: (sessionIds: string[]) => string[];
  /**
   * Retire `retiredId` and hand its slot to `nextId` IN PLACE — the tab does
   * not close and no second tab opens for the newcomer. This is the client
   * half of `session.new { replaceSessionId }`: the server closes the retired
   * session and answers with a reset `session.start` whose `clearedSessionId`
   * names it, and the tab it lived in must become the new session's tab.
   */
  swapTabSession: (retiredId: string, nextId: string) => void;
  markSeen: (sessionId: string) => void;
  setAttention: (sessionId: string, needsAttention: boolean) => void;
}

/** The store surface the extracted tab helpers read and write. */
export type SessionTabStoreApi = Pick<StoreApi<SessionTabState>, 'getState' | 'setState'>;
