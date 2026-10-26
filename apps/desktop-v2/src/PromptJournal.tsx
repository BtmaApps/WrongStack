import { ChevronDown, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { entries, record } from './engine-values';
import { MarkdownContent } from './MarkdownContent';

export function PromptJournal({
  command,
  sessionId,
  onInsert,
}: {
  command: EngineCommand;
  sessionId: string;
  onInsert?: ((text: string) => void) | undefined;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [scope, setScope] = useState(sessionId ? 'session' : 'project'),
    [category, setCategory] = useState(''),
    [date, setDate] = useState(''),
    [query, setQuery] = useState(''),
    [limit, setLimit] = useState(100),
    [loading, setLoading] = useState(true),
    [enabled, setEnabled] = useState(true),
    [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const own = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        (category ? [category] : ['raw_user', 'refined_user']).map((kind) =>
          command(
            'prompts.journal',
            {
              filter: {
                limit,
                category: kind,
                ...(scope === 'session' && sessionId ? { sessionId } : {}),
                ...(date ? { date } : {}),
              },
            },
            ['prompts.journal'],
          ),
        ),
      );
      if (own !== generation.current) return;
      setRows(
        results
          .flatMap((result) => entries(result['entries']))
          .filter((row) => row['category'] === 'raw_user' || row['category'] === 'refined_user')
          .sort((a, b) => String(b['timestamp']).localeCompare(String(a['timestamp']))),
      );
      setEnabled(results.some((result) => result['enabled'] !== false));
    } catch (e) {
      if (own === generation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (own === generation.current) setLoading(false);
    }
  }, [command, sessionId, scope, category, date, limit]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const filtered = rows.filter((row) =>
    `${row['content']} ${row['rawContent'] ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <p>
        The project’s actual submitted prompts and refined copies. Internal system/delegation
        entries are excluded. Reuse appends to your draft.
      </p>
      <div className="resource-toolbar">
        <label>
          <Search size={14} />
          <input
            aria-label="Search prompt journal"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search loaded prompts…"
          />
        </label>
        <select aria-label="Journal scope" value={scope} onChange={(e) => setScope(e.target.value)}>
          {sessionId && <option value="session">This session</option>}
          <option value="project">All project sessions</option>
        </select>
        <select
          aria-label="Journal category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Original & refined</option>
          <option value="raw_user">Original input</option>
          <option value="refined_user">Refined prompt</option>
        </select>
        <input
          type="date"
          aria-label="Journal date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh prompt journal"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {error && (
        <p role="alert" className="composer-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Reading prompt journal…</p>
      ) : !enabled || !filtered.length ? (
        <div className="resource-empty">
          <h3>No matching prompts yet.</h3>
          <p>
            Recorded user prompts appear here after work is submitted. Broaden the session/date
            filters to explore this project.
          </p>
        </div>
      ) : (
        <section className="prompt-journal-list" aria-label="Project prompt journal">
          {filtered.map((row) => {
            const meta = record(row['metadata']);
            return (
              <details key={String(row['id'])}>
                <summary>
                  <div>
                    <strong>
                      {String(row['content'])
                        .split('\n')
                        .find((line) => line.trim())
                        ?.slice(0, 160) || 'Untitled prompt'}
                    </strong>
                    <small>
                      {String(row['category']) === 'raw_user' ? 'Original input' : 'Refined prompt'}{' '}
                      · {new Date(String(row['timestamp'])).toLocaleString()} ·{' '}
                      {String(meta['provider'] ?? '')} {String(meta['model'] ?? '')}
                    </small>
                  </div>
                  <ChevronDown size={15} />
                </summary>
                <div className="journal-entry-body">
                  <small>Session: {String(row['sessionId'])}</small>
                  {typeof row['rawContent'] === 'string' && (
                    <section>
                      <h4>Original text</h4>
                      <MarkdownContent text={row['rawContent']} />
                      <button
                        type="button"
                        className="button secondary"
                        disabled={!onInsert}
                        onClick={() => onInsert?.(String(row['rawContent']))}
                      >
                        Reuse original text
                      </button>
                    </section>
                  )}
                  <section>
                    <h4>{row['category'] === 'raw_user' ? 'Submitted text' : 'Refined text'}</h4>
                    <MarkdownContent text={String(row['content'])} />
                  </section>
                  <footer>
                    <span>
                      {typeof meta['tokenEstimate'] === 'number'
                        ? `~${meta['tokenEstimate'].toLocaleString()} estimated tokens`
                        : ''}
                    </span>
                    <button
                      type="button"
                      className="button primary"
                      disabled={!onInsert}
                      onClick={() => onInsert?.(String(row['content']))}
                    >
                      Reuse in draft
                    </button>
                  </footer>
                </div>
              </details>
            );
          })}
        </section>
      )}
      <footer className="journal-limit">
        <small>{filtered.length} visible · searching within the loaded window</small>
        <button
          type="button"
          className="button secondary"
          disabled={loading || limit >= 1000}
          onClick={() => setLimit((value) => Math.min(1000, value + 100))}
        >
          Load a larger window
        </button>
      </footer>
    </>
  );
}
