import { Check, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CatalogModelSearch } from './CatalogModelSearch';
import type { EngineCommand } from './engine-operations';
import { entries, record } from './engine-values';
import { LegacyModelDraftNotice } from './LegacyModelDraftNotice';
import { Modal } from './Modal';
import { ModelAdvancedFields } from './ModelAdvancedFields';
import {
  type ModelProfileIdentity,
  useModelProfile,
  verifyModelProfile,
} from './ModelCatalogProfile';
import { ModelDraftAdministration } from './ModelDraftAdministration';
import { ModelDraftNotice } from './ModelDraftNotice';
import { ModelPriceTiers, SavedModelPriceTiers } from './ModelPriceTiers';
import { modelAdvancedDraft } from './model-advanced-editor';
import {
  buildModelDefinition,
  containsModelDefinition,
  modelDefinition,
  modelEditorDraft,
  modelFlags,
  modelNumberFields,
  modelTextFields,
  savedModelProvider,
} from './model-catalog-editor';
import type { ModelEditorState } from './model-editor-draft';
import { sameSetting } from './settings-save-model';
import { useModelEditorDraft } from './useModelEditorDraft';
import './model-catalog.css';

type Editor = ModelEditorState;
function makeEditor(id: string, initial?: Record<string, unknown>, name = ''): Editor {
  const draft = modelEditorDraft(id, initial ?? { name });
  return { originalId: id, initial, draft, baseline: draft };
}
export function ModelCatalogSettings({ command }: { command: EngineCommand }) {
  const context = useModelProfile(command);
  if (!context.profile)
    return (
      <section aria-label="Model catalog settings">
        <p role={context.error ? 'alert' : 'status'}>
          {context.error || 'Identifying the profile runtime…'}
        </p>
        {context.error && (
          <button type="button" className="button secondary" onClick={context.retry}>
            Reconnect model profile
          </button>
        )}
      </section>
    );
  return (
    <ProfileModelCatalogSettings
      key={context.profile.id}
      command={command}
      profile={context.profile}
    />
  );
}
function ProfileModelCatalogSettings({
  command,
  profile,
}: {
  command: EngineCommand;
  profile: ModelProfileIdentity;
}) {
  const [providers, setProviders] = useState<Record<string, unknown>[]>([]);
  const [providerId, setProviderId] = useState('');
  const [provider, setProvider] = useState<Record<string, unknown>>({});
  const [models, setModels] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditorValue] = useState<Editor | null>(null);
  const modelDraft = useModelEditorDraft(providerId, profile.id, profile.name);
  const setEditor = (value: Editor) => {
    modelDraft.controller.edit(value);
    setEditorValue(value);
  };
  const blockedDraft = !modelDraft.state.ready || (!editor && !!modelDraft.state.value);
  const [discard, setDiscard] = useState(false);
  const [remove, setRemove] = useState(false);
  const [registrySearch, setRegistrySearch] = useState(false);
  const sequence = useRef(0);
  const busyRef = useRef(false);
  useEffect(() => {
    let active = true;
    void command('providers.saved', {}, ['providers.saved'])
      .then((result) => {
        if (!active) return;
        const values = entries(result['providers']);
        setProviders(values);
        setProviderId((current) => current || String(values[0]?.['id'] ?? ''));
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [command]);
  const load = useCallback(async () => {
    if (!providerId) return;
    const seq = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      await verifyModelProfile(command, profile);
      const [saved, catalog] = await Promise.all([
        command('providers.saved', {}, ['providers.saved']),
        command('provider.models', { providerId, includeDisabled: true }, ['provider.models']),
      ]);
      if (seq !== sequence.current) return;
      if (catalog['provider'] !== providerId)
        throw Error('The engine returned a different provider catalog.');
      const current = savedModelProvider(saved, providerId);
      if (!current) throw Error('This provider is no longer saved.');
      setProvider(current);
      setProviders(entries(saved['providers']));
      setModels(entries(catalog['models']));
    } catch (error) {
      if (seq === sequence.current) setError(String(error));
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [command, providerId, profile]);
  useEffect(() => {
    setProvider({});
    setModels([]);
    setSelected('');
    setNotice('');
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  const providerIds = useMemo(() => providers.map((item) => String(item['id'])), [providers]);
  const definitions = record(provider['customModels']);
  const rows: Array<Record<string, unknown> & { id: string; name: string }> = [
    ...new Set([...models.map((item) => String(item['id'])), ...Object.keys(definitions)]),
  ].map((id) => {
    const descriptor = models.find((item) => item['id'] === id) ?? {};
    const definition = modelDefinition(provider, id);
    const md = record(definition?.['modelsDev']);
    return {
      ...descriptor,
      id,
      name: String(md['name'] ?? definition?.['name'] ?? descriptor['name'] ?? id),
    };
  });
  const current = rows.find((item) => item.id === selected);
  const definition = modelDefinition(provider, selected);
  const md = record(definition?.['modelsDev']);
  const caps = record(definition?.['capabilities']);
  const limit = record(md['limit']);
  const cost = record(md['cost']);
  const editorCost = record(record(editor?.initial?.['modelsDev'])['cost']);
  const advancedModel = modelAdvancedDraft(md);
  const metric = (value: unknown, price = false) =>
    typeof value === 'number'
      ? price
        ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 8 })}`
        : value.toLocaleString()
      : 'Not reported';
  const closeEditor = () => {
    if (busyRef.current) return;
    if (editor && !sameSetting(editor.draft, editor.baseline)) setDiscard(true);
    else void dismissEditor();
  };
  const dismissEditor = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await modelDraft.controller.clear();
      setEditorValue(null);
      setDiscard(false);
      setError('');
    } catch (error) {
      setError(String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const mutate = async (action: 'save' | 'remove') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await verifyModelProfile(command, profile);
      if (action === 'save') await modelDraft.controller.prepare(editor ?? undefined);
      const input =
        action === 'save' && editor
          ? buildModelDefinition(editor.draft, editor.initial ?? {})
          : null;
      const id = input?.id ?? selected;
      const expected = action === 'save' ? editor?.initial : definition;
      const saved = await command('providers.saved', {}, ['providers.saved']);
      if (!savedModelProvider(saved, providerId)) throw Error('This provider is no longer saved.');
      if (!sameSetting(modelDefinition(savedModelProvider(saved, providerId), id), expected))
        throw Error(
          'This model definition changed since it was opened. Your draft is retained. Close it and refresh before reviewing the newer definition.',
        );
      await command(
        `provider.custom_models.${action === 'save' ? 'set' : 'remove'}`,
        { providerId, modelId: id, ...(input ? { customModel: input.definition } : {}) },
        ['key.operation_result'],
      );
      const verified = savedModelProvider(
        await command('providers.saved', {}, ['providers.saved']),
        providerId,
      );
      const actualDefinition = modelDefinition(verified, id);
      if (
        action === 'save'
          ? !containsModelDefinition(actualDefinition, input!.definition)
          : actualDefinition !== undefined
      )
        throw Error(
          'The model change was acknowledged but its saved definition could not be verified. Refresh before retrying.',
        );
      if (
        action === 'save' &&
        editor?.draft.pricing.changed &&
        !sameSetting(
          record(record(actualDefinition?.['modelsDev'])['cost'])['tiers'],
          record(record(input!.definition['modelsDev'])['cost'])['tiers'],
        )
      )
        throw Error(
          'The saved price tiers did not match your reviewed changes. Your draft is retained.',
        );
      if (action === 'save') await modelDraft.controller.clear();
      setEditorValue(null);
      setRemove(false);
      setDiscard(false);
      setSelected(action === 'save' ? id : '');
      await load();
      setNotice(
        action === 'save'
          ? 'Model definition saved and verified.'
          : 'Custom model definition removed and verified.',
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="model-catalog-settings" aria-label="Model catalog settings">
      <header className="settings-section-heading">
        <div>
          <span className="eyebrow">KNOW WHAT EACH MODEL CAN DO</span>
          <h2>Model catalog</h2>
          <p>
            Inspect models and manage saved definitions for each connection. Existing runs keep
            their model.
          </p>
        </div>
      </header>
      {!providers.length && <p>Add a provider connection to manage its model catalog.</p>}
      <div className="model-catalog-toolbar">
        <label>
          Saved provider
          <select
            aria-label="Catalog provider"
            value={providerId}
            disabled={busy || !!editor || remove}
            onChange={(event) => {
              setProviderId(event.target.value);
              setQuery('');
            }}
          >
            {providers.map((item) => (
              <option key={String(item['id'])}>{String(item['id'])}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={loading || busy || !!editor || remove}
          onClick={() => {
            void command('providers.saved', {}, ['providers.saved'])
              .then((result) => {
                const values = entries(result['providers']);
                setProviders(values);
                if (!values.some((item) => item['id'] === providerId))
                  setProviderId(String(values[0]?.['id'] ?? ''));
                else void load();
              })
              .catch((error) => setError(String(error)));
          }}
        >
          <RefreshCw size={14} />
          Refresh catalog
        </button>
        <button
          type="button"
          className="button primary"
          disabled={loading || busy || !!editor || remove || !provider['id'] || blockedDraft}
          onClick={() => {
            setError('');
            setEditor(makeEditor(''));
          }}
        >
          <Plus size={14} />
          Add model definition
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={loading || busy || !!editor || remove || !provider['id'] || blockedDraft}
          onClick={() => setRegistrySearch((value) => !value)}
        >
          Find in model registry
        </button>
        <ModelDraftAdministration
          profile={profile}
          savedProviders={providerIds}
          disabled={busy || !!editor || remove}
          onOpenProvider={(id) => {
            setProviderId(id);
            setQuery('');
          }}
        />
      </div>
      {providerId && !editor && (
        <ModelDraftNotice
          state={modelDraft.state}
          controller={modelDraft.controller}
          editing={false}
          busy={busy}
          onResume={() => setEditorValue(modelDraft.state.value)}
          onResolved={() => {}}
          onDiscard={() => {
            void dismissEditor();
          }}
        />
      )}
      {providerId && !editor && (
        <LegacyModelDraftNotice
          key={providerId}
          providerId={providerId}
          profileName={profile.name}
          controller={modelDraft.controller}
          onCopied={() => {
            setEditorValue(modelDraft.controller.snapshot().value);
            setError('');
          }}
        />
      )}
      {registrySearch && (
        <CatalogModelSearch
          key={providerId}
          providerId={providerId}
          command={command}
          existing={Object.keys(definitions)}
          onClose={() => setRegistrySearch(false)}
          onSelect={(id, seed) => {
            const draft = modelEditorDraft(id, seed);
            setError('');
            setEditor({ originalId: id, initial: undefined, draft, baseline: draft });
            setRegistrySearch(false);
          }}
        />
      )}
      {error && !editor && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="studio-notice" role="status">
          <Check size={14} />
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading model metadata…</p>
      ) : (
        providerId && (
          <div className="model-catalog-layout">
            <aside className="model-catalog-list">
              <label>
                <Search size={14} />
                Search models
                <input
                  aria-label="Search provider models"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <small>
                {rows.length} models · {Object.keys(definitions).length} saved definitions
              </small>
              {rows
                .filter((item) =>
                  `${item.id} ${item.name}`.toLowerCase().includes(query.toLowerCase()),
                )
                .map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={selected === item.id}
                    disabled={busy || remove || blockedDraft}
                    onClick={() => {
                      setSelected(item.id);
                      setError('');
                    }}
                  >
                    <strong>{item.name}</strong>
                    <span>{item.id}</span>
                    <small>
                      {Object.hasOwn(definitions, item.id)
                        ? 'Saved definition'
                        : 'Provider catalog'}
                    </small>
                  </button>
                ))}
              {!rows.length && (
                <p>
                  No models reported. You can add a definition using the model ID served by this
                  endpoint.
                </p>
              )}
            </aside>
            <article className="model-catalog-detail">
              {current ? (
                <>
                  <span className="eyebrow">
                    {definition ? 'SAVED DEFINITION' : 'PROVIDER CATALOG'}
                  </span>
                  <h3>{current.name}</h3>
                  <code>{current.id}</code>
                  {typeof md['description'] === 'string' && <p>{md['description']}</p>}
                  <dl className="model-metrics">
                    {[
                      [
                        'Context tokens',
                        limit['context'] ?? caps['maxContext'] ?? current['contextWindow'],
                      ],
                      [
                        'Maximum output tokens',
                        limit['output'] ?? definition?.['maxOutput'] ?? current['maxOutput'],
                      ],
                      ['Maximum input tokens', limit['input']],
                      ['Input USD / million tokens', cost['input'] ?? current['inputCost'], true],
                      [
                        'Output USD / million tokens',
                        cost['output'] ?? current['outputCost'],
                        true,
                      ],
                      ['Cache read USD / million tokens', cost['cache_read'], true],
                    ].map(([label, value, price]) => (
                      <div key={String(label)}>
                        <dt>{String(label)}</dt>
                        <dd>{metric(value, price === true)}</dd>
                      </div>
                    ))}
                  </dl>
                  <SavedModelPriceTiers cost={cost} />
                  {definition && (
                    <details className="model-advanced-fields">
                      <summary>Saved advanced behavior</summary>
                      <dl className="model-info">
                        <div>
                          <dt>Reasoning policy</dt>
                          <dd>
                            {advancedModel.runtimePolicy === 'preserve'
                              ? 'Explicit runtime policy overrides catalog controls'
                              : 'Catalog controls'}
                          </dd>
                        </div>
                        <div>
                          <dt>Reasoning controls</dt>
                          <dd>
                            {advancedModel.options.length
                              ? advancedModel.options
                                  .map((option) =>
                                    option.type === 'effort'
                                      ? `Effort: ${option.values.join(', ') || 'provider vocabulary'}`
                                      : option.type === 'budget_tokens'
                                        ? `Token budget: ${option.min || 'provider minimum'} – ${option.max || 'provider maximum'}`
                                        : 'On / off toggle',
                                  )
                                  .join(' · ')
                              : 'Inherit catalog'}
                          </dd>
                        </div>
                        {advancedModel.runtimePolicy === 'preserve' && (
                          <>
                            <div>
                              <dt>Runtime reasoning default</dt>
                              <dd>{advancedModel.runtime.default.replaceAll('_', ' ')}</dd>
                            </div>
                            <div>
                              <dt>Disable reasoning</dt>
                              <dd>
                                {advancedModel.runtime.disableSupported
                                  ? 'Supported'
                                  : 'Not supported'}
                              </dd>
                            </div>
                            <div>
                              <dt>Runtime effort support</dt>
                              <dd>
                                {advancedModel.runtime.effortSupported === 'true'
                                  ? advancedModel.runtime.effortLevels.join(', ') ||
                                    'No levels recorded'
                                  : advancedModel.runtime.effortSupported === 'false'
                                    ? 'Not supported'
                                    : 'Undocumented; provider gates requests'}
                              </dd>
                            </div>
                            <div>
                              <dt>Thinking retention</dt>
                              <dd>{advancedModel.runtime.preserveThinking.replaceAll('_', ' ')}</dd>
                            </div>
                          </>
                        )}
                        <div>
                          <dt>Interleaved reasoning</dt>
                          <dd>
                            {advancedModel.interleaved === 'field'
                              ? `Replay ${advancedModel.field || 'provider default field'}`
                              : advancedModel.interleaved === 'inherit'
                                ? 'Inherit catalog'
                                : advancedModel.interleaved === 'true'
                                  ? 'Supported'
                                  : 'Not supported'}
                          </dd>
                        </div>
                        <div>
                          <dt>Lifecycle</dt>
                          <dd>
                            {advancedModel.status || 'Inherit catalog'}
                            {advancedModel.experimental === 'true'
                              ? ' · experimental'
                              : advancedModel.experimental === 'false'
                                ? ' · not experimental'
                                : ''}
                          </dd>
                        </div>
                        <div>
                          <dt>SDK package</dt>
                          <dd>{advancedModel.npm || 'Inherit provider'}</dd>
                        </div>
                        <div>
                          <dt>API endpoint</dt>
                          <dd>{advancedModel.api || 'Inherit provider'}</dd>
                        </div>
                        {modelNumberFields
                          .filter(
                            ([group, key]) =>
                              group === 'cost' && !['input', 'output', 'cache_read'].includes(key),
                          )
                          .map(
                            ([, key, label]) =>
                              typeof cost[key] === 'number' && (
                                <div key={key}>
                                  <dt>{label}</dt>
                                  <dd>{metric(cost[key], true)}</dd>
                                </div>
                              ),
                          )}
                      </dl>
                    </details>
                  )}
                  <h4>Capabilities</h4>
                  <div className="model-capabilities">
                    {(Array.isArray(current['capabilities']) ? current['capabilities'] : []).map(
                      (cap) => (
                        <span key={String(cap)}>{String(cap)}</span>
                      ),
                    )}
                  </div>
                  <dl className="model-info">
                    {modelFlags.map(([key, label]) => (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>
                          {typeof md[key] === 'boolean'
                            ? md[key]
                              ? 'Supported'
                              : 'Not supported'
                            : 'Not specified in this definition'}
                        </dd>
                      </div>
                    ))}
                    <div>
                      <dt>Reasoning effort levels</dt>
                      <dd>
                        {Array.isArray(current['reasoningEffortLevels'])
                          ? current['reasoningEffortLevels'].join(', ')
                          : current['effortSupported'] === false
                            ? 'Not supported'
                            : 'Not reported'}
                      </dd>
                    </div>
                    {['input', 'output'].map((direction) => (
                      <div key={direction}>
                        <dt>{direction === 'input' ? 'Input modalities' : 'Output modalities'}</dt>
                        <dd>
                          {Array.isArray(record(md['modalities'])[direction])
                            ? (record(md['modalities'])[direction] as string[]).join(', ')
                            : 'Not reported'}
                        </dd>
                      </div>
                    ))}
                    {modelTextFields.slice(2).map(([key, label]) => (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>
                          {String(
                            md[key] ??
                              current[key === 'release_date' ? 'releaseDate' : key] ??
                              'Not reported',
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="sdd-actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || remove || blockedDraft}
                      onClick={() => {
                        setError('');
                        setEditor(makeEditor(selected, definition, current.name));
                      }}
                    >
                      Edit model definition
                    </button>
                    {definition && (
                      <button
                        type="button"
                        className="button secondary danger"
                        disabled={busy}
                        onClick={() => setRemove(true)}
                      >
                        Remove custom definition
                      </button>
                    )}
                  </div>
                  {remove && (
                    <div className="model-remove-confirm">
                      <p>
                        Remove the saved definition for <strong>{selected}</strong>? The engine also
                        removes this ID from the provider’s saved model list. Built-in catalog
                        metadata may still be available. Running sessions are not switched.
                      </p>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={() => setRemove(false)}
                      >
                        Keep definition
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={busy}
                        onClick={() => void mutate('remove')}
                      >
                        Confirm remove definition
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p>
                  Select a model to inspect its limits, pricing, capabilities and saved overrides.
                </p>
              )}
            </article>
          </div>
        )
      )}
      {editor && (
        <Modal onClose={closeEditor}>
          <header>
            <div>
              <span className="eyebrow">
                {profile.name} · {providerId}
              </span>
              <h2 id="dialog-title">
                {editor.draft.id ? 'Model definition' : 'Add model definition'}
              </h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close model editor"
              disabled={busy}
              onClick={closeEditor}
            >
              <X size={16} />
            </button>
          </header>
          <form
            className="model-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate('save');
            }}
          >
            <p>
              Blank optional values inherit catalog defaults. Additional saved schema fields are
              preserved.
            </p>
            <ModelDraftNotice
              state={modelDraft.state}
              controller={modelDraft.controller}
              editing
              busy={busy}
              onResume={() => {}}
              onDiscard={() => {
                void dismissEditor();
              }}
              onResolved={() => setEditorValue(modelDraft.controller.snapshot().value)}
            />
            <fieldset disabled={busy}>
              <label>
                Model ID
                <input
                  aria-label="Model definition ID"
                  required
                  value={editor.draft.id}
                  disabled={!!editor.originalId}
                  onChange={(event) =>
                    setEditor({ ...editor, draft: { ...editor.draft, id: event.target.value } })
                  }
                />
              </label>
              <div className="model-editor-grid">
                {modelTextFields.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      aria-label={`Model ${label.toLowerCase()}`}
                      required={key === 'name'}
                      value={editor.draft.text[key] ?? ''}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          draft: {
                            ...editor.draft,
                            text: { ...editor.draft.text, [key]: event.target.value },
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <h3>Limits and pricing</h3>
              <div className="model-editor-grid">
                {modelNumberFields.map(([group, key, label]) => (
                  <label key={`${group}.${key}`}>
                    {label}
                    <input
                      aria-label={label}
                      type="number"
                      min={0}
                      step={group === 'limit' ? 1 : 'any'}
                      disabled={
                        group === 'cost' && !!editorCost[key] && typeof editorCost[key] === 'object'
                      }
                      placeholder={
                        group === 'cost' && typeof editorCost[key] === 'object'
                          ? 'Structured schedule preserved below'
                          : undefined
                      }
                      value={editor.draft.numbers[`${group}.${key}`] ?? ''}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          draft: {
                            ...editor.draft,
                            numbers: {
                              ...editor.draft.numbers,
                              [`${group}.${key}`]: event.target.value,
                            },
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <ModelPriceTiers
                value={editor.draft.pricing}
                legacySchedule={editorCost['context_over_200k']}
                onChange={(pricing) =>
                  setEditor({ ...editor, draft: { ...editor.draft, pricing } })
                }
              />
              <h3>Capabilities</h3>
              <div className="model-editor-grid">
                {modelFlags.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <select
                      aria-label={`Model ${label.toLowerCase()}`}
                      value={editor.draft.flags[key]}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          draft: {
                            ...editor.draft,
                            flags: { ...editor.draft.flags, [key]: event.target.value },
                          },
                        })
                      }
                    >
                      <option value="inherit">Inherit / unspecified</option>
                      <option value="true">Supported</option>
                      <option value="false">Not supported</option>
                    </select>
                  </label>
                ))}
              </div>
              <h3>Modalities</h3>
              <p>Comma-separated values, for example text, image, audio, video, pdf.</p>
              <div className="model-editor-grid">
                {(['input', 'output'] as const).map((key) => (
                  <label key={key}>
                    {key === 'input' ? 'Input modalities' : 'Output modalities'}
                    <input
                      aria-label={`Model ${key} modalities`}
                      value={editor.draft[key]}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          draft: { ...editor.draft, [key]: event.target.value },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <ModelAdvancedFields
                value={editor.draft.advanced}
                onChange={(advanced) =>
                  setEditor({ ...editor, draft: { ...editor.draft, advanced } })
                }
              />
            </fieldset>
            {error && (
              <p className="session-error" role="alert">
                {error}
              </p>
            )}
            {discard ? (
              <div>
                <p>Discard this unsaved model definition?</p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setDiscard(false)}
                >
                  Keep editing model
                </button>
                <button
                  type="button"
                  className="button secondary danger"
                  disabled={busy}
                  onClick={() => {
                    void dismissEditor();
                  }}
                >
                  Discard model draft
                </button>
              </div>
            ) : (
              <footer>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={closeEditor}
                >
                  Cancel model editing
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={
                    busy ||
                    !modelDraft.state.ready ||
                    !!modelDraft.state.review ||
                    !!modelDraft.state.error
                  }
                >
                  {busy ? 'Saving…' : 'Save model definition'}
                </button>
              </footer>
            )}
          </form>
        </Modal>
      )}
    </section>
  );
}
