import { ExternalLink, KeyRound, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type AddMode, AddProvider, type CatalogProvider } from './auth-panel-add.js';
import { type SavedProvider, SavedProviders, type Strategy } from './auth-panel-saved.js';
import { useFocusTrap } from './hooks/use-focus-trap.js';
import { onPanelActivation, onSimplePanel } from './lib/panel-events.js';
import { type SocketRequestHandle, socketRequest } from './lib/socket-request.js';
import type { SimpleSocket } from './lib/ws.js';

interface LoginState {
  kind: string;
  phase: string;
  providerId?: string;
  authorizeUrl?: string;
  verificationUri?: string;
  userCode?: string;
  bound?: boolean;
  message?: string;
}

type Status = { tone: 'info' | 'ok' | 'error'; text: string };

const PHASE_TEXT: Record<string, string> = {
  starting: 'Starting sign-in…',
  awaiting_browser: 'Finish signing in on the page that opened.',
  awaiting_code: 'Enter this code on the verification page.',
  exchanging: 'Exchanging the authorization code…',
  fetching_models: 'Saving the account and fetching its models…',
};

/** Provider credentials use the same vault-backed operations as the full WebUI. */
export function AuthPanel({ socketRef }: { socketRef: React.RefObject<SimpleSocket | null> }) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<SavedProvider[]>([]);
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [view, setView] = useState<'saved' | 'add' | null>(null);
  const [addMode, setAddMode] = useState<AddMode>('key');
  const [login, setLogin] = useState<LoginState | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const activeKind = useRef<string | null>(null);
  const requestRef = useRef<SocketRequestHandle | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  const cancelSignIn = useCallback(() => {
    if (activeKind.current)
      socketRef.current?.send('auth.oauth.cancel', { kind: activeKind.current });
    activeKind.current = null;
    setLogin(null);
    setCode('');
  }, [socketRef]);

  const close = useCallback(() => {
    requestRef.current?.cancel();
    requestRef.current = null;
    setBusy(false);
    cancelSignIn();
    setOpen(false);
    setView(null);
  }, [cancelSignIn]);

  useEffect(() => {
    const offOpen = onSimplePanel('open-auth', () => {
      setStatus(null);
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
      setStatus({ tone: 'error', text: 'Connect to the server to manage credentials.' });
      return;
    }
    const off = socket.onMessage((frame) => {
      if (frame.type === 'providers.saved')
        setProviders(
          [...(frame.payload['providers'] as SavedProvider[])].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
        );
      if (frame.type === 'provider.catalog')
        setCatalog(frame.payload['providers'] as CatalogProvider[]);
      if (frame.type === 'auth.oauth.providers')
        setStrategies(frame.payload['providers'] as Strategy[]);
      if (frame.type === 'auth.oauth.status' && frame.payload['kind'] === activeKind.current) {
        const next = frame.payload as unknown as LoginState;
        if (next.phase === 'success' || next.phase === 'error') {
          activeKind.current = null;
          setLogin(null);
          setCode('');
          setStatus({
            tone: next.phase === 'success' ? 'ok' : 'error',
            text: next.message ?? (next.phase === 'success' ? 'Signed in.' : 'Sign-in failed.'),
          });
          if (next.phase === 'success') setView('saved');
        } else {
          // Status frames omit fields an earlier phase carried (the alias, the link).
          setLogin((prev) => ({ ...prev, ...next }));
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

  /** Send one credential operation and wait for ITS result. Resolves true on success. */
  const mutate = useCallback(
    async (type: string, payload: Record<string, unknown>): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket || requestRef.current) return false;
      setBusy(true);
      setStatus({ tone: 'info', text: 'Saving…' });
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
        if (requestRef.current !== request) return false;
        requestRef.current = null;
        const ok = result?.['success'] === true;
        setStatus({
          tone: ok ? 'ok' : 'error',
          text:
            typeof result?.['message'] === 'string'
              ? result['message']
              : 'No response from the server. Try again.',
        });
        if (ok) socket.send('providers.saved');
        return ok;
      } finally {
        if (!requestRef.current) setBusy(false);
      }
    },
    [socketRef],
  );

  const startSignIn = useCallback(
    (strategy: Strategy, alias: string) => {
      if (activeKind.current) return;
      activeKind.current = strategy.id;
      setCode('');
      setStatus(null);
      setLogin({ kind: strategy.id, phase: 'starting', providerId: alias });
      socketRef.current?.send('auth.oauth.start', { kind: strategy.id, providerId: alias });
    },
    [socketRef],
  );

  if (!open) return null;
  const current = view ?? (providers.length > 0 ? 'saved' : 'add');
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
            <KeyRound size={17} /> Providers &amp; keys
          </strong>
          <button type="button" aria-label="Close provider credentials" onClick={close}>
            <X size={18} />
          </button>
        </header>
        <div className="auth-panel-body">
          <div className="auth-segmented auth-views" role="tablist" aria-label="Credentials view">
            <button
              type="button"
              role="tab"
              aria-selected={current === 'saved'}
              className={current === 'saved' ? 'active' : ''}
              onClick={() => {
                setView('saved');
                if (!busy) setStatus(null);
              }}
            >
              Saved ({providers.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={current === 'add'}
              className={current === 'add' ? 'active' : ''}
              onClick={() => {
                setView('add');
                if (!busy) setStatus(null);
              }}
            >
              Add provider
            </button>
          </div>
          <p
            role="status"
            aria-live="polite"
            className={status ? `auth-status ${status.tone}` : 'auth-status'}
          >
            {status?.text ?? ''}
          </p>
          {login && (
            <section className="auth-login" aria-label="Sign-in progress">
              <p>
                <strong>{PHASE_TEXT[login.phase] ?? login.phase.replaceAll('_', ' ')}</strong>
                {login.providerId && <span className="auth-meta"> · {login.providerId}</span>}
              </p>
              {login.userCode && <code className="auth-user-code">{login.userCode}</code>}
              {(login.authorizeUrl || login.verificationUri) && (
                <a
                  href={login.authorizeUrl ?? login.verificationUri}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open sign-in page <ExternalLink size={13} />
                </a>
              )}
              {login.phase === 'awaiting_browser' && (
                <details open={login.bound === false}>
                  <summary>
                    {login.bound === false
                      ? 'Paste the redirect URL or code here'
                      : 'Browser on another machine? Paste the redirect URL'}
                  </summary>
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
                        spellCheck={false}
                      />
                    </label>
                    <button type="submit" disabled={!code.trim()}>
                      Submit code
                    </button>
                  </form>
                </details>
              )}
              <button type="button" onClick={cancelSignIn}>
                Cancel sign-in
              </button>
            </section>
          )}
          {current === 'saved' ? (
            <SavedProviders
              providers={providers}
              strategies={strategies}
              busy={busy}
              signInBusy={login !== null}
              mutate={mutate}
              onSignIn={startSignIn}
              onAdd={() => setView('add')}
            />
          ) : (
            <AddProvider
              mode={addMode}
              setMode={setAddMode}
              catalog={catalog}
              providers={providers}
              strategies={strategies}
              busy={busy}
              signInBusy={login !== null}
              mutate={mutate}
              onSaved={() => setView('saved')}
              onSignIn={startSignIn}
            />
          )}
          <p className="auth-hint auth-foot">
            Keys are encrypted in your active profile and only ever shown masked.
          </p>
        </div>
      </div>
    </>
  );
}
