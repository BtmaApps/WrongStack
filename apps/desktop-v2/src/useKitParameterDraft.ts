import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { DurableFormDraft, type FormDraftSnapshot } from './durable-form-draft';
import { type KitParameterDraft, kitParameterCodec, kitParameterKey } from './kit-parameter-draft';
import { request } from './platform';

// One controller per project kit in this window; other windows meet it through revisions.
const drafts = new Map<string, DurableFormDraft<KitParameterDraft>>();
const idle = new DurableFormDraft<KitParameterDraft>(
  {
    get: async () => ({ revision: 0, value: null }),
    save: async () => {
      throw Error('No kit is selected.');
    },
  },
  kitParameterCodec(''),
);
export function useKitParameterDraft(projectId: string, kit: string) {
  const controller = useMemo(() => {
    if (!kit) return idle;
    const owner = JSON.stringify([projectId, kit]);
    let draft = drafts.get(owner);
    if (!draft) {
      const formKey = kitParameterKey(kit);
      draft = new DurableFormDraft(
        {
          get: async () =>
            request<FormDraftSnapshot>('form-draft.get', { projectId, formKey: await formKey }),
          save: async (value, expectedRevision) =>
            (
              await request<{ revision: number }>('form-draft.save', {
                projectId,
                formKey: await formKey,
                value,
                expectedRevision,
              })
            ).revision,
        },
        kitParameterCodec(kit),
      );
      drafts.set(owner, draft);
    }
    return draft;
  }, [projectId, kit]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => {
    if (kit) void controller.load();
  }, [controller, kit]);
  return { state, controller, active: !!kit };
}
