import { ChevronDown, LoaderCircle, Search, Settings2, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { effortNames, sessionEffort } from './composer-model';
import type { EngineCommand, EngineSend } from './engine-operations';
import type { EngineState } from './engine-state';
import { Modal } from './Modal';
import { providerChoices, providerModels } from './provider-settings-model';

export function SessionModelControls({
  state,
  command,
  send,
  onSettings,
}: {
  state: EngineState;
  command: EngineCommand;
  send: EngineSend;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState(false),
    [provider, setProvider] = useState(''),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [supersededLeader, setSupersededLeader] = useState<unknown>(null);
  const effort = sessionEffort(state, supersededLeader === state.results['leader.effort_changed']);
  useEffect(() => {
    if (!state.connected || state.hydrating) return;
    void Promise.all([
      send('prefs.get'),
      send('provider.models', { providerId: state.provider }),
    ]).catch((e) => setError(String(e instanceof Error ? e.message : e)));
  }, [state.connected, state.hydrating, state.provider, state.model, send]);
  useEffect(() => {
    if (!open || !provider) return;
    void send('provider.models', { providerId: provider }).catch((e) => setError(String(e)));
  }, [open, provider, send]);
  const chooseEffort = async (value: string) => {
    setBusy(true);
    setError('');
    try {
      await command('prefs.update', { reasoningEffort: value }, ['key.operation_result']);
      const actual = await command('prefs.get', {}, ['prefs.updated']);
      if (actual['reasoningEffort'] !== value)
        throw Error('The session did not confirm this effort. Refresh before retrying.');
      setSupersededLeader(state.results['leader.effort_changed']);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const chooseModel = async (model: string) => {
    setBusy(true);
    setError('');
    try {
      await command('model.switch', { provider, model }, ['model.switch_result']);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const choices = providerChoices(state);
  const models = providerModels(state, provider).filter((m) =>
    `${m.id} ${m.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="session-model-controls">
      <button
        type="button"
        className="composer-chip model-selector"
        aria-label="Choose session model"
        disabled={!state.connected || busy}
        title={`${state.provider} / ${state.model} · changes apply to the next request`}
        onClick={() => {
          if (state.needsSetup) {
            onSettings();
            return;
          }
          setProvider(state.provider);
          setSearch('');
          setError('');
          setOpen(true);
          void Promise.all([send('providers.list'), send('providers.saved')]).catch((e) =>
            setError(String(e)),
          );
        }}
      >
        <span className={`status-dot ${state.connected ? 'running' : 'starting'}`} />
        <span>{state.needsSetup ? 'Connect provider' : state.model || 'Connecting…'}</span>
        <ChevronDown size={11} />
      </button>
      {!effort.hidden && (
        <label
          className="composer-chip effort-control"
          title={
            effort.reason || 'Reasoning effort for this session. Auto follows the project setting.'
          }
        >
          <Zap size={12} />
          <select
            aria-label="Session reasoning effort"
            disabled={!state.connected || busy || state.needsSetup}
            value={effort.current}
            onChange={(e) => void chooseEffort(e.target.value)}
          >
            <option value="auto">Auto effort</option>
            {effort.options.map((level) => (
              <option key={level} value={level}>
                {effortNames[level]}
              </option>
            ))}
          </select>
        </label>
      )}
      {effort.hint && (
        <small className="composer-effort-hint" title={effort.reason}>
          {effort.hint}
        </small>
      )}
      {effort.unsupported && (
        <small className="composer-effort-hint">
          Saved effort is not advertised by this model.
        </small>
      )}
      {!open && error && (
        <p className="composer-error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <Modal
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="composer-dialog">
            <header>
              <div>
                <span className="eyebrow">THIS SESSION</span>
                <h2 id="dialog-title">Choose a model</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close model picker"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <p>The current turn keeps its model. Your selection applies to the next request.</p>
            <label>
              Provider
              <select
                aria-label="Session model provider"
                value={provider}
                disabled={busy}
                onChange={(e) => setProvider(e.target.value)}
              >
                {!choices.some((p) => p.id === provider) && (
                  <option value={provider}>{provider}</option>
                )}
                {choices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.saved ? ' · saved' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="composer-model-search">
              <Search size={15} />
              <input
                aria-label="Search session models"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a model…"
              />
            </label>
            {error && (
              <p className="composer-error" role="alert">
                {error}
              </p>
            )}
            <div className="composer-model-list">
              {state.results['provider.models']?.['provider'] !== provider ? (
                <p>
                  <LoaderCircle className="spin" size={15} /> Loading model catalog…
                </p>
              ) : models.length ? (
                models.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    disabled={busy}
                    aria-pressed={provider === state.provider && m.id === state.model}
                    onClick={() => void chooseModel(m.id)}
                  >
                    <strong>{m.name}</strong>
                    <small>{m.id}</small>
                  </button>
                ))
              ) : (
                <p>No catalog models match. Manage custom models in provider settings.</p>
              )}
            </div>
            <footer>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  onSettings();
                }}
              >
                <Settings2 size={14} /> Provider settings
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </div>
  );
}
