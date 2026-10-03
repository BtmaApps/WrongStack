import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SESSION_PANEL_SECTIONS = [
  'actions',
  'workspace',
  'stats',
  'quota',
  'plan',
  'pinned',
  'bug-hunt',
  'settings',
  'history',
] as const;
export type SessionPanelSectionId = (typeof SESSION_PANEL_SECTIONS)[number];

export function normalizeSessionPanelOrder(value: unknown): SessionPanelSectionId[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((id): id is SessionPanelSectionId => SESSION_PANEL_SECTIONS.includes(id)),
        ),
      ]
    : [];
}

interface SessionPanelLayout {
  order: SessionPanelSectionId[];
  collapsed: Partial<Record<SessionPanelSectionId, boolean>>;
  setOrder: (order: SessionPanelSectionId[]) => void;
  setCollapsed: (id: SessionPanelSectionId, collapsed: boolean) => void;
}

/** Browser layout only; never sent as session/runtime preferences. */
export const useSessionPanelLayout = create<SessionPanelLayout>()(
  persist(
    (set) => ({
      order: [],
      collapsed: {},
      setOrder: (order) => set({ order: normalizeSessionPanelOrder(order) }),
      setCollapsed: (id, collapsed) =>
        set((state) => ({ collapsed: { ...state.collapsed, [id]: collapsed } })),
    }),
    {
      name: 'wrongstack-session-panel-layout',
      partialize: ({ order, collapsed }) => ({ order, collapsed }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<SessionPanelLayout> | null;
        const collapsed: SessionPanelLayout['collapsed'] = {};
        for (const id of SESSION_PANEL_SECTIONS) {
          const value = saved?.collapsed?.[id];
          if (typeof value === 'boolean') collapsed[id] = value;
        }
        return { ...current, order: normalizeSessionPanelOrder(saved?.order), collapsed };
      },
    },
  ),
);
