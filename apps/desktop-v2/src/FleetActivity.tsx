import { useEffect, useRef, useState } from 'react';
import type { EngineHttp } from './engine-http';
import { entries, record } from './engine-values';
import { MarkdownContent } from './MarkdownContent';
import { StructuredToolValue } from './ToolApprovalCard';

export function FleetActivity({ http, sessionId }: { http: EngineHttp; sessionId: string }) {
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const alive = useRef(true),
    sequence = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, []);
  const load = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const current = ++sequence.current;
    try {
      const value = record(
        await http(`/api/sessions/${encodeURIComponent(sessionId)}/events?limit=100`),
      );
      if (
        value['sessionId'] !== sessionId ||
        !Array.isArray(value['entries']) ||
        entries(value['entries']).some(
          (row) =>
            typeof row['text'] !== 'string' ||
            !['user', 'assistant', 'tool', 'system', 'error'].includes(String(row['role'])),
        )
      )
        throw Error('The engine returned unrecognized session activity.');
      if (alive.current && current === sequence.current) setSnapshot(value);
    } catch (error) {
      if (alive.current && current === sequence.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      pending.current = false;
      if (alive.current && current === sequence.current) setBusy(false);
    }
  };
  return (
    <section className="live-fleet-activity" aria-label="Recent fleet session activity">
      <header>
        <div>
          <h4>Recent session activity</h4>
          <p>
            Read-only journal view for the whole selected session, including when an agent is
            selected.
          </p>
        </div>
        <button
          type="button"
          className="button secondary small"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy
            ? 'Reading session activity…'
            : snapshot
              ? 'Refresh session activity'
              : 'Read recent session activity'}
        </button>
      </header>
      {error && (
        <p role="alert" className="session-error">
          {error}
        </p>
      )}
      {snapshot && (
        <>
          <p className="live-fleet-caption">
            Showing the most recent {entries(snapshot['entries']).length} entries ·{' '}
            {snapshot['truncated']
              ? 'The total is an upper bound for this retained window.'
              : `${Number(snapshot['total'] ?? 0).toLocaleString()} recorded entries.`}
          </p>
          <div>
            {entries(snapshot['entries']).map((entry, index) => (
              <article key={index}>
                <header>
                  <span className="eyebrow">
                    {String(entry['role'])}
                    {entry['tool'] ? ` · ${entry['tool']}` : ''}
                  </span>
                  <time>
                    {Number.isFinite(Date.parse(String(entry['ts'])))
                      ? new Date(String(entry['ts'])).toLocaleString()
                      : 'Time unavailable'}
                  </time>
                  {typeof entry['durationMs'] === 'number' && (
                    <small>{entry['durationMs'].toLocaleString()} ms</small>
                  )}
                </header>
                {entry['role'] === 'tool' || entry['role'] === 'error' ? (
                  <>
                    <p>
                      {entry['isError']
                        ? 'Reported failure'
                        : entry['tool']
                          ? 'Tool activity'
                          : 'Session error'}
                    </p>
                    {entry['input'] !== undefined && (
                      <details>
                        <summary>Tool arguments</summary>
                        <StructuredToolValue value={entry['input']} />
                      </details>
                    )}
                    {entry['output'] !== undefined ? (
                      <details>
                        <summary>Recorded output</summary>
                        {typeof entry['output'] === 'string' ? (
                          <MarkdownContent text={entry['output'].slice(0, 20000)} />
                        ) : (
                          <StructuredToolValue value={entry['output']} />
                        )}
                      </details>
                    ) : (
                      entry['input'] === undefined && (
                        <MarkdownContent text={String(entry['text']).slice(0, 20000)} />
                      )
                    )}
                  </>
                ) : (
                  <MarkdownContent text={String(entry['text']).slice(0, 20000)} />
                )}
                {(String(entry['text']).length > 20000 ||
                  (typeof entry['output'] === 'string' && entry['output'].length > 20000)) && (
                  <small>Text preview limited to 20,000 characters.</small>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
