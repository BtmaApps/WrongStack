import { Copy, Pencil, Save, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { MarkdownContent } from './MarkdownContent';
import { Modal } from './Modal';
import { rosterDocumentKey } from './roster-model';

export type RosterDocumentKind = 'identity' | 'learned' | 'consolidated' | 'skill';
const labels = {
  identity: 'Identity instructions',
  learned: 'Learned directives',
  consolidated: 'Consolidated knowledge',
  skill: 'Skill addendum',
};
const localDrafts = new Map<string, { base: string; text: string }>();
export function RosterDocument({
  projectId,
  role,
  kind,
  skill = '',
  command,
  onClose,
  onSaved,
  onLink,
}: {
  projectId: string;
  role: string;
  kind: RosterDocumentKind;
  skill?: string;
  command: EngineCommand;
  onClose: () => void;
  onSaved: () => void;
  onLink?: (url: string) => void;
}) {
  const key = rosterDocumentKey(projectId, role, `${kind}:${skill}`);
  const cached = useRef(localDrafts.get(key)).current;
  const [base, setBase] = useState(cached?.base ?? ''),
    [text, setText] = useState(cached?.text ?? '');
  const [loaded, setLoaded] = useState(!!cached),
    [editing, setEditing] = useState(!!cached);
  const [readAttempt, setReadAttempt] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [leaving, setLeaving] = useState(false),
    [conflict, setConflict] = useState<string | null>(null);
  const live = useRef(true),
    sequence = useRef(0),
    saving = useRef(false);
  const dirty = text !== base;
  const read = useCallback(async () => {
    const type =
      kind === 'identity'
        ? 'agent-roster.read-customization'
        : kind === 'learned'
          ? 'agent-roster.read-learned'
          : kind === 'skill'
            ? 'agent-roster.read-skill'
            : 'agent-roster.read-consolidated';
    const result = await command(
      type,
      {
        role,
        ...(kind === 'identity' ? { documents: ['identity'] } : {}),
        ...(skill ? { skill } : {}),
      },
      [type],
    );
    return String(result[kind === 'identity' ? 'identity' : 'content'] ?? '');
  }, [command, role, kind, skill]);
  useEffect(() => {
    live.current = true;
    const version = ++sequence.current;
    setError('');
    void read()
      .then((stored) => {
        if (!live.current || version !== sequence.current) return;
        if (!cached) {
          setBase(stored);
          setText(stored);
        }
        setLoaded(true);
      })
      .catch((error) => {
        if (live.current && version === sequence.current) setError(String(error));
      });
    return () => {
      live.current = false;
      sequence.current++;
    };
  }, [key, read, cached, readAttempt]);
  const change = (value: string) => {
    setText(value);
    localDrafts.set(key, { base, text: value });
    setNotice('');
  };
  const close = () => {
    if (busy) return;
    if (dirty) setLeaving(true);
    else {
      localDrafts.delete(key);
      onClose();
    }
  };
  const save = async (reviewed?: string) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const current = await read();
      if (current !== (reviewed ?? base)) {
        setConflict(current);
        throw Error('The stored document changed. Compare the current text before replacing it.');
      }
      if ((kind === 'skill' || kind === 'consolidated') && !text.trim())
        throw Error(
          'Use the dedicated clear action to remove this document. Empty synthesis is not saved.',
        );
      const type =
        kind === 'identity'
          ? 'agent-roster.update-identity'
          : kind === 'learned'
            ? 'agent-roster.update-learned'
            : kind === 'skill'
              ? 'agent-roster.save-skill'
              : 'agent-roster.save-consolidated';
      await command(type, { role, content: text, ...(skill ? { skill } : {}) }, [type]);
      const actual = await read();
      // Canonical role loaders trim document boundaries, including identity and learned text.
      const expected = text.trim();
      const verified = actual.trim();
      if (verified !== expected) {
        setConflict(actual);
        throw Error(
          'The engine stored a different or bounded version. Your full local text is preserved; review the stored version.',
        );
      }
      if (!live.current) return;
      setBase(actual);
      setText(actual);
      localDrafts.delete(key);
      setEditing(false);
      setConflict(null);
      setNotice('Project document saved and read back.');
      onSaved();
    } catch (error) {
      if (live.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      saving.current = false;
      if (live.current) setBusy(false);
    }
  };
  return (
    <Modal title={`${labels[kind]} for ${role}`} onClose={close}>
      <div className="roster-document">
        <header>
          <div>
            <span className="eyebrow">
              {role}
              {skill ? ` · ${skill}` : ''}
            </span>
            <h2>{labels[kind]}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close role document"
            disabled={busy}
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>
        <p>
          Read the engine-resolved document. Saving creates or updates this project's role file.
          Unsaved drafts are retained in this window.
        </p>
        {error && (
          <p className="session-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="composer-notice">
            {notice}
          </p>
        )}
        {cached && dirty && (
          <p className="roster-policy-note">
            Recovered local draft. Saving checks the original stored-text baseline.
          </p>
        )}
        {!loaded ? (
          error ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => setReadAttempt((value) => value + 1)}
            >
              Retry reading document
            </button>
          ) : (
            <p role="status">Reading role document…</p>
          )
        ) : (
          <>
            <div className="roster-document-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(!editing);
                  setConflict(null);
                }}
              >
                <Pencil size={14} />
                {editing ? 'Preview text' : 'Edit project text'}
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(text)
                    .then(() => setNotice('Document copied.'))
                    .catch((error) => setError(String(error)))
                }
              >
                <Copy size={14} />
                Copy text
              </button>
            </div>
            {editing ? (
              <label>
                Markdown text
                <textarea
                  aria-label="Role document Markdown"
                  value={text}
                  disabled={busy}
                  onChange={(event) => change(event.target.value)}
                  spellCheck={false}
                />
              </label>
            ) : (
              <section className="roster-markdown" aria-label="Role document preview">
                <MarkdownContent
                  text={text || 'This document has no stored content.'}
                  {...(onLink ? { onLink } : {})}
                />
              </section>
            )}
            {conflict !== null && (
              <section className="roster-document-conflict">
                <h3>Stored text</h3>
                <textarea aria-label="Current stored role document" readOnly value={conflict} />
                <div>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setBase(conflict);
                      setText(conflict);
                      setConflict(null);
                      setEditing(false);
                      setError('');
                      localDrafts.delete(key);
                    }}
                  >
                    Use stored text
                  </button>
                  <button
                    type="button"
                    className="button danger"
                    disabled={busy}
                    onClick={() => void save(conflict)}
                  >
                    Replace the reviewed stored text
                  </button>
                </div>
              </section>
            )}
          </>
        )}
        {leaving && (
          <div className="roster-confirm" role="alert">
            <p>Your role document has unsaved text.</p>
            <button type="button" className="button secondary" onClick={() => setLeaving(false)}>
              Keep editing document
            </button>
            <button type="button" className="button secondary" onClick={onClose}>
              Keep draft and close
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                localDrafts.delete(key);
                onClose();
              }}
            >
              Discard document draft
            </button>
          </div>
        )}
        <footer>
          <span>{dirty ? 'Unsaved project text' : 'Stored role document'}</span>
          <button
            type="button"
            className="button primary"
            disabled={!loaded || !dirty || busy}
            onClick={() => void save()}
          >
            <Save size={14} />
            Save project document
          </button>
        </footer>
      </div>
    </Modal>
  );
}
