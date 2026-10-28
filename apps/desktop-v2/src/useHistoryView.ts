import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { HistoryViewStore } from './history-view-store';
import { request } from './platform';
import type { RequirementDraftSnapshot } from './requirement-draft';

const stores = new Map<string, HistoryViewStore>();
export function useHistoryView(projectId: string) {
  const controller = useMemo(() => {
    let store = stores.get(projectId);
    if (!store) {
      const params = { projectId, formKey: 'history-view' };
      store = new HistoryViewStore({
        get: () => request<RequirementDraftSnapshot>('form-draft.get', params),
        save: async (value, expectedRevision) =>
          (
            await request<{ revision: number }>('form-draft.save', {
              ...params,
              value,
              expectedRevision,
            })
          ).revision,
      });
      stores.set(projectId, store);
    }
    return store;
  }, [projectId]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => {
    void controller.load();
  }, [controller]);
  return { state, controller };
}
