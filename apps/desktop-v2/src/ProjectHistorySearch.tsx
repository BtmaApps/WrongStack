import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { entries, record } from './engine-values';
import './project-history-search.css';

export interface HistorySearchSelection {
  id: string;
  query: string;
  role: string;
  revision: string;
  messageIndex: number;
}
type Row = Record<string, unknown>;
export function ProjectHistorySearch({
  command,
  onSelect,
}: {
  command: EngineCommand;
  onSelect: (selection: HistorySearchSelection, summary: Row) => void;
}) {
  const [query, setQuery] = useState(''),
    [role, setRole] = useState('');
  const [results, setResults] = useState<Row[]>([]),
    [errors, setErrors] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const [progress, setProgress] = useState({ scanned: 0, total: 0 });
  const [applied, setApplied] = useState({ query: '', role: '' });
  const generation = useRef(0),
    pending = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  const search = async () => {
    if (pending.current) return;
    const text = query.trim();
    if (text.length < 2) {
      setError('Enter at least two characters.');
      return;
    }
    const version = ++generation.current;
    pending.current = true;
    setBusy(true);
    setError('');
    setResults([]);
    setErrors([]);
    setProgress({ scanned: 0, total: 0 });
    setApplied({ query: text, role });
    setStatus('Reading the project catalog…');
    let cursor = 0,
      revision: string | undefined,
      catalogRevision: string | undefined;
    const found: Row[] = [],
      failed: Row[] = [];
    try {
      while (mounted.current && generation.current === version) {
        const reply = await command(
          'sessions.list',
          {
            contentSearch: {
              query: text,
              role,
              window: 'catalog',
              cursor,
              ...(revision ? { expectedRevision: revision } : {}),
              ...(catalogRevision ? { catalogRevision } : {}),
            },
          },
          ['sessions.list'],
          { timeoutMs: 90000 },
        );
        if (!mounted.current || generation.current !== version) return;
        const page = record(reply['contentSearch']);
        if (
          typeof page['revision'] !== 'string' ||
          typeof page['scanned'] !== 'number' ||
          typeof page['total'] !== 'number'
        )
          throw Error(
            'This engine does not support conversation content search. Update the project runtime.',
          );
        revision = page['revision'];
        if (typeof page['catalogRevision'] !== 'string')
          throw Error(
            'This runtime does not support paged catalog search. Update the project runtime.',
          );
        catalogRevision = page['catalogRevision'];
        found.push(...entries(page['results']));
        failed.push(...entries(page['errors']));
        setResults([...found]);
        setErrors([...failed]);
        setProgress({ scanned: page['scanned'], total: page['total'] });
        if (page['nextCursor'] === null) {
          setStatus(
            page['truncated'] === true
              ? 'Legacy scan limit reached. Search may be incomplete.'
              : 'Search complete.',
          );
          break;
        }
        if (typeof page['nextCursor'] !== 'number' || page['nextCursor'] <= cursor)
          throw Error('The engine returned an invalid search continuation.');
        cursor = page['nextCursor'];
        setStatus('Searching retained conversations…');
      }
    } catch (error) {
      if (mounted.current && generation.current === version) {
        setError(error instanceof Error ? error.message : String(error));
        setStatus('Search incomplete. Results already read are kept.');
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <section className="project-history-search" aria-label="Search across project conversations">
      <form
        className="history-transcript-search"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <label>
          <Search size={14} />
          <input
            aria-label="Search conversation content"
            value={query}
            maxLength={500}
            disabled={busy}
            placeholder="Find words inside recorded conversations…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Conversation search role"
          value={role}
          disabled={busy}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="">All roles</option>
          <option value="user">User</option>
          <option value="assistant">Assistant</option>
          <option value="system">System</option>
        </select>
        <button
          type="submit"
          className="button secondary"
          disabled={busy || query.trim().length < 2}
        >
          Search conversations
        </button>
        {busy && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              generation.current++;
              setStatus('Stopped. The current read batch may still be finishing.');
            }}
          >
            Stop search
          </button>
        )}
      </form>
      <p className="field-help">
        Searches retained text across the project catalog, independently of the displayed history
        page and summary filters. Removed history and binary attachment data are excluded.
      </p>
      {status && (
        <p role="status">
          {status} {progress.scanned} of {progress.total} records checked · {results.length}{' '}
          matching conversations.
        </p>
      )}
      {busy && (
        <progress
          aria-label="Conversation search progress"
          value={progress.scanned}
          max={Math.max(1, progress.total)}
        />
      )}
      {error && (
        <p role="alert" className="session-error">
          {error}
        </p>
      )}
      {!!errors.length && (
        <details>
          <summary>{errors.length} records could not be read; results are incomplete.</summary>
          {errors.map((item) => (
            <p className="field-help" key={String(item['id'])}>
              {String(item['id'])}: {String(item['message'])}
            </p>
          ))}
        </details>
      )}
      <div className="history-search-results">
        {results.map((result) => (
          <article key={String(result['id'])}>
            <header>
              <strong>{String(result['title'])}</strong>
              <span>
                {String(result['matching'])} matching messages · {String(result['provider'])} /{' '}
                {String(result['model'])}
              </span>
            </header>
            {entries(result['hits']).map((hit) => (
              <button
                type="button"
                key={String(hit['messageIndex'])}
                aria-label={`Read search match ${result['id']} message ${Number(hit['messageIndex']) + 1}`}
                onClick={() =>
                  onSelect(
                    {
                      id: String(result['id']),
                      ...applied,
                      revision: String(result['revision']),
                      messageIndex: Number(hit['messageIndex']),
                    },
                    result,
                  )
                }
              >
                <small>
                  {String(hit['role']).toUpperCase()} · Message {Number(hit['messageIndex']) + 1}
                </small>
                <p>{String(hit['excerpt'])}</p>
                <span>Read matching message →</span>
              </button>
            ))}
            {Number(result['matching']) > 3 && (
              <p className="field-help">
                Showing the first three matching messages. Open a match to search the complete
                transcript.
              </p>
            )}
          </article>
        ))}
      </div>
      {status === 'Search complete.' && !results.length && !errors.length && (
        <p className="quiet-state">No retained conversation text matches this search.</p>
      )}
    </section>
  );
}
