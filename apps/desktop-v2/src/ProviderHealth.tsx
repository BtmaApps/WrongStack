import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import type { EngineState } from './engine-state';
import { entries, record } from './engine-values';
import './provider-health.css';

const words = (value: unknown) => (typeof value === 'string' ? value.replaceAll('_', ' ') : '');
export function quotaPercent(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not reported';
  if (value > 99 && value < 100) return '99%';
  return `${Math.min(100, Math.max(0, value)).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
export function mergeQuotaSnapshots(
  previous: Record<string, unknown>[],
  payload: Record<string, unknown>,
) {
  const incoming = entries(payload['snapshots']);
  if (typeof payload['providerId'] !== 'string') return incoming;
  return [...previous.filter((item) => item['providerId'] !== payload['providerId']), ...incoming];
}
function date(value: unknown, seconds = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 'Not reported';
  const parsed = new Date(value * (seconds ? 1000 : 1));
  return Number.isNaN(parsed.getTime()) ? 'Not reported' : parsed.toLocaleString();
}
export function QuotaReading({ snapshot }: { snapshot: Record<string, unknown> }) {
  const credits = record(snapshot['credits']);
  return (
    <article
      className="provider-quota-card"
      aria-label={`Quota ${snapshot['providerId']} ${snapshot['meterId']}`}
    >
      <header>
        <div>
          <span className="eyebrow">{String(snapshot['providerId'])}</span>
          <h4>{String(snapshot['meterLabel'] ?? snapshot['meterId'] ?? 'Account quota')}</h4>
        </div>
        {typeof snapshot['planLabel'] === 'string' && (
          <span className="sdd-chip">{snapshot['planLabel']}</span>
        )}
      </header>
      {snapshot['via'] !== undefined && (
        <p>
          Pool account reported through {String(snapshot['via'])}. This account is separate from the
          gateway’s combined availability.
        </p>
      )}
      {entries(snapshot['windows']).map((window) => {
        const percent = window['usedPercent'];
        const finite = typeof percent === 'number' && Number.isFinite(percent);
        const reached = snapshot['reachedWindowId'] === window['id'];
        return (
          <div
            className={`quota-window ${reached || (finite && percent >= 90) ? 'quota-attention' : ''}`}
            key={String(window['id'])}
          >
            <div>
              <strong>{String(window['label'] ?? window['id'])}</strong>
              <span>
                {quotaPercent(percent)} used{reached ? ' · Limit reached' : ''}
              </span>
            </div>
            {finite && (
              <meter
                min={0}
                max={100}
                value={Math.min(100, Math.max(0, percent))}
                aria-label={`${window['label'] ?? window['id']} quota used`}
              />
            )}
            <small>Reset: {date(window['resetsAt'], true)}</small>
            {typeof window['exhaustsAt'] === 'number' && (
              <small>
                Estimated exhaustion at current pace: {date(window['exhaustsAt'], true)}
              </small>
            )}
          </div>
        );
      })}
      {snapshot['credits'] !== undefined && (
        <p className="quota-balance">
          Balance:{' '}
          <strong>
            {credits['unlimited'] === true
              ? 'Unlimited'
              : String(
                  credits['balance'] ??
                    (credits['hasCredits'] === false
                      ? 'No available credits reported'
                      : 'Available; amount not reported'),
                )}
          </strong>
        </p>
      )}
      {typeof snapshot['note'] === 'string' && <p>{snapshot['note']}</p>}
      <small>
        Observed: {date(snapshot['capturedAt'])}. This is a recorded reading, not a live balance
        guarantee.
      </small>
    </article>
  );
}
export function ProviderHealth({ state, command }: { state: EngineState; command: EngineCommand }) {
  const [snapshots, setSnapshots] = useState<Record<string, unknown>[]>([]);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [audit, setAudit] = useState<Record<string, unknown>[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, unknown>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  const [clear, setClear] = useState<Record<string, unknown> | null>(null);
  const sequence = useRef(0);
  const busyRef = useRef(false);
  const load = useCallback(
    async (refreshAccounts = false) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setErrors([]);
      const seq = ++sequence.current;
      const results = await Promise.allSettled([
        command(
          refreshAccounts ? 'provider.quota.refresh' : 'provider.quota.get',
          {},
          ['provider.quota'],
          { timeoutMs: refreshAccounts ? 60000 : 15000 },
        ),
        command('provider.status.get', {}, ['provider.status.snapshot']),
        command('provider.audit.get', { count: 50 }, ['provider.audit.history']),
      ]);
      if (seq !== sequence.current) return;
      const issues: string[] = [];
      if (results[0].status === 'fulfilled') {
        setSnapshots(entries(results[0].value['snapshots']));
        if (refreshAccounts) setOutcomes(entries(results[0].value['refreshed']));
      } else issues.push(`Quota readings: ${String(results[0].reason)}`);
      if (results[1].status === 'fulfilled') setHealth(results[1].value);
      else issues.push('Provider health tracker is unavailable in this runtime.');
      if (results[2].status === 'fulfilled') setAudit(entries(results[2].value['lines']));
      else issues.push(`Provider audit: ${String(results[2].reason)}`);
      setErrors(issues);
      setLoaded(true);
      busyRef.current = false;
      setBusy(false);
    },
    [command],
  );
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
      busyRef.current = false;
    };
  }, [load]);
  const quotaEvent = state.results['provider.quota'];
  useEffect(() => {
    if (quotaEvent) setSnapshots((previous) => mergeQuotaSnapshots(previous, quotaEvent));
  }, [quotaEvent]);
  const statusEvent = state.results['provider.status.snapshot'];
  useEffect(() => {
    if (statusEvent && !statusEvent['error']) setHealth(statusEvent);
  }, [statusEvent]);
  const control = async (entry: Record<string, unknown>, action: 'retry' | 'clear') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    setErrors([]);
    let acknowledged = false;
    try {
      const reply = await command(
        `provider.status.${action}`,
        { providerId: entry['providerId'], model: entry['model'] },
        ['key.operation_result'],
      );
      setNotice(String(reply['message'] ?? 'Provider status action acknowledged.'));
      setClear(null);
      acknowledged = true;
    } catch (error) {
      setErrors([String(error)]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (acknowledged) await load();
  };
  const matches = (value: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .includes(filter.toLowerCase());
  const statuses = entries(health?.['statuses']);
  return (
    <section className="provider-health" aria-label="Provider health and quota">
      <header className="settings-section-heading">
        <div>
          <h2>Provider health & quota</h2>
          <p>Recorded account allowances, model cooldowns and recent provider events.</p>
        </div>
      </header>
      <div className="provider-health-toolbar">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={14} />
          Reload recorded readings
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={() => void load(true)}
        >
          Refresh account quotas
        </button>
        <label>
          Filter provider or model
          <input
            aria-label="Filter provider health"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </div>
      <p className="provider-hint">
        Account refresh reads supported providers’ account endpoints. It does not send model
        prompts. Some providers report quota only during real turns; missing readings do not mean
        unlimited access.
      </p>
      {busy && <p role="status">Reading provider diagnostics…</p>}
      {notice && (
        <p role="status" className="studio-notice">
          {notice}
        </p>
      )}
      {errors.map((error) => (
        <p className="session-error" role="alert" key={error}>
          {error}
        </p>
      ))}
      <h3>Account quota</h3>
      {loaded && !snapshots.length && (
        <p>No account quota readings have been reported in this runtime.</p>
      )}
      <div className="provider-quota-grid">
        {snapshots
          .filter((item) => matches(item['providerId']) || matches(item['meterLabel']))
          .map((snapshot) => (
            <QuotaReading
              key={`${snapshot['providerId']}:${snapshot['meterId']}`}
              snapshot={snapshot}
            />
          ))}
      </div>
      {outcomes.length > 0 && (
        <section className="quota-refresh-outcomes" aria-label="Quota refresh results">
          {outcomes.map((outcome) => (
            <p
              key={String(outcome['providerId'])}
              className={outcome['ok'] === false ? 'session-error' : ''}
            >
              {String(outcome['providerId'])}:{' '}
              {outcome['ok'] === true
                ? 'Account reading available'
                : 'Account read failed; earlier readings are retained'}
              {outcome['throttled'] === true ? ' · Recently checked; cached outcome' : ''}
            </p>
          ))}
        </section>
      )}
      <h3>Model waiting room</h3>
      {health && (
        <p>
          {String(health['blocked'] ?? 0)} blocked · {String(health['degraded'] ?? 0)} degraded ·{' '}
          {String(health['healthy'] ?? 0)} healthy
        </p>
      )}
      {loaded && health && !statuses.length && (
        <p>No model health entries have been tracked yet.</p>
      )}
      <div className="provider-health-entries">
        {statuses
          .filter((entry) => matches(entry['providerId']) || matches(entry['model']))
          .map((entry) => (
            <article key={`${entry['providerId']}:${entry['model']}`}>
              <header>
                <strong>
                  {String(entry['providerId'])} / {String(entry['model'])}
                </strong>
                <span className="sdd-chip">{words(entry['state'])}</span>
              </header>
              <p>
                {words(entry['lastErrorKind']) || 'No recorded error'}
                {entry['lastErrorStatus'] ? ` · HTTP ${entry['lastErrorStatus']}` : ''}
              </p>
              {typeof entry['lastErrorMessage'] === 'string' && <p>{entry['lastErrorMessage']}</p>}
              <p>
                {String(entry['totalFailures'] ?? 0)} failures ·{' '}
                {String(entry['consecutiveFailures'] ?? 0)} consecutive ·{' '}
                {String(entry['rateLimitHits'] ?? 0)} rate limits ·{' '}
                {String(entry['totalSuccesses'] ?? 0)} successes
              </p>
              <small>
                Last failure: {date(entry['lastFailureAt'])} · Recovery:{' '}
                {date(entry['stateExpiresAt'])}
              </small>
              <div className="sdd-actions">
                {entry['state'] === 'blocked' && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void control(entry, 'retry')}
                  >
                    Release for next probe
                  </button>
                )}
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setClear(entry)}
                >
                  Clear tracked status
                </button>
              </div>
              <details>
                <summary>Recent errors</summary>
                {entries(entry['recentErrors']).map((error, index) => (
                  <p key={index}>
                    {date(error['timestamp'])} · {words(error['kind'])} ·{' '}
                    {String(error['message'] ?? '')}
                  </p>
                ))}
              </details>
            </article>
          ))}
      </div>
      {clear && (
        <div className="provider-management-confirm">
          <p>
            Clear tracked failures for {String(clear['providerId'])} / {String(clear['model'])}?
            This resets local health history; it does not restore account quota or verify
            connectivity.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => setClear(null)}
          >
            Keep tracked status
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => void control(clear, 'clear')}
          >
            Confirm clear tracked status
          </button>
        </div>
      )}
      <details className="provider-audit">
        <summary>Recent provider events ({audit.length})</summary>
        {!audit.length && loaded && <p>No recorded provider audit events.</p>}
        {audit.map((item, index) => (
          <article key={index}>
            <strong>
              {item['from'] && item['to']
                ? `${words(item['from'])} → ${words(item['to'])}`
                : 'Provider event'}
            </strong>
            <small>{date(item['ts'])}</small>
            <p>
              {String(item['providerId'] ?? item['provider'] ?? '')} {String(item['model'] ?? '')}
            </p>
            <p>
              {item['reason'] === 'manual_clear'
                ? 'Tracking cleared'
                : item['reason'] === 'manual_retry'
                  ? 'Released for next probe'
                  : words(item['message'] ?? item['reason'])}
            </p>
            {item['error'] !== null && typeof item['error'] === 'object' && (
              <p>
                {words(record(item['error'])['kind'])} · HTTP{' '}
                {String(record(item['error'])['status'] ?? 'not reported')} ·{' '}
                {String(record(item['error'])['message'] ?? '')}
              </p>
            )}
          </article>
        ))}
      </details>
    </section>
  );
}
