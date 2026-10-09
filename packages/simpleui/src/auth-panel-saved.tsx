import { Check, KeyRound, LogIn, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { ProviderCloudSettings } from './provider-cloud-settings.js';

export interface SavedProvider {
  id: string;
  type?: string;
  family?: string;
  baseUrl?: string;
  models?: string[];
  cloud?: import('@wrongstack/core/cloud-provider').NativeCloudSettings | undefined;
  apiKeys: { label: string; maskedKey: string; isActive: boolean }[];
}

export interface Strategy {
  id: string;
  providerId: string;
  label: string;
  description?: string;
}

export type Mutate = (type: string, payload: Record<string, unknown>) => Promise<boolean>;

/** One inline editor open at a time per card: replace a key, add a key, or confirm a delete. */
type CardEdit =
  | { kind: 'replace'; label: string }
  | { kind: 'add' }
  | { kind: 'delete-key'; label: string }
  | { kind: 'remove' }
  | { kind: 'edit' };

export function SavedProviders({
  providers,
  strategies,
  busy,
  signInBusy,
  mutate,
  onSignIn,
  onAdd,
}: {
  providers: SavedProvider[];
  strategies: Strategy[];
  busy: boolean;
  signInBusy: boolean;
  mutate: Mutate;
  onSignIn: (strategy: Strategy, alias: string) => void;
  onAdd: () => void;
}) {
  if (providers.length === 0) {
    return (
      <div className="auth-empty">
        <p>No saved providers yet.</p>
        <button type="button" className="primary" onClick={onAdd}>
          <Plus size={14} /> Add a provider
        </button>
      </div>
    );
  }
  return (
    <ul className="auth-cards" aria-label="Saved providers">
      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          strategy={strategies.find(
            (s) => s.providerId === provider.type || s.providerId === provider.id,
          )}
          busy={busy}
          signInBusy={signInBusy}
          mutate={mutate}
          onSignIn={onSignIn}
        />
      ))}
    </ul>
  );
}

