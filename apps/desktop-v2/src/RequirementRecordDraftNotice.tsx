import { useState } from 'react';
import {
  hasRecordDraft,
  type RecordDraftState,
  type RequirementRecordDraft,
  type RequirementRecordDraftStore,
} from './requirement-record-draft';

function preview(draft: RequirementRecordDraft, questions: Record<string, unknown>[]) {
  const parts: string[] = [];
  if (draft.fields) {
    for (const [key, value] of Object.entries(draft.fields))
      if (value) parts.push(`${key.replace(/([A-Z])/g, ' $1')}: ${value}`);
  }
  for (const [id, answer] of Object.entries(draft.answers)) {
    const question = questions.find((item) => item['id'] === id);
    parts.push(
      `${typeof question?.['question'] === 'string' ? question['question'] : 'Saved answer'}\n${answer.text}`,
    );
  }
  return parts.join('\n\n') || 'No information or answer drafts.';
}

export function RequirementRecordDraftNotice({
  state,
  store,
  questions,
}: {
  state: RecordDraftState;
  store: RequirementRecordDraftStore | null;
  questions: Record<string, unknown>[];
}) {
  const [choice, setChoice] = useState<'saved' | 'local' | null>(null);
  if (
    !store ||
    (!hasRecordDraft(state.value) &&
      !state.error &&
      state.status !== 'loading' &&
      state.status !== 'saving')
  )
    return null;
  return (
    <section className="requirement-draft-status" aria-label="Requirement record draft storage">
      <p>
        {state.status === 'loading'
          ? 'Loading saved edit and answer drafts…'
          : state.status === 'saving'
            ? 'Saving this requirement’s edit and answer drafts…'
            : state.status === 'conflict'
              ? 'This requirement draft changed in another window. Local edits and answers are preserved.'
              : state.status === 'error'
                ? 'This requirement draft could not be saved.'
                : 'Edit and answer drafts for this requirement are saved on this device.'}
      </p>
      {state.error && (
        <p className="session-error" role="alert">
          {state.error}
        </p>
      )}
      {!state.ready && state.status === 'error' && (
        <button type="button" className="button secondary" onClick={() => void store.load()}>
          Retry loading record draft
        </button>
      )}
      {state.status === 'conflict' && (
        <button
          type="button"
          className="button secondary"
          disabled={state.resolving}
          onClick={() => {
            setChoice(null);
            void store.compare();
          }}
        >
          Compare record drafts
        </button>
      )}
      {state.review && (
        <>
          <div className="requirement-draft-comparison">
            <div>
              <h4>Local record draft</h4>
              <textarea
                aria-label="Local record draft"
                readOnly
                value={preview(state.value, questions)}
              />
            </div>
            <div>
              <h4>Saved record draft</h4>
              <textarea
                aria-label="Saved record draft"
                readOnly
                value={preview(state.review.value, questions)}
              />
            </div>
          </div>
          <p>Your choice replaces the complete edit and answer draft for this requirement.</p>
          <div className="sdd-actions">
            {choice ? (
              <>
                <button
                  type="button"
                  className="button primary"
                  disabled={state.resolving}
                  onClick={() => void store.resolve(choice).then(() => setChoice(null))}
                >
                  Confirm{' '}
                  {choice === 'saved' ? 'use saved record draft' : 'keep local record draft'}
                </button>
                <button type="button" disabled={state.resolving} onClick={() => setChoice(null)}>
                  Cancel choice
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="button secondary"
                  disabled={state.resolving}
                  onClick={() => setChoice('saved')}
                >
                  Use saved record draft
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={state.resolving}
                  onClick={() => setChoice('local')}
                >
                  Keep local record draft
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
