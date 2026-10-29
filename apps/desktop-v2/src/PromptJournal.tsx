import { ChevronDown, Download, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { record } from './engine-values';
import { journalFileName, journalJsonl, journalMarkdown } from './journal-export';
import { type JournalCursors, mergeJournalPages } from './journal-paging';
import { MarkdownContent } from './MarkdownContent';

const PAGE = 100;

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
    [month, setMonth] = useState(''),
    [cursors, setCursors] = useState<JournalCursors>({}),
    [notice, setNotice] = useState(''),
    [query, setQuery] = useState(''),
    [loading, setLoading] = useState(true),
    [enabled, setEnabled] = useState(true),
    [error, setError] = useState('');
  const generation = useRef(0);
  const truncated = Object.keys(cursors).length > 0;
  /** One page per category; `until` maps a category to its inclusive older bound. */
  const read = useCallback(
    (kinds: string[], until: JournalCursors = {}) =>
      Promise.all(
        kinds.map(async (kind) => ({
          kind,
          result: await command(
            'prompts.journal',
            {
              filter: {
                limit: PAGE,
                category: kind,
                ...(scope === 'session' && sessionId ? { sessionId } : {}),
                ...(date ? { date } : {}),
                ...(month ? { month } : {}),
                ...(until[kind] ? { until: until[kind] } : {}),
              },
            },
            ['prompts.journal'],
          ),
        })),
      ),
    [command, sessionId, scope, date, month],
  );
  const load = useCallback(async () => {
    const own = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const pages = await read(category ? [category] : ['raw_user', 'refined_user']);
      if (own !== generation.current) return;
      // The engine returns the newest PAGE entries per category; a full page leaves a cursor.
      const merged = mergeJournalPages(pages, new Set(), PAGE);
      setRows(merged.added);
      setCursors(merged.cursors);
      setEnabled(pages.some((page) => page.result['enabled'] !== false));
    } catch (e) {
      if (own === generation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (own === generation.current) setLoading(false);
    }
  }, [read, category]);
  /** The next older page of every category that still has one. */
  const loadOlder = async () => {
    const own = generation.current;
    const kinds = Object.keys(cursors);
    if (!kinds.length) return;
    setLoading(true);
    setError('');
    try {
      const pages = await read(kinds, cursors);
      if (own !== generation.current) return;
      const { added, cursors: next } = mergeJournalPages(
        pages,
        new Set(rows.map((row) => String(row['id']))),
        PAGE,
      );
      setRows((current) =>
        [...current, ...added].sort((a, b) =>
          String(b['timestamp']).localeCompare(String(a['timestamp'])),
        ),
      );
      setCursors(next);
      setNotice(
        added.length
          ? `Loaded ${added.length} older ${added.length === 1 ? 'entry' : 'entries'}.`
          : 'No older entries were returned.',
      );
    } catch (e) {
      if (own === generation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (own === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const filtered = rows.filter((row) =>
    `${row['content']} ${row['rawContent'] ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const exportRows = (format: 'md' | 'jsonl') => {
    const exportedAt = new Date().toISOString();
    const filters = [
      scope === 'session' ? 'this session' : 'all project sessions',
      category === 'raw_user'
        ? 'original input'
        : category === 'refined_user'
          ? 'refined prompts'
          : 'original and refined',
      month && `month ${month}`,
      date && `date ${date}`,
      query && `search “${query}”`,
      truncated && 'older entries not loaded',
    ]
      .filter(Boolean)
      .join(' · ');
    const content =
      format === 'md'
        ? journalMarkdown(filtered, { title: 'WrongStack prompt journal', filters, exportedAt })
        : journalJsonl(filtered);
    const url = URL.createObjectURL(
      new Blob([content], {
        type: format === 'md' ? 'text/markdown;charset=utf-8' : 'application/x-ndjson',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = journalFileName(scope, exportedAt, format);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      `Export requested for the ${filtered.length} visible ${filtered.length === 1 ? 'entry' : 'entries'}.`,
    );
  };
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
          type="month"
          aria-label="Journal month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
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
      {notice && (
        <p role="status" className="composer-notice">
          {notice}
        </p>
      )}
      <footer className="journal-limit">
        <small>
          {filtered.length} visible · searching within the loaded window
          {truncated && ' · older entries exist beyond what is loaded'}
        </small>
        <button
          type="button"
          className="button secondary"
          disabled={loading || !truncated || !rows.length}
          onClick={() => void loadOlder()}
        >
          Load older entries
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={loading || !filtered.length}
          onClick={() => exportRows('md')}
        >
          <Download size={14} />
          Export Markdown
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={loading || !filtered.length}
          onClick={() => exportRows('jsonl')}
        >
          <Download size={14} />
          Export JSONL
        </button>
      </footer>
    </>
  );
}