function ProviderCard({
  provider,
  strategy,
  busy,
  signInBusy,
  mutate,
  onSignIn,
}: {
  provider: SavedProvider;
  strategy: Strategy | undefined;
  busy: boolean;
  signInBusy: boolean;
  mutate: Mutate;
  onSignIn: (strategy: Strategy, alias: string) => void;
}) {
  const [edit, setEdit] = useState<CardEdit | null>(null);
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [url, setUrl] = useState('');
  const [modelList, setModelList] = useState('');
  const closeEdit = () => {
    setEdit(null);
    setLabel('');
    setSecret('');
  };
  const run = async (type: string, payload: Record<string, unknown>) => {
    if (await mutate(type, payload)) closeEdit();
  };
  const type = provider.type ?? provider.id;
  const keyless = provider.apiKeys.length === 0;
  const meta = [
    type !== provider.id ? type : '',
    provider.family && provider.family !== type ? provider.family : '',
    provider.baseUrl ?? '',
  ].filter(Boolean);
  const models = provider.models ?? [];

  const saveEdit = async () => {
    const nextModels = modelList
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean);
    const nextUrl = url.trim();
    const update: Record<string, unknown> = { id: provider.id };
    if (nextUrl && nextUrl !== (provider.baseUrl ?? '')) update['baseUrl'] = nextUrl;
    if (nextModels.length > 0 && nextModels.join(',') !== models.join(','))
      update['models'] = nextModels;
    let ok = true;
    if (Object.keys(update).length > 1) ok = await mutate('provider.update', update);
    // An empty field means "no allowlist", which is a separate operation.
    if (ok && nextModels.length === 0 && models.length > 0)
      ok = await mutate('provider.clear_models', { providerId: provider.id });
    if (ok) closeEdit();
  };

  return (
    <li className="auth-card">
      <header className="auth-card-head">
        <div>
          <strong>{provider.id}</strong>
          {meta.length > 0 && <span className="auth-meta">{meta.join(' · ')}</span>}
        </div>
        <span className={keyless ? 'auth-badge warn' : 'auth-badge'}>
          {keyless
            ? 'No key'
            : `${provider.apiKeys.length} key${provider.apiKeys.length === 1 ? '' : 's'}`}
        </span>
      </header>
      {models.length > 0 && (
        <p className="auth-meta">
          Models: {models.slice(0, 6).join(', ')}
          {models.length > 6 ? ` +${models.length - 6} more` : ''}
        </p>
      )}

      {edit?.kind === 'edit' && (
        <form
          className="auth-inline"
          onSubmit={(event) => {
            event.preventDefault();
            void saveEdit();
          }}
        >
          <label>
            Base URL
            <input
              type="url"
              value={url}
              placeholder="Provider default"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label>
            Model IDs (comma separated, empty = all models)
            <input value={modelList} onChange={(e) => setModelList(e.target.value)} />
          </label>
          <InlineActions busy={busy} ready onCancel={closeEdit} />
        </form>
      )}

      {provider.apiKeys.length > 0 && (
        <ul className="auth-keys" aria-label={`Keys of ${provider.id}`}>
          {provider.apiKeys.map((key) => (
            <li key={key.label} className="auth-key-row">
              <span className="auth-key-name">
                {key.label}
                {key.isActive && <span className="auth-badge on">Active</span>}
              </span>
              <code>{key.maskedKey}</code>
              <span className="auth-row-actions">
                {!key.isActive && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run('key.set_active', { providerId: provider.id, label: key.label })
                    }
                  >
                    Use
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSecret('');
                    setEdit({ kind: 'replace', label: key.label });
                  }}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  aria-label={`Delete key ${key.label}`}
                  onClick={() => setEdit({ kind: 'delete-key', label: key.label })}
                >
                  Delete
                </button>
              </span>
              {edit?.kind === 'replace' && edit.label === key.label && (
                <form
                  className="auth-inline"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run('key.update', {
                      providerId: provider.id,
                      label: key.label,
                      apiKey: secret.trim(),
                    });
                  }}
                >
                  <label>
                    New key for “{key.label}”
                    <input
                      type="password"
                      autoComplete="off"
                      // biome-ignore lint/a11y/noAutofocus: the field is the only control the user just asked for.
                      autoFocus
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                    />
                  </label>
                  <InlineActions busy={busy} ready={!!secret.trim()} onCancel={closeEdit} />
                </form>
              )}
              {edit?.kind === 'delete-key' && edit.label === key.label && (
                <Confirm
                  text={`Delete key “${key.label}” from ${provider.id}?`}
                  busy={busy}
                  onConfirm={() =>
                    void run('key.delete', { providerId: provider.id, label: key.label })
                  }
                  onCancel={closeEdit}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {edit?.kind === 'add' && (
        <form
          className="auth-inline"
          onSubmit={(event) => {
            event.preventDefault();
            void run('key.add', {
              providerId: provider.id,
              label: label.trim(),
              apiKey: secret.trim(),
            });
          }}
        >
          <label>
            Key label
            {/* biome-ignore lint/a11y/noAutofocus: opened by the user's own click. */}
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label>
            API key
            <input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <InlineActions
            busy={busy}
            ready={!!label.trim() && !!secret.trim()}
            onCancel={closeEdit}
          />
        </form>
      )}
      {edit?.kind === 'remove' && (
        <Confirm
          text={`Remove ${provider.id} and all its saved keys?`}
          busy={busy}
          onConfirm={() => void run('provider.remove', { providerId: provider.id })}
          onCancel={closeEdit}
        />
      )}

      <ProviderCloudSettings
        type={type}
        cloud={provider.cloud}
        busy={busy}
        onSave={async (cloud) => {
          await mutate('provider.update', { id: provider.id, cloud });
        }}
      />

      <footer className="auth-card-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setUrl(provider.baseUrl ?? '');
            setModelList(models.join(', '));
            setEdit({ kind: 'edit' });
          }}
        >
          <Pencil size={13} /> Edit
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setLabel(provider.apiKeys.length === 0 ? 'default' : '');
            setSecret('');
            setEdit({ kind: 'add' });
          }}
        >
          <KeyRound size={13} /> Add key
        </button>
        {strategy && (
          <button
            type="button"
            disabled={busy || signInBusy}
            onClick={() => onSignIn(strategy, provider.id)}
          >
            <LogIn size={13} /> Sign in again
          </button>
        )}
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => setEdit({ kind: 'remove' })}
        >
          <Trash2 size={13} /> Remove provider
        </button>
      </footer>
    </li>
  );
}

function InlineActions({
  busy,
  ready,
  onCancel,
}: {
  busy: boolean;
  ready: boolean;
  onCancel: () => void;
}) {
  return (
    <span className="auth-inline-actions">
      <button type="submit" className="primary" disabled={busy || !ready}>
        <Check size={13} /> Save
      </button>
      <button type="button" disabled={busy} onClick={onCancel}>
        <X size={13} /> Cancel
      </button>
    </span>
  );
}

function Confirm({
  text,
  busy,
  onConfirm,
  onCancel,
}: {
  text: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="auth-confirm" role="alert">
      <p>{text}</p>
      <span className="auth-inline-actions">
        <button type="button" className="danger solid" disabled={busy} onClick={onConfirm}>
          Confirm deletion
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </span>
    </div>
  );
}
