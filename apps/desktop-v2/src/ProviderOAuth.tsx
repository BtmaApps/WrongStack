import { useEffect, useRef, useState } from 'react';
import { CopyButton } from './CopyButton';
import type { EngineCommand, EngineSend } from './engine-operations';
import { entries } from './engine-values';
import { Modal } from './Modal';
import {
  acceptOAuthStatus,
  type OAuthAttempt,
  oauthActive,
  oauthAliasIssue,
  oauthUrl,
} from './oauth-model';
import { openExternal } from './platform';
import './provider-oauth.css';

export function ProviderOAuth({
  command,
  send,
  status,
}: {
  command: EngineCommand;
  send: EngineSend;
  status: Record<string, unknown> | undefined;
}) {
  const [strategies, setStrategies] = useState<Record<string, unknown>[]>([]),
    [saved, setSaved] = useState<Record<string, unknown>[]>([]);
  const [kind, setKind] = useState(''),
    [mode, setMode] = useState('default'),
    [alias, setAlias] = useState('');
  const [attempt, setAttempt] = useState<OAuthAttempt | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [review, setReview] = useState<string | null>(null),
    [paste, setPaste] = useState(false),
    [input, setInput] = useState('');
  const mounted = useRef(true),
    live = useRef<OAuthAttempt | null>(null),
    verified = useRef(''),
    operation = useRef(0);
  live.current = attempt;
  useEffect(() => {
    mounted.current = true;
    void Promise.all([
      command('auth.oauth.list', {}, ['auth.oauth.providers']),
      command('providers.saved', {}, ['providers.saved']),
    ])
      .then(([catalog, accounts]) => {
        if (!mounted.current) return;
        const values = entries(catalog['providers']);
        setStrategies(values);
        setKind(String(values[0]?.['id'] ?? ''));
        setSaved(entries(accounts['providers']));
      })
      .catch((error) => {
        if (mounted.current) setError(String(error));
      });
    return () => {
      mounted.current = false;
      const current = live.current;
      if (oauthActive(current) && current)
        void send('auth.oauth.cancel', { kind: current.kind, attemptId: current.attemptId }).catch(
          () => {},
        );
    };
  }, [command, send]);
  useEffect(() => {
    if (status) setAttempt((current) => acceptOAuthStatus(current, status));
  }, [status]);
  useEffect(() => {
    if (attempt?.phase !== 'success' || verified.current === attempt.attemptId) return;
    verified.current = attempt.attemptId;
    const id = attempt.attemptId;
    void command('providers.saved', {}, ['providers.saved'])
      .then((reply) => {
        if (!mounted.current || live.current?.attemptId !== id) return;
        const accounts = entries(reply['providers']);
        setSaved(accounts);
        const account = accounts.find((item) => item['id'] === attempt['providerId']);
        if (!account || !entries(account['apiKeys']).some((key) => key['authMethod'] === 'oauth'))
          throw Error(
            'Sign-in completed, but its saved subscription credential could not be verified. Refresh connections before retrying.',
          );
        setNotice(`Signed in and verified: ${account['id']}. Choose its model when you are ready.`);
        void send('providers.saved').catch(() => {});
      })
      .catch((error) => {
        if (mounted.current && live.current?.attemptId === id) setError(String(error));
      });
  }, [attempt, command, send]);
  const strategy = strategies.find((item) => item['id'] === kind),
    active = oauthActive(attempt);
  const target = mode === 'default' ? String(strategy?.['providerId'] ?? '') : alias.trim();
  const start = async () => {
    const account = review;
    if (!account || busy) return;
    const action = ++operation.current;
    setBusy(true);
    setReview(null);
    setError('');
    setNotice('');
    setInput('');
    setPaste(false);
    const current: OAuthAttempt = { kind, attemptId: crypto.randomUUID(), phase: 'starting' };
    live.current = current;
    setAttempt(current);
    try {
      const accounts = entries(
        (await command('providers.saved', {}, ['providers.saved']))['providers'],
      );
      const issue = oauthAliasIssue(
        account,
        accounts.map((item) => String(item['id'])),
        mode === 'new',
      );
      if (issue) throw Error(issue);
      if (!mounted.current || operation.current !== action) return;
      const reply = await command(
        'auth.oauth.start',
        { kind, providerId: account, attemptId: current.attemptId },
        ['auth.oauth.status'],
        { timeoutMs: 90000 },
      );
      if (mounted.current && operation.current === action)
        setAttempt((value) => acceptOAuthStatus(value, reply));
    } catch (error) {
      void send('auth.oauth.cancel', { kind, attemptId: current.attemptId }).catch(() => {});
      if (mounted.current && operation.current === action) {
        setAttempt({ ...current, phase: 'error' });
        setError(String(error));
      }
    } finally {
      if (mounted.current && operation.current === action) setBusy(false);
    }
  };
  const cancel = async () => {
    if (!attempt || attempt.phase === 'fetching_models') return;
    const action = ++operation.current;
    setBusy(true);
    setInput('');
    try {
      await command('auth.oauth.cancel', { kind: attempt.kind, attemptId: attempt.attemptId }, [
        'auth.oauth.status',
      ]);
      if (mounted.current && operation.current === action) {
        setAttempt({ ...attempt, phase: 'cancelled' });
        setNotice('Sign-in cancelled. Saved connections were kept.');
      }
    } catch (error) {
      if (mounted.current && operation.current === action) setError(String(error));
    } finally {
      if (mounted.current && operation.current === action) setBusy(false);
    }
  };
  const submitCode = async () => {
    if (!attempt || !input.trim() || busy) return;
    const action = ++operation.current;
    const value = input.trim();
    setInput('');
    setBusy(true);
    setError('');
    try {
      const reply = await command(
        'auth.oauth.code',
        { kind: attempt.kind, attemptId: attempt.attemptId, input: value },
        ['auth.oauth.status'],
        { timeoutMs: 90000 },
      );
      if (mounted.current && operation.current === action)
        setAttempt((current) => acceptOAuthStatus(current, reply));
    } catch (error) {
      if (mounted.current && operation.current === action) setError(String(error));
    } finally {
      if (mounted.current && operation.current === action) setBusy(false);
    }
  };
  const link = oauthUrl(attempt?.['authorizeUrl'] ?? attempt?.['verificationUri']);
  return (
    <section className="provider-oauth" aria-label="Subscription sign-in">
      <header>
        <span className="eyebrow">SUBSCRIPTION ACCOUNTS</span>
        <h3>Sign in with your account</h3>
        <p>
          Use the authentication methods supplied by the engine. Saved credentials stay in its
          encrypted vault.
        </p>
      </header>
      <div className="oauth-controls">
        <label>
          Service
          <select
            aria-label="Subscription service"
            value={kind}
            disabled={active || busy}
            onChange={(event) => {
              setKind(event.target.value);
              setAlias('');
              setError('');
            }}
          >
            {strategies.map((item) => (
              <option key={String(item['id'])} value={String(item['id'])}>
                {String(item['label'])}
              </option>
            ))}
          </select>
        </label>
        <label>
          Connection
          <select
            aria-label="Subscription connection mode"
            value={mode}
            disabled={active || busy}
            onChange={(event) => {
              setMode(event.target.value);
              setAlias('');
            }}
          >
            <option value="default">Default account</option>
            <option value="new">New named account</option>
            <option value="existing">Reconnect saved account</option>
          </select>
        </label>
        {mode === 'new' && (
          <label>
            Account name
            <input
              aria-label="Subscription account name"
              value={alias}
              maxLength={80}
              disabled={active || busy}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="work-account"
            />
          </label>
        )}
        {mode === 'existing' && (
          <label>
            Saved account
            <select
              aria-label="Saved subscription account"
              value={alias}
              disabled={active || busy}
              onChange={(event) => setAlias(event.target.value)}
            >
              <option value="">Choose an account</option>
              {saved
                .filter((item) =>
                  entries(item['apiKeys']).some((key) => key['authMethod'] === 'oauth'),
                )
                .map((item) => (
                  <option key={String(item['id'])}>{String(item['id'])}</option>
                ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="button primary"
          disabled={!strategy || active || busy}
          onClick={() => {
            const issue = oauthAliasIssue(
              target,
              saved.map((item) => String(item['id'])),
              mode === 'new',
            );
            setError(issue ?? '');
            if (!issue) setReview(target);
          }}
        >
          Start sign-in
        </button>
      </div>
      {typeof strategy?.['description'] === 'string' && (
        <p className="field-help">{strategy['description']}</p>
      )}
      {Array.isArray(strategy?.['notes']) && (
        <details>
          <summary>Service guidance</summary>
          {strategy['notes'].map((note, index) => (
            <p key={index}>{String(note)}</p>
          ))}
        </details>
      )}
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="studio-notice" role="status">
          {notice}
        </p>
      )}
      {attempt && (
        <section className="oauth-progress" aria-label="Subscription sign-in progress">
          <p role="status">
            {
              {
                starting: 'Starting sign-in…',
                awaiting_browser: 'Continue in your browser.',
                awaiting_code: 'Enter the device code on the service website.',
                exchanging: 'Completing sign-in…',
                fetching_models: 'Saving the account and loading models…',
                success: 'Sign-in completed; saved account readback requested.',
                error: 'Sign-in ended.',
                cancelled: 'Sign-in cancelled.',
              }[attempt.phase]
            }
          </p>
          {attempt.phase === 'error' && (
            <p role="alert">{String(attempt['message'] ?? 'Start sign-in again to retry.')}</p>
          )}
          {active && link && (
            <button
              type="button"
              className="button secondary"
              onClick={() => void openExternal(link).catch((error) => setError(String(error)))}
            >
              Open sign-in website
            </button>
          )}
          {active && typeof attempt['userCode'] === 'string' && (
            <div className="oauth-device-code">
              <strong>{attempt['userCode']}</strong>
              <CopyButton text={attempt['userCode']} label="Copy sign-in device code" />
            </div>
          )}
          {attempt.phase === 'awaiting_browser' && (
            <>
              <button
                type="button"
                className="button secondary"
                onClick={() => setPaste((value) => !value)}
              >
                Paste a callback URL or code
              </button>
              {paste && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitCode();
                  }}
                >
                  <label>
                    Callback URL or code
                    <input
                      type="password"
                      autoComplete="off"
                      aria-label="Sign-in callback URL or code"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                    />
                  </label>
                  <p className="field-help">
                    Used for this exchange only. It is cleared when submitted and is not saved as a
                    draft.
                  </p>
                  <button type="submit" className="button primary" disabled={busy || !input.trim()}>
                    Complete sign-in
                  </button>
                </form>
              )}
            </>
          )}
          {active && (
            <button
              type="button"
              className="button secondary"
              disabled={attempt.phase === 'fetching_models'}
              onClick={() => void cancel()}
            >
              Cancel sign-in
            </button>
          )}
        </section>
      )}
      <p className="field-help">
        Remove a saved sign-in using its credential entry below. Removing it here does not revoke
        the service’s browser session or tokens at the provider.
      </p>
      {review && (
        <Modal onClose={() => setReview(null)}>
          <h2 id="dialog-title">Review subscription sign-in</h2>
          <p>
            Save this sign-in to <strong>{review}</strong>.
          </p>
          <p>
            {saved.some((item) => item['id'] === review)
              ? 'This updates the saved connection’s subscription credential and model discovery.'
              : 'A named provider connection will be created after successful authentication.'}{' '}
            Existing runs keep their current connection.
          </p>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={() => setReview(null)}>
              Keep connections unchanged
            </button>
            <button type="button" className="button primary" onClick={() => void start()}>
              Begin reviewed sign-in
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
