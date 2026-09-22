import { create } from 'zustand';
import { type GoalJournalEntry, type GoalState, parseGoalState } from '@/lib/goal';
import { getWSClient } from '@/lib/ws-client';

// ── Goal State Store (goal.json tracking / eternal goal) ──────────────────

interface GoalStateStoreState {
  goal: GoalState | null;
  missionId: string | null;
  refiningMissionId: string | null;
  setGoal: (raw: Record<string, unknown> | null) => void;
  setRefining: (missionId: string, active: boolean) => void;
  clear: () => void;
  appendJournalEntry: (entry: GoalJournalEntry) => void;
  /** Request the latest goal state from the server. Safe to call any time. */
  refresh: () => void;
}

export const useGoalStateStore = create<GoalStateStoreState>()((set) => ({
  goal: null,
  missionId: null,
  refiningMissionId: null,
  setGoal: (raw) =>
    set((state) => {
      const missionId =
        typeof raw?.missionId === 'string'
          ? raw.missionId
          : typeof raw?.setAt === 'string'
            ? raw.setAt
            : null;
      return {
        goal: parseGoalState(raw),
        missionId,
        refiningMissionId: missionId === state.missionId ? state.refiningMissionId : null,
      };
    }),
  setRefining: (missionId, active) =>
    set((state) =>
      state.missionId === missionId ? { refiningMissionId: active ? missionId : null } : state,
    ),
  clear: () => set({ goal: null, missionId: null, refiningMissionId: null }),
  appendJournalEntry: (entry) =>
    set((state) => {
      if (!state.goal) return state;
      return {
        goal: {
          ...state.goal,
          iterations: Math.max(state.goal.iterations, entry.iteration),
          lastTask: entry.task ?? state.goal.lastTask,
          lastStatus: entry.status ?? state.goal.lastStatus,
          journal: [entry, ...(state.goal.journal ?? [])].slice(0, 200),
        },
      };
    }),
  refresh: () => {
    try {
      getWSClient()?.send?.({ type: 'goal-state.get' });
    } catch {
      // WS not connected — harmless
    }
  },
}));
