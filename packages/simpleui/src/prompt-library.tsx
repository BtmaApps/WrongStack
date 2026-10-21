import { Bookmark, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from './hooks/use-focus-trap.js';
import { onPanelActivation, onSimplePanel } from './lib/panel-events.js';
import { readPersisted, writePersisted } from './lib/persisted.js';
import { messageId } from './lib/session-helpers.js';
import { socketRequest } from './lib/socket-request.js';
import type { SimpleSocket } from './lib/ws.js';

interface LibraryPrompt {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
}
interface LibraryContent {
  content: string;
  variants?: Record<string, string>;
  variables?: {
    name: string;
    description?: string;
    required?: boolean;
    default?: string;
    enum?: string[];
  }[];
}

interface SavedPrompt {
  id: string;
  text: string;
  label: string;
  savedAt: number;
}

const STORAGE_KEY = 'wrongstack.simpleui.prompts';
const STORAGE_VERSION = 1;

function isValidPrompt(value: unknown): value is SavedPrompt {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as SavedPrompt).id === 'string' &&
    typeof (value as SavedPrompt).text === 'string'
  );
}

function loadPrompts(): SavedPrompt[] {
  const stored = readPersisted<SavedPrompt[]>(STORAGE_KEY, {
    version: STORAGE_VERSION,
    validate: (value) => (Array.isArray(value) && value.every(isValidPrompt) ? value : null),
  });
  return stored ?? [];
}

function savePrompts(prompts: SavedPrompt[]): boolean {
  return writePersisted(STORAGE_KEY, STORAGE_VERSION, prompts);
}

interface PromptLibraryProps {
  onRecall: (text: string) => void;
  socketRef?: React.RefObject<SimpleSocket | null>;
}

