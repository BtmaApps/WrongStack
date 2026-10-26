import { BookOpen, Check, Eye, FilePenLine, RefreshCw, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { MarkdownContent } from './MarkdownContent';

type Row = Record<string, unknown>;
export interface InstructionDraft {
  document: Row | null;
  text: string;
}
export function UserInstructionsSettings({
  command,
  value,
  onChange,
}: {
  command: EngineCommand;
  value: InstructionDraft;
  onChange: (next: InstructionDraft) => void;
}) {
  const current = useRef(value);
  current.current = value;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [preview, setPreview] = useState(false),
    [confirmReload, setConfirmReload] = useState(false);
  const dirty = value.document !== null && value.text !== String(value.document['text'] ?? '');
  useEffect(() => {
    let active = true;
    setBusy(true);
    void command('user_instructions.get', {}, ['user_instructions'])
      .then((doc) => {
        if (!active) return;
        const draft = current.current;
        if (!draft.document || draft.text === String(draft.document['text'] ?? ''))
          onChange({ document: doc, text: String(doc['text'] ?? '') });
        else if (doc['mtimeMs'] !== draft.document['mtimeMs'])
          setNotice(
            'The file changed elsewhere. Your draft is kept; saving will check its revision.',
          );
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [command, onChange]);
  const reload = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const doc = await command('user_instructions.get', {}, ['user_instructions']);
      onChange({ document: doc, text: String(doc['text'] ?? '') });
      setConfirmReload(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!value.document) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await command(
        'user_instructions.save',
        { text: value.text, baseMtimeMs: value.document['mtimeMs'] ?? null },
        ['user_instructions'],
      );
      const doc = await command('user_instructions.get', {}, ['user_instructions']);
      if (doc['text'] !== value.text)
        throw Error(
          'The file changed again before readback. Your draft is kept; reload saved instructions before retrying.',
        );
      onChange({ document: doc, text: String(doc['text'] ?? '') });
      setNotice('Global instructions saved and verified. WrongStack reads them on the next turn.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="instructions-settings" aria-label="Global instructions settings">
      <header className="settings-section-heading">
        <div>
          <span className="eyebrow">YOUR RULES · ALL PROJECTS</span>
          <h2>Global instructions</h2>
          <p>
            Your own operating rules, applied before project instructions. This file is shared
            across your WrongStack profiles.
          </p>
        </div>
        <BookOpen size={25} />
      </header>
      <div className="instruction-file-meta">
        <code>{String(value.document?.['displayPath'] ?? 'WrongStack user instructions')}</code>
        <span>
          {value.document?.['exists'] === false
            ? 'No file yet · saving creates it'
            : value.document
              ? 'User-owned Markdown document'
              : 'Loading saved document…'}
        </span>
      </div>
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="studio-notice" role="status">
          <Check size={14} />
          {notice}
        </p>
      )}
      <div className="instruction-editor-toolbar">
        <fieldset className="view-segment" aria-label="Instructions view">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
            <FilePenLine size={14} />
            Edit
          </button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
            <Eye size={14} />
            Preview
          </button>
        </fieldset>
        <span>
          {value.text.length.toLocaleString()} characters ·{' '}
          {value.text ? value.text.split('\n').length : 0} lines{dirty ? ' · unsaved' : ''}
        </span>
      </div>
      {preview ? (
        <section className="instruction-preview" aria-label="Global instructions preview">
          <MarkdownContent text={value.text || 'No global instructions yet.'} />
        </section>
      ) : (
        <textarea
          className="instruction-editor"
          aria-label="Global instruction text"
          spellCheck={false}
          disabled={busy || !value.document}
          value={value.text}
          onChange={(e) => {
            onChange({ ...value, text: e.target.value });
            setNotice('');
          }}
          placeholder="Write project-independent rules in Markdown…"
        />
      )}
      <p className="field-help">
        An empty file adds no global rules. Project instructions and permission policy still apply.
      </p>
      {confirmReload && (
        <div className="instruction-reload-confirm" role="alert">
          <p>Reload saved instructions and replace your unsaved draft?</p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void reload()}
          >
            Discard draft and reload
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setConfirmReload(false)}
          >
            Keep editing
          </button>
        </div>
      )}
      <footer className="settings-save-bar">
        <span>{dirty ? 'Unsaved instruction changes' : 'Saved instructions loaded'}</span>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => (dirty ? setConfirmReload(true) : void reload())}
        >
          <RefreshCw size={14} />
          Reload instructions
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          <Save size={14} />
          {busy ? 'Working…' : 'Save global instructions'}
        </button>
      </footer>
    </section>
  );
}
