import { LoaderCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { record } from './engine-values';
import { Modal } from './Modal';
import './merge-conflict-review.css';

export function MergeConflictReview({
  path,
  command,
  onClose,
  onResolved,
}: {
  path: string;
  command: EngineCommand;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null),
    [text, setText] = useState(''),
    [choice, setChoice] = useState('text'),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [closing, setClosing] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const own = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const result = await command('git.conflict', { path }, ['git.conflict'], {
        timeoutMs: 45000,
      });
      if (own !== generation.current) return;
      if (result['path'] !== path) throw Error('The engine returned a different conflict.');
      setSnapshot(result);
      setText(String(result['working'] ?? ''));
      setChoice(
        result['binary'] === true || record(result['workingInfo'])['exists'] === false
          ? ''
          : 'text',
      );
    } catch (error) {
      if (own === generation.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (own === generation.current) setLoading(false);
    }
  }, [command, path]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const dirty =
    !!snapshot && ((!!choice && choice !== 'text') || text !== String(snapshot['working'] ?? ''));
  const close = () => {
    if (busy) return;
    if (dirty) setClosing(true);
    else onClose();
  };
  const binary = snapshot?.['binary'] === true;
  const markers = choice !== 'delete' && !binary && /^(?:<{7}|={7}|>{7}|\|{7})(?:\s|$)/m.test(text);
  const resolve = async () => {
    if (!snapshot || busy || loading || markers || !choice) return;
    setBusy(true);
    setError('');
    try {
      await command(
        'git.conflict.resolve',
        { path, revision: snapshot['revision'], choice, ...(choice === 'text' ? { text } : {}) },
        ['git.action_result'],
        { timeoutMs: 45000 },
      );
      onResolved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Resolve merge conflict" onClose={close}>
      <section className="merge-conflict-review" aria-label="Merge conflict review">
        <header>
          <div>
            <span className="eyebrow">REVIEW BOTH SIDES</span>
            <h2>Resolve merge conflict</h2>
            <p>{path}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close conflict resolver"
            disabled={busy}
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>
        <p>
          Inspect the available Git sides. Choose a complete side, edit a text result, or explicitly
          delete this path. Saving marks only this path resolved and does not create a commit.
        </p>
        {error && (
          <p role="alert" className="session-error">
            {error} Your merge draft stays here.
          </p>
        )}
        {loading ? (
          <p role="status">
            <LoaderCircle size={16} className="spin" /> Reading conflict stages…
          </p>
        ) : (
          snapshot && (
            <>
              <div className="merge-conflict-sides">
                {[
                  ['base', 'Common base'],
                  ['ours', 'Ours'],
                  ['theirs', 'Theirs'],
                ].map(([key, label]) => {
                  const info = record(record(snapshot['sides'])[key!]);
                  const exists = info['exists'] === true;
                  return (
                    <article key={key}>
                      <header>
                        <strong>{label}</strong>
                        {key !== 'base' && (
                          <button
                            type="button"
                            className="button secondary"
                            disabled={busy || !exists}
                            aria-pressed={choice === key}
                            onClick={() => {
                              setText(String(snapshot[key!] ?? ''));
                              setChoice(key!);
                            }}
                          >
                            Use {key}
                          </button>
                        )}
                      </header>
                      <section aria-label={`${label} content`}>
                        {!exists ? (
                          <p className="merge-side-absent">Not present in this side.</p>
                        ) : binary ? (
                          <div className="merge-binary-side">
                            <strong>
                              {info['kind'] === 'binary' ? 'Binary file' : 'UTF-8 text file'}
                            </strong>
                            <p>{Number(info['bytes']).toLocaleString()} bytes</p>
                            <code>{String(info['oid']).slice(0, 12)}</code>
                            <p>Choose this side to preserve its file content.</p>
                          </div>
                        ) : (
                          <pre>{String(snapshot[key!] ?? '')}</pre>
                        )}
                      </section>
                    </article>
                  );
                })}
              </div>
              {binary && (
                <p>
                  Binary conflict: choose a complete side or explicit deletion. Binary content is
                  not converted into editable text.
                </p>
              )}
              <div className="merge-delete-choice">
                <button
                  type="button"
                  className="button danger"
                  aria-pressed={choice === 'delete'}
                  disabled={busy}
                  onClick={() => setChoice('delete')}
                >
                  Resolve by deleting file
                </button>
                {choice === 'delete' && (
                  <p>
                    Saving will remove this path from the working tree and index. Other conflicted
                    paths stay unresolved.
                  </p>
                )}
              </div>
              {!binary && choice !== 'delete' && (
                <>
                  <label className="merge-result-label">
                    Merged result
                    <textarea
                      aria-label="Merged conflict result"
                      value={text}
                      disabled={busy}
                      onChange={(event) => {
                        setText(event.target.value);
                        setChoice('text');
                      }}
                    />
                  </label>
                  {markers && <p>Remove all conflict markers before marking the file resolved.</p>}
                </>
              )}
              {Array.isArray(snapshot['relatedPaths']) &&
                Number(snapshot['unresolvedPaths']) > 1 && (
                  <section className="merge-related-paths" aria-label="Unresolved project paths">
                    <strong>
                      {Number(snapshot['unresolvedPaths'])} unresolved paths in this project
                    </strong>
                    <p>
                      Rename conflicts can span several paths. Resolve each remaining path from
                      Changes; this action does not choose or remove other paths. Showing{' '}
                      {Math.min(50, snapshot['relatedPaths'].length)} of{' '}
                      {Number(snapshot['unresolvedPaths'])} paths.
                    </p>
                    <ul>
                      {(snapshot['relatedPaths'] as string[]).slice(0, 50).map((item) => (
                        <li key={item}>
                          <code>{item}</code>
                          {item === path ? ' · reviewing' : ''}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
            </>
          )
        )}
        {closing ? (
          <div className="merge-close-review">
            <p>Discard the unsaved merge draft?</p>
            <button type="button" className="button secondary" onClick={() => setClosing(false)}>
              Keep editing merge
            </button>
            <button type="button" className="button danger" onClick={onClose}>
              Discard merge draft
            </button>
          </div>
        ) : (
          <footer>
            <button
              type="button"
              className="button secondary"
              disabled={busy || loading}
              onClick={() => void load()}
            >
              Reload conflict (discard merge draft)
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy || loading || !snapshot || markers || !choice}
              onClick={() => void resolve()}
            >
              {busy
                ? 'Saving and staging…'
                : choice === 'delete'
                  ? 'Delete file & mark resolved'
                  : 'Save & mark resolved'}
            </button>
          </footer>
        )}
      </section>
    </Modal>
  );
}