export function PromptLibrary({ onRecall, socketRef }: PromptLibraryProps) {
  const [open, setOpen] = useState(false);
  const [prompts, setPrompts] = useState<SavedPrompt[]>(loadPrompts);
  const [newText, setNewText] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const [library, setLibrary] = useState<LibraryPrompt[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('design');
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<LibraryContent | null>(null);
  const [level, setLevel] = useState('detailed');
  const [values, setValues] = useState<Record<string, string>>({});
  const [libraryError, setLibraryError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open || !socketRef?.current) return;
    let active = true;
    setLoading(true);
    setLibraryError('');
    const requestId = messageId('prompts');
    const handle = socketRequest({
      socket: socketRef.current,
      sendType: 'prompts.list',
      expectType: 'prompts.list',
      payload: { requestId },
      accept: (frame) => (frame.payload as { requestId?: string })?.requestId === requestId,
    });
    void handle.promise.then((payload) => {
      if (!active) return;
      setLoading(false);
      if (!payload || payload.error || payload.enabled === false) {
        setLibraryError(String(payload?.error || 'Shared prompt library unavailable.'));
      } else setLibrary((payload.prompts ?? []) as LibraryPrompt[]);
    });
    return () => {
      active = false;
      handle.cancel();
    };
  }, [open, socketRef, reload]);

  useEffect(() => {
    setDetail(null);
    setLevel('detailed');
    setValues({});
    if (!open || !selected || !socketRef?.current) return;
    let active = true;
    const requestId = messageId('prompts');
    const handle = socketRequest({
      socket: socketRef.current,
      sendType: 'prompts.content',
      expectType: 'prompts.content',
      payload: { slug: selected, requestId },
      accept: (frame) => {
        const p = frame.payload as { requestId?: string; slug?: string };
        return p?.requestId === requestId && p.slug === selected;
      },
    });
    void handle.promise.then((payload) => {
      if (!active) return;
      if (!payload || payload.error || payload.found === false) {
        setLibraryError(String(payload?.error || 'Could not load this prompt.'));
        return;
      }
      const loaded = payload as unknown as LibraryContent;
      setDetail(loaded);
      setValues(Object.fromEntries((loaded.variables ?? []).map((v) => [v.name, v.default ?? ''])));
    });
    return () => {
      active = false;
      handle.cancel();
    };
  }, [selected, open, socketRef]);

  const selectedText = detail?.variants?.[level] ?? detail?.content ?? '';
  const renderedText = selectedText.replace(
    /\{\{\s*([\w.-]+)\s*\}\}/g,
    (whole, name: string) => values[name] || whole,
  );
  const missingValues = (detail?.variables ?? []).some(
    (v) => v.required && !values[v.name]?.trim(),
  );
  const filteredLibrary = library.filter(
    (p) =>
      (!category || p.category === category) &&
      `${p.title} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const unsubOpen = onSimplePanel('open-prompt-library', onOpen);
    const unsubActivation = onPanelActivation((panel) => {
      if (panel !== 'open-prompt-library') setOpen(false);
    });
    return () => {
      unsubOpen();
      unsubActivation();
    };
  }, []);

  const add = () => {
    if (!newText.trim()) return;
    const p: SavedPrompt = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: newText.trim(),
      label: newLabel.trim() || newText.trim().slice(0, 40),
      savedAt: Date.now(),
    };
    const updated = [p, ...prompts];
    setPrompts(updated);
    setStorageWarning(!savePrompts(updated));
    setNewText('');
    setNewLabel('');
  };

  const remove = (id: string) => {
    const updated = prompts.filter((p) => p.id !== id);
    setPrompts(updated);
    setStorageWarning(!savePrompts(updated));
  };

  if (!open) {
    return (
      <button
        type="button"
        className="prompt-library-trigger"
        title="Prompt library"
        aria-label="Open prompt library"
        onClick={() => setOpen(true)}
      >
        <Bookmark size={13} aria-hidden="true" />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="settings-overlay"
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />
      <aside
        className="prompt-library"
        role="dialog"
        aria-modal="true"
        aria-label="Prompt library"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="prompt-library-head">
          <span>
            <Bookmark size={13} aria-hidden="true" /> PROMPTS
          </span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" ref={closeRef}>
            <X size={14} />
          </button>
        </header>
        {socketRef && (
          <div className="prompt-library-shared">
            <h3>Shared prompt library</h3>
            <div className="prompt-library-add">
              <input
                aria-label="Search shared prompts"
                placeholder="Search styles, components, workflows…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                aria-label="Prompt category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setSelected('');
                }}
              >
                <option value="">All categories</option>
                {[...new Set(library.map((p) => p.category))].sort().map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {loading && <p role="status">Loading prompts…</p>}
            {libraryError && (
              <p role="alert">
                {libraryError}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setSelected('');
                    setReload((value) => value + 1);
                  }}
                >
                  Retry
                </button>
              </p>
            )}
            <div className="prompt-library-catalog">
              {filteredLibrary.map((p) => (
                <button
                  type="button"
                  className="prompt-item-recall"
                  key={p.slug}
                  aria-pressed={selected === p.slug}
                  onClick={() => {
                    setLibraryError('');
                    setSelected(p.slug);
                  }}
                >
                  <strong>{p.title}</strong>
                  <span>{p.description}</span>
                </button>
              ))}
              {!loading && !libraryError && filteredLibrary.length === 0 && (
                <p>No matching prompts.</p>
              )}
            </div>
            {detail && (
              <div className="prompt-library-add">
                {detail.variants && (
                  <label>
                    Detail level{' '}
                    <select
                      aria-label="Prompt detail level"
                      value={level}
                      onChange={(event) => setLevel(event.target.value)}
                    >
                      <option value="simple">Simple</option>
                      <option value="detailed">Detailed</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </label>
                )}
                {(detail.variables ?? []).map((variable) => (
                  <label key={variable.name} htmlFor={`library-variable-${variable.name}`}>
                    {variable.description || variable.name}
                    {variable.required ? ' *' : ''}
                    {variable.enum?.length ? (
                      <select
                        id={`library-variable-${variable.name}`}
                        value={values[variable.name] ?? ''}
                        onChange={(event) =>
                          setValues((previous) => ({
                            ...previous,
                            [variable.name]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Choose…</option>
                        {variable.enum.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        id={`library-variable-${variable.name}`}
                        rows={2}
                        value={values[variable.name] ?? ''}
                        onChange={(event) =>
                          setValues((previous) => ({
                            ...previous,
                            [variable.name]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
                <p className="prompt-library-preview">{renderedText}</p>
                <button
                  type="button"
                  disabled={!renderedText || missingValues}
                  onClick={() => {
                    socketRef.current?.send('prompts.used', { slug: selected });
                    onRecall(renderedText);
                    setOpen(false);
                  }}
                >
                  Use prompt in draft
                </button>
              </div>
            )}
            <h3>Saved prompts</h3>
          </div>
        )}
        <div className="prompt-library-add">
          <input
            type="text"
            placeholder="Label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <textarea
            placeholder="Prompt text…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={3}
          />
          <button type="button" onClick={add} disabled={!newText.trim()}>
            <Plus size={12} aria-hidden="true" /> Save
          </button>
          {storageWarning && (
            <p className="prompt-library-storage-warning" role="alert">
              <TriangleAlert size={12} aria-hidden="true" /> Could not save — browser storage is
              full or blocked.
            </p>
          )}
        </div>
        <div className="prompt-library-list">
          {prompts.length === 0 && <p className="prompt-library-empty">No saved prompts yet.</p>}
          {prompts.map((p) => (
            <article key={p.id} className="prompt-item">
              <button
                type="button"
                className="prompt-item-recall"
                onClick={() => {
                  onRecall(p.text);
                  setOpen(false);
                }}
              >
                <strong>{p.label}</strong>
                <span>{p.text.length > 80 ? `${p.text.slice(0, 77)}…` : p.text}</span>
              </button>
              <button
                type="button"
                className="prompt-item-remove"
                aria-label={`Remove "${p.label}"`}
                onClick={() => remove(p.id)}
              >
                <Trash2 size={12} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </aside>
    </>
  );
}
