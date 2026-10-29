import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { modelDraftKey } from './model-draft-key';
import { type ModelDraftSnapshot, ModelEditorDraftStore } from './model-editor-draft';
import { request } from './platform';

const stores = new Map<string, ModelEditorDraftStore>();
export function useModelEditorDraft(providerId: string, profileId: string, profileName?: string) {
  const controller = useMemo(() => {
    const owner = JSON.stringify([profileId, providerId]);
    let store = stores.get(owner);
    if (!store) {
      const key = modelDraftKey(providerId, profileId);
      store = new ModelEditorDraftStore(
        {
          get: async () => request<ModelDraftSnapshot>('profile-draft.get', { formKey: await key }),
          save: async (value, expectedRevision) =>
            (
              await request<{ revision: number }>('profile-draft.save', {
                formKey: await key,
                value,
                expectedRevision,
              })
            ).revision,
        },
        providerId,
        profileId,
        profileName,
      );
      stores.set(owner, store);
    }
    return store;
  }, [providerId, profileId, profileName]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => {
    if (providerId) void controller.load();
  }, [controller, providerId]);
  return { state, controller };
}
