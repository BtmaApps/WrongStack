import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { request } from './platform';
import type { RequirementDraftSnapshot } from './requirement-draft';
import { type ReviewNote, ReviewNotesStore } from './review-notes-store';

export function useReviewNotes(projectId: string, initial: ReviewNote[]) {
  const store = useMemo(
    () =>
      new ReviewNotesStore(
        {
          get: () =>
            request<RequirementDraftSnapshot>('form-draft.get', {
              projectId,
              formKey: 'git-review-notes',
            }),
          save: (value, expectedRevision) =>
            request<{ revision: number }>('form-draft.save', {
              projectId,
              formKey: 'git-review-notes',
              value,
              expectedRevision,
            }).then((result) => result.revision),
        },
        initial,
      ),
    [projectId],
  );
  useEffect(() => {
    void store.load();
  }, [store]);
  return { ...useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot), store };
}
