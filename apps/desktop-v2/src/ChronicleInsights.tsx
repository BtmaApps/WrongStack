import { BarChart3, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { entries, record } from './engine-values';
import './chronicle-insights.css';

type View = 'providers' | 'tasks' | 'files';
const views: View[] = ['providers', 'tasks', 'files'];
const label = (value: unknown) => (typeof value === 'string' && value ? value : 'Not recorded');
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—';

/** Project-wide derived metrics, independent of the timeline query and any selected session. */
export function ChronicleInsights({
  command,
  onOpenFile,
}: {
  command: EngineCommand;
  onOpenFile: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('providers');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [refresh, setRefresh] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const id = ++generation.current;
    setRows([]);
    setBusy(true);
    setError('');
    try {
      const result = await command(
        'chronicle.metrics',
        { view, ...(view === 'providers' ? {} : { limit: 200 }) },
        ['chronicle.metrics_result', 'chronicle.error'],
        { timeoutMs: 45000 },
      );
      if (generation.current !== id) return;
      if (typeof result['message'] === 'string') throw new Error(result['message']);
      if (result['view'] !== view || !Array.isArray(result['data']))
        throw new Error('The engine returned an invalid metrics response.');
      setRows(entries(result['data']));
      setRefresh(record(result['refreshed']));
    } catch (e) {
      if (generation.current === id) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (generation.current === id) setBusy(false);
    }
  }, [command, view]);
  useEffect(() => {
    if (open) void load();
    return () => {
      generation.current++;
    };
  }, [open, load]);
  return (
    <details
      className="chronicle-insights"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <BarChart3 size={16} /> Project insights <span>Providers · tasks · files</span>
      </summary>
      {open && (
        <div className="insights-content">
          <p>
            Derived from the project journal across sessions. Timeline filters do not apply here.
          </p>
          <div className="insights-toolbar">
            <nav aria-label="Chronicle insights views">
              {views.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={view === item}
                  onClick={() => {
                    if (item !== view) {
                      setRows([]);
                      setBusy(true);
                      setView(item);
                    }
                  }}
                >
                  {item}
                </button>
              ))}
            </nav>
            <button
              type="button"
              className="button secondary small"
              onClick={() => void load()}
              disabled={busy}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {error ? (
            <p role="alert">{error}</p>
          ) : busy ? (
            <p role="status">Loading project insights…</p>
          ) : !rows.length ? (
            <p>No {view} metrics have been recorded.</p>
          ) : (
            <div className="insights-list">
              {rows.map((row, index) =>
                view === 'providers' ? (
                  <article key={index}>
                    <header>
                      <strong>
                        {label(row['providerId'])} / {label(row['modelId'])}
                      </strong>
                      <time>{label(row['day'])}</time>
                    </header>
                    <p>
                      {number(row['attempts'])} attempts · {number(row['completed'])} completed ·{' '}
                      {number(row['failed'])} failed · {number(row['retries'])} retries ·{' '}
                      {number(row['fallbacks'])} fallbacks
                    </p>
                    <small>
                      {number(row['inputTokens'])} input / {number(row['outputTokens'])} output
                      tokens · {number(row['cacheReadTokens'])} cache read /{' '}
                      {number(row['cacheWriteTokens'])} cache write · {number(row['avgDurationMs'])}{' '}
                      ms average / {number(row['maxDurationMs'])} ms maximum
                    </small>
                  </article>
                ) : view === 'tasks' ? (
                  <article key={index}>
                    <header>
                      <strong>{label(row['taskId'])}</strong>
                      <span>{label(row['status'])}</span>
                    </header>
                    <p>
                      Board {label(row['boardId'])} · Agent {label(row['agentId'])} · Session{' '}
                      {label(row['sessionId'])}
                    </p>
                    <small>
                      Run {label(row['runId'])} · {number(row['retries'])} retries ·{' '}
                      {number(row['verificationFailures'])} verification failures ·{' '}
                      {number(row['filesTouched'])} files · {number(row['durationMs'])} ms
                    </small>
                    <small>
                      Started {label(row['startedAt'])} · Ended {label(row['endedAt'])}
                    </small>
                  </article>
                ) : (
                  <article key={index}>
                    <header>
                      <strong>{label(row['path'])}</strong>
                      <span>{label(row['operation'])}</span>
                    </header>
                    <p>
                      {label(row['occurredAt'])} · {label(row['toolName'])} · {label(row['source'])}
                    </p>
                    <small>
                      Task {label(row['taskId'])} · Board {label(row['boardId'])} · Run{' '}
                      {label(row['runId'])} · Session {label(row['sessionId'])} · Agent{' '}
                      {label(row['agentId'])} · {label(row['providerId'])} / {label(row['modelId'])}
                    </small>
                    {typeof row['path'] === 'string' && row['path'] && (
                      <button type="button" onClick={() => onOpenFile(row['path'] as string)}>
                        Open project file
                      </button>
                    )}
                  </article>
                ),
              )}
            </div>
          )}
          {!busy && !error && (
            <small className="insights-footnote">
              {view === 'providers' ? 'Daily provider rows' : 'Up to 200 recent rows'} ·{' '}
              {number(refresh['sourceFiles'])} partitions read during refresh ·{' '}
              {number(refresh['invalidLines'])} invalid entries during refresh
            </small>
          )}
        </div>
      )}
    </details>
  );
}
