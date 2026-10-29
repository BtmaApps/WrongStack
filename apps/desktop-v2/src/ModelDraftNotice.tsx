import { useState } from 'react';
import { modelFlags, modelNumberFields, modelTextFields } from './model-catalog-editor';
import type { ModelEditorDraftStore, ModelEditorState } from './model-editor-draft';
import { tierPriceFields } from './model-price-tiers';
import './draft-conflict.css';

export function ModelDraftNotice({
  state,
  controller,
  editing,
  busy,
  onResume,
  onDiscard,
  onResolved,
}: {
  state: ReturnType<ModelEditorDraftStore['snapshot']>;
  controller: ModelEditorDraftStore;
  editing: boolean;
  busy: boolean;
  onResume: () => void;
  onDiscard: () => void;
  onResolved: () => void;
}) {
  const [working, setWorking] = useState(false);
  const resolve = async (choice: 'local' | 'saved') => {
    if (working) return;
    setWorking(true);
    try {
      if (await controller.resolve(choice)) onResolved();
    } finally {
      setWorking(false);
    }
  };
  if (!editing && state.ready && !state.value && !state.review && !state.error) return null;
  return (
    <section className="model-draft-notice" aria-label="Model draft recovery">
      <p role="status">
        {!state.ready
          ? 'Loading native model draft…'
          : state.saving
            ? 'Saving model draft on this computer…'
            : state.dirty
              ? 'Model draft has unsaved local changes.'
              : editing
                ? 'Model draft saved on this computer. Provider settings change only when you save the definition.'
                : `Saved model draft: ${state.value?.draft.text['name'] || state.value?.draft.id || 'New model'}. Continue to review it before applying.`}
      </p>
      {!state.ready && (
        <button
          type="button"
          className="button secondary small"
          onClick={() => {
            void controller.load();
          }}
        >
          Retry model draft loading
        </button>
      )}
      {!editing && state.value && !state.review && (
        <div className="model-tier-actions">
          <button
            type="button"
            className="button secondary small"
            disabled={busy || working}
            onClick={onResume}
          >
            Continue saved model draft
          </button>
          <button
            type="button"
            className="button secondary small"
            disabled={busy || working || state.saving}
            onClick={onDiscard}
          >
            Discard saved model draft
          </button>
        </div>
      )}
      {state.error && (
        <p role="alert" className="session-error">
          {state.error}
        </p>
      )}
      {state.ready && state.error && !state.review && (
        <button
          type="button"
          className="button secondary small"
          disabled={busy || working || state.saving}
          onClick={() => {
            void controller.compare();
          }}
        >
          Compare saved model draft
        </button>
      )}
      {state.review && (
        <>
          <p>
            This window and the saved draft differ. Review both before choosing; newer saved changes
            are checked again.
          </p>
          <div className="model-draft-comparison">
            <div>
              <h4>This window</h4>
              <ModelDraftSummary value={state.value} />
            </div>
            <div>
              <h4>Saved draft</h4>
              <ModelDraftSummary value={state.review.value} />
            </div>
          </div>
          <div className="model-tier-actions">
            <button
              type="button"
              className="button secondary small"
              disabled={busy || working || state.saving}
              onClick={() => {
                void resolve('saved');
              }}
            >
              Use saved model draft
            </button>
            <button
              type="button"
              className="button secondary small"
              disabled={busy || working || state.saving}
              onClick={() => {
                void resolve('local');
              }}
            >
              Keep this model draft
            </button>
          </div>
        </>
      )}
    </section>
  );
}
export function ModelDraftSummary({ value }: { value: ModelEditorState | null }) {
  if (!value) return <p>No saved editor draft.</p>;
  const draft = value.draft;
  return (
    <details>
      <summary>{draft.text['name'] || draft.id || 'New model'} · review form values</summary>
      <dl className="model-info">
        <div>
          <dt>Model ID</dt>
          <dd>{draft.id || 'Not entered'}</dd>
        </div>
        {modelTextFields.map(
          ([key, label]) =>
            draft.text[key] && (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{draft.text[key]}</dd>
              </div>
            ),
        )}
        {modelNumberFields.map(
          ([group, key, label]) =>
            draft.numbers[`${group}.${key}`] && (
              <div key={`${group}.${key}`}>
                <dt>{label}</dt>
                <dd>{draft.numbers[`${group}.${key}`]}</dd>
              </div>
            ),
        )}
        <div>
          <dt>Input modalities</dt>
          <dd>{draft.input || 'Unspecified'}</dd>
        </div>
        {modelFlags.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              {draft.flags[key] === 'inherit'
                ? 'Inherit catalog'
                : draft.flags[key] === 'true'
                  ? 'Supported'
                  : 'Not supported'}
            </dd>
          </div>
        ))}
        {(
          [
            ['Catalog status', draft.advanced.status || 'Inherit catalog'],
            ['Experimental', draft.advanced.experimental],
            ['SDK package', draft.advanced.npm || 'Inherit provider'],
            ['API endpoint', draft.advanced.api || 'Inherit provider'],
            ['Reasoning replay', `${draft.advanced.interleaved} ${draft.advanced.field}`],
            ['Can disable reasoning', draft.advanced.runtime.disableSupported ? 'Yes' : 'No'],
            ['Effort support', draft.advanced.runtime.effortSupported],
            ['Thinking retention', draft.advanced.runtime.preserveThinking],
          ] as const
        ).map(([label, text]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
        <div>
          <dt>Output modalities</dt>
          <dd>{draft.output || 'Unspecified'}</dd>
        </div>
        <div>
          <dt>Reasoning policy</dt>
          <dd>
            {draft.advanced.runtimePolicy} · {draft.advanced.runtime.default} ·{' '}
            {draft.advanced.runtime.effortLevels.join(', ') || 'No explicit efforts'}
          </dd>
        </div>
        {draft.advanced.options.map((option, index) => (
          <div key={index}>
            <dt>Reasoning control {index + 1}</dt>
            <dd>
              {option.type} · {option.values.join(', ')} {option.min} {option.max}
            </dd>
          </div>
        ))}
        {draft.pricing.rows.map((row, index) => (
          <div key={index}>
            <dt>Price tier {index + 1}</dt>
            <dd>
              {row.editable
                ? `Context threshold ${row.size || 'not entered'}`
                : 'Provider-specific metadata preserved'}
              {tierPriceFields
                .map(([key, label]) =>
                  row.prices[key] !== '' && row.prices[key] !== undefined
                    ? ` · ${label}: ${row.prices[key]}`
                    : '',
                )
                .join('')}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
