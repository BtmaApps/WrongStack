import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { request } from './platform';
import type { RequirementDraftSnapshot } from './requirement-draft';
import { ReviewNoteDraft } from './review-note-draft';

const drafts = new Map<string, ReviewNoteDraft>();
export async function reviewNoteKey(reportId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reportId));
  return (
    'chimera-note:' +
    [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
  );
}
export function useReviewNote(projectId: string, reportId: string) {
  const controller = useMemo(() => {
    const key = JSON.stringify([projectId, reportId]);
    let draft = drafts.get(key);
    if (!draft) {
      const formKey = reviewNoteKey(reportId);
      draft = new ReviewNoteDraft(
        {
          get: async () =>
            request<RequirementDraftSnapshot>('form-draft.get', {
              projectId,
              formKey: await formKey,
            }),
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
        reportId,
      );
      drafts.set(key, draft);
    }
    return draft;
  }, [projectId, reportId]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => {
    if (reportId) void controller.load();
  }, [controller, reportId]);
  return { state, controller };
}
