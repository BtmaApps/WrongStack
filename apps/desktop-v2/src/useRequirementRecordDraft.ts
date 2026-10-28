import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ProjectFormDraftStorage } from './requirement-draft';
import {
  emptyRecordDraft,
  type RecordDraftState,
  type RequirementRecordDraft,
  RequirementRecordDraftStore,
} from './requirement-record-draft';

const emptyState: RecordDraftState = {
  value: emptyRecordDraft(''),
  ready: false,
  status: 'loading',
  error: '',
  review: null,
  resolving: false,
};
const subscribeEmpty = () => () => {};
export function useRequirementRecordDraft(
  intakeId: string,
  storageFactory?: (id: string) => ProjectFormDraftStorage<RequirementRecordDraft>,
) {
  const store = useMemo(
    () =>
      intakeId && storageFactory
        ? new RequirementRecordDraftStore(intakeId, storageFactory(intakeId))
        : null,
    [intakeId, storageFactory],
  );
  useEffect(() => {
    if (store) void store.load();
    return () => store?.invalidateRead();
  }, [store]);
  const state = useSyncExternalStore(
    store?.subscribe ?? subscribeEmpty,
    store?.snapshot ?? (() => emptyState),
    store?.snapshot ?? (() => emptyState),
  );
  return { ...state, store };
}
