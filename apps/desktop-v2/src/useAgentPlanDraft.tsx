import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { DurableFormDraft, type FormDraftStorage } from './durable-form-draft';
import type { AgentModelPlan } from './session-agent-plan';
import { type AgentPlanDraft, agentPlanDraftCodec } from './session-agent-plan-draft';
import { sameSetting } from './settings-save-model';

const noSubscription = () => () => {};
const noSnapshot = () => null;

/**
 * Keeps an unsaved session model plan in native session storage. A draft edited from the
 * plan the engine still holds is restored; one edited from an older plan is offered for an
 * explicit choice instead. Saving the plan or discarding the edits removes it.
 */
export function useAgentPlanDraft({
  storage,
  loaded,
  base,
  plan,
  dirty,
  apply,
}: {
  storage: FormDraftStorage | undefined;
  /** The engine plan has been read, so `base` is current. */
  loaded: boolean;
  base: unknown;
  plan: AgentModelPlan | null;
  dirty: boolean;
  apply: (plan: AgentModelPlan, notice: string) => void;
}) {
  const store = useMemo(
    () => (storage ? new DurableFormDraft(storage, agentPlanDraftCodec) : null),
    [storage],
  );
  const state = useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    store?.snapshot ?? noSnapshot,
  );
  const [hydrated, setHydrated] = useState(false);
  const [stale, setStale] = useState<AgentPlanDraft | null>(null);
  useEffect(() => {
    void store?.load();
  }, [store]);
  useEffect(() => {
    if (!store || hydrated || !loaded || !state?.ready) return;
    const saved = state.value;
    if (saved && sameSetting(saved.base ?? null, base ?? null))
      apply(
        saved.plan,
        `Restored your unsaved model plan draft${state.updatedAt ? ` from ${new Date(state.updatedAt).toLocaleString()}` : ''}.`,
      );
    else if (saved) setStale(saved);
    setHydrated(true);
  }, [store, hydrated, loaded, state, base, apply]);
  useEffect(() => {
    if (!store || !hydrated || stale || !state?.ready || state.review) return;
    const next = dirty && plan ? { base: base ?? null, plan } : null;
    if (JSON.stringify(next) !== JSON.stringify(state.value)) store.edit(next);
  }, [store, hydrated, stale, state, dirty, plan, base]);
  return {
    state,
    stale,
    /** Continue the older draft over the current plan; saving it then replaces that plan. */
    continueStale: () => {
      if (!stale) return;
      setStale(null);
      apply(
        stale.plan,
        'Restored your older draft over the current session plan. Review before saving.',
      );
    },
    discardStale: () => {
      setStale(null);
      if (store?.snapshot().ready) store.edit(null);
    },
    /** Explicitly discarded edits leave native storage even though the dialog closes. */
    forget: () => {
      if (store?.snapshot().ready && !store.snapshot().review) store.edit(null);
    },
    resolve: async (choice: 'local' | 'saved') => {
      const saved = state?.review?.value;
      if (!(await store?.resolve(choice))) return;
      if (choice === 'saved' && saved)
        apply(saved.plan, 'Using the draft saved by another window.');
    },
  };
}

export function AgentPlanDraftStatus({ draft }: { draft: ReturnType<typeof useAgentPlanDraft> }) {
  const { state, stale } = draft;
  if (stale)
    return (
      <div className="agent-plan-confirm" role="alert">
        <p>
          A saved draft of this plan was edited from an older version; the session plan has changed
          since.
        </p>
        <button type="button" className="button secondary" onClick={draft.continueStale}>
          Use my older draft
        </button>
        <button type="button" className="button secondary" onClick={draft.discardStale}>
          Discard saved draft
        </button>
      </div>
    );
  if (state?.review)
    return (
      <div className="agent-plan-confirm" role="alert">
        <p>Another window saved a different unsaved draft of this plan.</p>
        <button
          type="button"
          className="button secondary"
          onClick={() => void draft.resolve('local')}
        >
          Keep this window’s plan
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => void draft.resolve('saved')}
        >
          Use saved draft
        </button>
      </div>
    );
  if (state?.error)
    return (
      <p className="session-error" role="alert">
        {state.error}
      </p>
    );
  return null;
}
