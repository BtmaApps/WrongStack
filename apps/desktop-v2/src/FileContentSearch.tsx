import { LoaderCircle, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { entries, record } from './engine-values';
import { Modal } from './Modal';
import './file-content-search.css';

const reasons: Record<string, string> = {
  time: 'time budget',
  files: 'file budget',
  entries: 'directory-entry budget',
  bytes: 'read budget',
  matches: 'result limit',
};
export function FileContentSearch({
  command,
  folder,
  includeIgnored: initialIgnored,
  onClose,
  onOpen,
}: {
  command: EngineCommand;
  folder: string;
  includeIgnored: boolean;
  onClose: () => void;
  onOpen: (path: string, line: number) => void;
}) {
  const [query, setQuery] = useState(''),
    [scope, setScope] = useState(folder);
  const [matchCase, setMatchCase] = useState(false),
    [includeIgnored, setIncludeIgnored] = useState(initialIgnored);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  const search = async () => {
    const version = ++sequence.current;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await command(
        'files.search',
        { query, path: scope || '.', matchCase, includeIgnored, limit: 200 },
        ['files.search'],
      );
      if (sequence.current === version) setResult(response);
    } catch (error) {
      if (sequence.current === version)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (sequence.current === version) setBusy(false);
    }
  };
  const hits = entries(result?.['hits']);
  const skipped = record(result?.['skipped']);
  const omitted = Object.values(skipped).reduce<number>(
    (sum, value) => sum + Number(value || 0),
    0,
  );
  return (
    <Modal onClose={onClose}>
      <div className="file-content-search-dialog">
        <header>
          <div>
            <span className="eyebrow">PROJECT FILES</span>
            <h2 id="dialog-title">Search project contents</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close content search"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <p>
          Search saved UTF-8 text on disk. Unsaved editor drafts are separate. Results show the
          first match on each line.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && query) void search();
          }}
        >
          <label>
            Find text
            <input
              aria-label="Find text in project"
              required
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="A symbol, phrase, or literal snippet…"
            />
          </label>
          <label>
            Folder scope
            <input
              aria-label="Content search folder"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              placeholder="Entire project"
            />
          </label>
          <div className="file-content-search-options">
            <label>
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(event) => setMatchCase(event.target.checked)}
              />
              Match case
            </label>
            <label>
              <input
                type="checkbox"
                checked={includeIgnored}
                onChange={(event) => setIncludeIgnored(event.target.checked)}
              />
              Include ignored source files
            </label>
            <button type="submit" className="button primary" disabled={busy || !query}>
              {busy ? <LoaderCircle className="spin" size={14} /> : <Search size={14} />}Search
              contents
            </button>
          </div>
        </form>
        {error && (
          <p role="alert" className="session-error">
            {error}
          </p>
        )}
        {busy && (
          <p role="status">
            Searching the project engine… Closing this window dismisses results; the bounded scan
            may finish in the background.
          </p>
        )}
        {result && (
          <>
            <p role="status">
              <strong>{hits.length} matching lines</strong> ·{' '}
              {Number(result['scannedFiles'] ?? 0).toLocaleString()} files read
              {result['partial'] === true
                ? ' · Partial results — narrow the folder or search text.'
                : ' · Search finished.'}
            </p>
            <p className="file-search-caveat">
              For “{String(result['query'])}” in{' '}
              {result['scope'] === '.' || !result['scope']
                ? 'the entire project'
                : String(result['scope'])}
              .
            </p>
            {Array.isArray(result['reasons']) && result['reasons'].length > 0 && (
              <p className="file-search-caveat">
                Reached:{' '}
                {result['reasons']
                  .map((value) => reasons[String(value)] ?? String(value))
                  .join(', ')}
                .
              </p>
            )}
            {omitted > 0 && (
              <p className="file-search-caveat">
                Omitted: {Number(skipped['binary'] ?? 0)} binary/non-UTF-8,{' '}
                {Number(skipped['oversized'] ?? 0)} over 1 MiB, {Number(skipped['unreadable'] ?? 0)}{' '}
                unreadable/changing files, {Number(skipped['links'] ?? 0)} symbolic links,{' '}
                {Number(skipped['depth'] ?? 0)} deep directories.
              </p>
            )}
            <section
              className="file-content-search-results"
              aria-label="Project content search results"
            >
              {hits.length ? (
                hits.map((hit) => (
                  <button
                    type="button"
                    key={`${hit['path']}:${hit['line']}`}
                    aria-label={`Open ${hit['path']} line ${hit['line']}`}
                    onClick={() => onOpen(String(hit['path']), Number(hit['line']))}
                  >
                    <strong>
                      {String(hit['path'])}
                      <span>
                        :{String(hit['line'])}:{String(hit['column'])}
                      </span>
                    </strong>
                    <code>{String(hit['preview'])}</code>
                  </button>
                ))
              ) : (
                <p>No matching lines in the searched scope.</p>
              )}
            </section>
          </>
        )}
        <small>
          Literal search · up to 200 matching lines · 5,000 files / 20,000 entries · 32 MiB read / 5
          seconds. Hidden files and build/dependency directories follow the file explorer policy.
        </small>
      </div>
    </Modal>
  );
}
