import { KeyRound, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusTrap } from './hooks/use-focus-trap.js';
import { onPanelActivation, onSimplePanel } from './lib/panel-events.js';
import { type SocketRequestHandle, socketRequest } from './lib/socket-request.js';
import type { SimpleSocket } from './lib/ws.js';

interface SavedProvider {
  id: string;
  type?: string;
  apiKeys: { label: string; maskedKey: string; isActive: boolean }[];
}
interface Strategy {
  id: string;
  providerId: string;
  label: string;
}
interface LoginState {
  kind: string;
  phase: string;
  authorizeUrl?: string;
  verificationUri?: string;
  userCode?: string;
  message?: string;
}

/** Provider credentials use the same vault-backed operations as the full WebUI. */
export function AuthPanel({ socketRef }: { socketRef: React.RefObject<SimpleSocket | null> }) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<SavedProvider[]>([]);
  const [catalog, setCatalog] = useState<
    { id: string; name: string; family: string; apiBase?: string }[]
  >([]);
  const [accountType, setAccountType] = useState('openai');
  const [accountAlias, setAccountAlias] = useState('');
  const [accountKey, setAccountKey] = useState('');
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [providerId, setProviderId] = useState('');
  const [label, setLabel] = useState('default');
  const [apiKey, setApiKey] = useState('');
  const [customId, setCustomId] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:11434/v1');
  const [family, setFamily] = useState('openai-compatible');
  const [models, setModels] = useState('');
  const [alias, setAlias] = useState('');
  const [code, setCode] = useState('');
  const [login, setLogin] = useState<LoginState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<{
    type: string;
    payload: Record<string, unknown>;
    text: string;
  } | null>(null);
  const activeKind = useRef<string | null>(null);
  const requestRef = useRef<SocketRequestHandle | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);
  const close = useCallback(() => {
    requestRef.current?.cancel();
    requestRef.current = null;
    setBusy(false);
    if (activeKind.current)
      socketRef.current?.send('auth.oauth.cancel', { kind: activeKind.current });
    activeKind.current = null;
    setOpen(false);
    setApiKey('');
    setCustomApiKey('');
    setAccountKey('');
    setCode('');
    setLogin(null);
    setConfirm(null);
  }, [socketRef]);

  useEffect(() => {
    const offOpen = onSimplePanel('open-auth', () => {
      setMessage('');
      setOpen(true);
    });
    const offPanel = onPanelActivation((panel) => {
      if (panel !== 'open-auth') close();
    });
    return () => {
      offOpen();
      offPanel();
    };
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const socket = socketRef.current;
    if (!socket) {
      setMessage('Connect to the server to manage credentials.');
      return;
    }
    const off = socket.onMessage((frame) => {
      if (frame.type === 'providers.saved')
        setProviders(frame.payload['providers'] as SavedProvider[]);
      if (frame.type === 'provider.catalog')
        setCatalog(frame.payload['providers'] as typeof catalog);
      if (frame.type === 'auth.oauth.providers')
        setStrategies(frame.payload['providers'] as Strategy[]);
      if (frame.type === 'auth.oauth.status' && frame.payload['kind'] === activeKind.current) {
        const next = frame.payload as unknown as LoginState;
        setLogin(next);
        if (next.phase === 'success' || next.phase === 'error') {
          activeKind.current = null;
          setMessage(next.message ?? next.phase);
          setCode('');
        }
      }
    });
    socket.send('providers.saved');
    socket.send('providers.list');
    socket.send('auth.oauth.list');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      requestRef.current?.cancel();
      requestRef.current = null;
      off();
      document.removeEventListener('keydown', onKey);
      if (activeKind.current) socket.send('auth.oauth.cancel', { kind: activeKind.current });
      activeKind.current = null;
    };
  }, [open, socketRef, close]);

  const mutate = async (type: string, payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || requestRef.current) return;
    setBusy(true);
    setMessage('Saving…');
    try {
      const requestId = crypto.randomUUID();
      const request = socketRequest({
        socket,
        sendType: type,
        payload: { ...payload, requestId },
        expectType: 'key.operation_result',
        accept: (frame) =>
          (frame.payload as Record<string, unknown> | undefined)?.['requestId'] === requestId,
      });
      requestRef.current = request;
      const result = await request.promise;
      if (requestRef.current !== request) return;
      requestRef.current = null;
      setMessage(
        typeof result?.['message'] === 'string'
          ? result['message']
          : 'No response from the server. Try again.',
      );
      if (result?.['success'] === true) {
        setApiKey('');
        setCustomApiKey('');
        setAccountKey('');
        setConfirm(null);
        socket.send('providers.saved');
      }
    } finally {
      if (!requestRef.current) setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <>
      <button
        type="button"
        className="settings-overlay"
        aria-label="Close provider credentials"
        onClick={close}
      />
      <div
        className="settings-panel auth-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="simple-auth-title"
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="settings-head">
          <strong id="simple-auth-title">
            <KeyRound size={17} /> Provider credentials
          </strong>
          <button type="button" aria-label="Close provider credentials" onClick={close}>
            <X size={18} />
          </button>
        </header>
        <div className="auth-panel-body">
          <p>API keys are encrypted in your active profile. Saved keys are shown masked.</p>
          <p role="status" aria-live="polite">
            {message}
          </p>
          <section aria-label="Auth profiles">
            <h3>Add account / auth profile</h3>
            <p>
              Each account has its own alias and credential. Select alias/model in a fallback chain.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const alias = accountAlias.trim();
                if (providers.some((profile) => profile.id === alias)) {
                  setMessage(`Auth profile “${alias}” already exists. Choose another alias.`);
                  return;
                }
                const type = accountType.trim();
                const source = catalog.find((provider) => provider.id === type);
                if (!source) {
                  setMessage(
                    'Choose a provider from the catalog, or use the custom provider form.',
                  );
                  return;
                }
                void mutate('provider.add', {
                  id: alias,
                  type,
                  family: source.family,
                  baseUrl: source.apiBase,
                  apiKey: accountKey.trim(),
                });
              }}
            >
              <label>
                Provider type
                <input
                  list="simple-auth-provider-types"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  required
                />
              </label>
              <datalist id="simple-auth-provider-types">
                {catalog.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </datalist>
              <label>
                Auth profile alias
                <input
                  value={accountAlias}
                  onChange={(e) => setAccountAlias(e.target.value)}
                  placeholder="openai-work"
                  required
                />
              </label>
              <label>
                Account API key
                <input
                  type="password"
                  autoComplete="off"
                  value={accountKey}
                  onChange={(e) => setAccountKey(e.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                className="primary"
                disabled={busy || !accountType.trim() || !accountAlias.trim() || !accountKey.trim()}
              >
                Save auth profile
              </button>
            </form>
          </section>
          <section aria-label="API key management">
            <h3>Add or update an API key</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void mutate('key.add', {
                  providerId: providerId.trim(),
                  label: label.trim(),
                  apiKey: apiKey.trim(),
                });
              }}
            >
              <label>
                Provider or saved alias
                <input
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  placeholder="openai, anthropic, openrouter…"
                  required
                />
              </label>
              <label>
                Key label
                <input value={label} onChange={(e) => setLabel(e.target.value)} required />
              </label>
              <label>
                API key
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                className="primary"
                disabled={busy || !providerId.trim() || !label.trim() || !apiKey.trim()}
              >
                Save key
              </button>
            </form>
          </section>
          <section aria-label="OAuth accounts">
            <h3>Sign in with your account</h3>
            <p>Subscription sign-in may be subject to your provider’s terms.</p>
            <label>
              Account alias (optional)
              <input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Leave blank to create a new account alias"
              />
            </label>
            {strategies.map((strategy) => (
              <button
                type="button"
                key={strategy.id}
                disabled={Boolean(activeKind.current)}
                onClick={() => {
                  activeKind.current = strategy.id;
                  setCode('');
                  setLogin({ kind: strategy.id, phase: 'Starting sign-in…' });
                  let target = alias.trim() || strategy.providerId;
                  if (!alias.trim())
                    for (let n = 2; providers.some((profile) => profile.id === target); n++)
                      target = `${strategy.providerId}-${n}`;
                  socketRef.current?.send('auth.oauth.start', {
                    kind: strategy.id,
                    providerId: target,
                  });
                }}
              >
                Sign in with {strategy.label}
              </button>
            ))}
            {login && (
              <div>
                <p>{login.phase.replaceAll('_', ' ')}</p>
                {(login.authorizeUrl || login.verificationUri) && (
                  <a
                    href={login.authorizeUrl ?? login.verificationUri}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open sign-in page
                  </a>
                )}
                {login.userCode && (
                  <p>
                    Enter code: <strong>{login.userCode}</strong>
                  </p>
                )}
                {activeKind.current && (
                  <>
                    {!login.userCode && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          socketRef.current?.send('auth.oauth.code', {
                            kind: login.kind,
                            input: code.trim(),
                          });
                        }}
                      >
                        <label>
                          Redirect URL or authorization code
                          <input
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            autoComplete="off"
                          />
                        </label>
                        <button type="submit" disabled={!code.trim()}>
                          Submit code
                        </button>
                      </form>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        socketRef.current?.send('auth.oauth.cancel', { kind: login.kind });
                        activeKind.current = null;
                        setLogin(null);
                        setCode('');
                      }}
                    >
                      Cancel sign-in
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
          <section aria-label="Local and custom providers">
            <details>
              <summary>Add a local server or custom provider</summary>
              <p>
                Use a separate alias for each endpoint. Local servers can be saved without an API
                key.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate('provider.add', {
                    id: customId.trim(),
                    family,
                    baseUrl: baseUrl.trim(),
                    apiKey: customApiKey.trim() || undefined,
                    models: models
                      .split(',')
                      .map((model) => model.trim())
                      .filter(Boolean),
                  });
                }}
              >
                <label>
                  Provider alias
                  <input
                    value={customId}
                    onChange={(e) => setCustomId(e.target.value)}
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
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Model IDs (comma separated)
                  <input
                    value={models}
                    onChange={(e) => setModels(e.target.value)}
                    placeholder="llama3.2, qwen3"
                  />
                </label>
                <label>
                  API key (optional)
                  <input
                    type="password"
                    autoComplete="off"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="primary"
                  disabled={busy || !customId.trim() || !baseUrl.trim()}
                >
                  Save provider
                </button>
              </form>
            </details>
          </section>
          <section aria-label="Saved providers">
            <h3>Saved providers</h3>
            {providers.length === 0 && <p>No saved providers yet.</p>}
            {providers.map((provider) => (
              <article key={provider.id}>
                <h4>{provider.id}</h4>
                <button type="button" onClick={() => setAlias(provider.id)}>
                  Use this alias for sign-in
                </button>
                {provider.apiKeys.map((key) => (
                  <div className="auth-key-row" key={key.label}>
                    <span>
                      {key.label} · {key.maskedKey}
                      {key.isActive ? ' · Active' : ''}
                    </span>
                    <button
                      type="button"
                      disabled={busy || key.isActive}
                      onClick={() =>
                        void mutate('key.set_active', { providerId: provider.id, label: key.label })
                      }
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setProviderId(provider.id);
                        setLabel(key.label);
                        setApiKey('');
                      }}
                    >
                      Update
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          type: 'key.delete',
                          payload: { providerId: provider.id, label: key.label },
                          text: `Delete key “${key.label}” from ${provider.id}?`,
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      type: 'provider.remove',
                      payload: { providerId: provider.id },
                      text: `Remove ${provider.id} and all its saved keys?`,
                    })
                  }
                >
                  Remove provider
                </button>
              </article>
            ))}
          </section>
          {confirm && (
            <div role="alert">
              <p>{confirm.text}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void mutate(confirm.type, confirm.payload)}
              >
                Confirm deletion
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
