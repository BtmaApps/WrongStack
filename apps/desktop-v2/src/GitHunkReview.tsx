import { LoaderCircle, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { entries } from './engine-values';
import { Modal } from './Modal';
import './git-hunk-review.css';

export function GitHunkReview({
  path,
  command,
  onClose,
  onApplied,
}: {
  path: string;
  command: EngineCommand;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [layer, setLayer] = useState('unstaged'),
    [result, setResult] = useState<Record<string, unknown>>({}),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const own = ++generation.current;
    setLoading(true);
    setError('');
    setResult({});
    try {
      const reply = await command('git.hunks', { path, layer }, ['git.hunks']);
      if (own !== generation.current) return;
      if (reply['path'] !== path || reply['layer'] !== layer)
        throw Error('The engine returned a different review target.');
      setResult(reply);
    } catch (error) {
      if (own === generation.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (own === generation.current) setLoading(false);
    }
  }, [command, path, layer]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  const apply = async (hunk: number) => {
    if (busy || loading) return;
    setBusy(true);
    setError('');
    try {
      await command('git.hunk.apply', { path, layer, patchId: result['patchId'], hunk }, [
        'git.action_result',
      ]);
      onApplied();
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const hunks = entries(result['hunks']);
  return (
    <Modal
      title="Stage individual hunks"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <section className="git-hunk-review" aria-label="Git hunk review">
        <header>
          <div>
            <span className="eyebrow">REVIEW THE INDEX</span>
            <h2>Stage individual hunks</h2>
            <p>{path}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close hunk review"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <p>
          Move only the selected change between your working tree and the index. Files on disk stay
          as they are.
        </p>
        <div className="git-hunk-controls">
          <label>
            Review layer
            <select
              aria-label="Hunk review layer"
              value={layer}
              disabled={busy}
              onChange={(event) => setLayer(event.target.value)}
            >
              <option value="unstaged">Unstaged · index → working tree</option>
              <option value="staged">Staged · HEAD → index</option>
            </select>
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={loading || busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} />
            Refresh hunks
          </button>
        </div>
        {error && (
          <p role="alert" className="session-error">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">
            <LoaderCircle size={15} className="spin" /> Reading Git hunks…
          </p>
        ) : hunks.length ? (
          hunks.map((hunk) => (
            <article key={String(hunk['id'])}>
              <header>
                <code>{String(hunk['header'])}</code>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || !!error}
                  onClick={() => void apply(Number(hunk['id']))}
                >
                  {layer === 'staged' ? 'Unstage' : 'Stage'} hunk {Number(hunk['id']) + 1}
                </button>
              </header>
              <pre>
                {String(hunk['text'])
                  .split('\n')
                  .map((line, index) => (
                    <span
                      key={index}
                      className={
                        line.startsWith('+')
                          ? 'git-hunk-add'
                          : line.startsWith('-')
                            ? 'git-hunk-remove'
                            : ''
                      }
                    >
                      {line}
                      {'\n'}
                    </span>
                  ))}
              </pre>
            </article>
          ))
        ) : (
          <p>{String(result['reason'] ?? 'No hunks available.')}</p>
        )}
        <small>
          Refresh after an external edit or index change. Whole-file controls remain available for
          unsupported file types.
        </small>
      </section>
    </Modal>
  );
}
