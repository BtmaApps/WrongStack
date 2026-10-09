import { Eye, EyeOff, LogIn, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Mutate, SavedProvider, Strategy } from './auth-panel-saved.js';

export interface CatalogProvider {
  id: string;
  name: string;
  family: string;
  apiBase?: string;
  envVars?: string[];
  modelCount?: number;
}

export type AddMode = 'key' | 'oauth' | 'custom';

/** First free alias: the base itself, else `<base>-2`, `<base>-3`… */
export function freeAlias(base: string, providers: readonly SavedProvider[]): string {
  const taken = new Set(providers.map((p) => p.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function AddProvider({
  mode,
  setMode,
  catalog,
  providers,
  strategies,
  busy,
  signInBusy,
  mutate,
  onSaved,
  onSignIn,
}: {
  mode: AddMode;
  setMode: (mode: AddMode) => void;
  catalog: CatalogProvider[];
  providers: SavedProvider[];
  strategies: Strategy[];
  busy: boolean;
  signInBusy: boolean;
  mutate: Mutate;
  onSaved: () => void;
  onSignIn: (strategy: Strategy, alias: string) => void;
}) {
  return (
    <div className="auth-add">
      <div className="auth-segmented" role="tablist" aria-label="How to connect">
        {(
          [
            ['key', 'API key'],
            ['oauth', 'Subscription'],
            ['custom', 'Local / custom'],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={mode === id ? 'active' : ''}
            onClick={() => setMode(id)}
          >
            {text}
          </button>
        ))}
      </div>
      {mode === 'key' && (
        <CatalogKeyForm
          catalog={catalog}
          providers={providers}
          busy={busy}
          mutate={mutate}
          onSaved={onSaved}
        />
      )}
      {mode === 'oauth' && (
        <SubscriptionSignIn
          strategies={strategies}
          providers={providers}
          busy={signInBusy}
          onSignIn={onSignIn}
        />
      )}
      {mode === 'custom' && <CustomProviderForm busy={busy} mutate={mutate} onSaved={onSaved} />}
    </div>
  );
}

function SecretInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <label>
      {label}
      <span className="auth-secret">
        <input
          type={reveal ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-label={reveal ? 'Hide key' : 'Show key'}
          onClick={() => setReveal((v) => !v)}
        >
          {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </span>
    </label>
  );
}

function CatalogKeyForm({
  catalog,
  providers,
  busy,
  mutate,
  onSaved,
}: {
  catalog: CatalogProvider[];
  providers: SavedProvider[];
  busy: boolean;
  mutate: Mutate;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<CatalogProvider | null>(null);
  const [alias, setAlias] = useState('');
  const [key, setKey] = useState('');
  const savedTypes = useMemo(() => new Set(providers.map((p) => p.type ?? p.id)), [providers]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? catalog.filter(
          (p) =>
            p.id.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            p.family.toLowerCase().includes(q),
        )
      : catalog;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, query]);

  if (!picked) {
    return (
      <div className="auth-catalog">
        <label className="auth-search">
          <span className="sr-only">Search providers</span>
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            placeholder={`Search ${catalog.length} providers…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {catalog.length === 0 ? (
          <p className="auth-hint">Loading the provider catalog…</p>
        ) : matches.length === 0 ? (
          <p className="auth-hint">No provider matches “{query}”. Try Local / custom.</p>
        ) : (
          <ul className="auth-catalog-list" aria-label="Provider catalog">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(p);
                    setAlias(freeAlias(p.id, providers));
                    setKey('');
                  }}
                >
                  <span className="auth-catalog-name">{p.name || p.id}</span>
                  <span className="auth-meta">
                    {p.id}
                    {p.modelCount ? ` · ${p.modelCount} models` : ''}
                  </span>
                  {savedTypes.has(p.id) && <span className="auth-badge on">Saved</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const aliasTaken = providers.some((p) => p.id === alias.trim());
  return (
    <form
      className="auth-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const saved = await mutate('provider.add', {
          id: alias.trim(),
          type: picked.id,
          family: picked.family,
          baseUrl: picked.apiBase,
          apiKey: key.trim(),
        });
        if (saved) {
          setPicked(null);
          setQuery('');
          setKey('');
          onSaved();
        }
      }}
    >
      <div className="auth-picked">
        <div>
          <strong>{picked.name || picked.id}</strong>
          <span className="auth-meta">
            {picked.family}
            {picked.apiBase ? ` · ${picked.apiBase}` : ''}
          </span>
        </div>
        <button type="button" onClick={() => setPicked(null)}>
          Change
        </button>
      </div>
      <label>
        Auth profile alias
        <input value={alias} onChange={(e) => setAlias(e.target.value)} required />
      </label>
      {aliasTaken && (
        <p className="auth-hint warn">
          “{alias.trim()}” already exists. Pick another alias, or add a key to it from Saved.
        </p>
      )}
      <SecretInput label="API key" value={key} onChange={setKey} required />
      {picked.envVars && picked.envVars.length > 0 && (
        <p className="auth-hint">
          Stored encrypted in your profile. Environment fallback: {picked.envVars.join(', ')}.
        </p>
      )}
      <button
        type="submit"
        className="primary"
        disabled={busy || !alias.trim() || aliasTaken || !key.trim()}
      >
        Save provider
      </button>
    </form>
  );
}

function SubscriptionSignIn({
  strategies,
  providers,
  busy,
  onSignIn,
}: {
  strategies: Strategy[];
  providers: SavedProvider[];
  busy: boolean;
  onSignIn: (strategy: Strategy, alias: string) => void;
}) {
  const [alias, setAlias] = useState('');
  if (strategies.length === 0) {
    return <p className="auth-hint">No subscription sign-in is available on this server.</p>;
  }
  return (
    <div className="auth-form">
      <p className="auth-hint">
        Use a ChatGPT, Claude or Copilot subscription instead of an API key. Subscription sign-in
        may be subject to your provider’s terms.
      </p>
      <label>
        Account alias (optional)
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Leave blank for a new alias"
        />
      </label>
      <ul className="auth-strategies">
        {strategies.map((strategy) => {
          const target = alias.trim() || freeAlias(strategy.providerId, providers);
          return (
            <li key={strategy.id}>
              <button type="button" disabled={busy} onClick={() => onSignIn(strategy, target)}>
                <LogIn size={14} />
                <span>Sign in with {strategy.label}</span>
              </button>
              <span className="auth-meta">Saved as {target}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CustomProviderForm({
  busy,
  mutate,
  onSaved,
}: {
  busy: boolean;
  mutate: Mutate;
  onSaved: () => void;
}) {
  const [id, setId] = useState('');
  const [family, setFamily] = useState('openai-compatible');
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:11434/v1');
  const [models, setModels] = useState('');
  const [key, setKey] = useState('');
  return (
    <form
      className="auth-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const saved = await mutate('provider.add', {
          id: id.trim(),
          family,
          baseUrl: baseUrl.trim(),
          apiKey: key.trim() || undefined,
          models: models
            .split(',')
            .map((model) => model.trim())
            .filter(Boolean),
        });
        if (saved) {
          setId('');
          setModels('');
          setKey('');
          onSaved();
        }
      }}
    >
      <p className="auth-hint">
        Ollama, LM Studio, vLLM or any OpenAI-compatible endpoint. Local servers need no key.
      </p>
      <label>
        Provider alias
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="my-local-server"
          required
        />
      </label>
      <label>
        Protocol
        <select value={family} onChange={(e) => setFamily(e.target.value)}>
          <option value="openai-compatible">OpenAI compatible</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google</option>
        </select>
      </label>
      <label>
        Base URL
        <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
      </label>
      <label>
        Model IDs (comma separated)
        <input
          value={models}
          onChange={(e) => setModels(e.target.value)}
          placeholder="llama3.2, qwen3"
        />
      </label>
      <SecretInput label="API key (optional)" value={key} onChange={setKey} />
      <button type="submit" className="primary" disabled={busy || !id.trim() || !baseUrl.trim()}>
        Save provider
      </button>
    </form>
  );
}
