'use client';

import {
  ArrowDown,
  ArrowUp,
  FileCode2,
  ImagePlus,
  Pause,
  Pencil,
  Play,
  Square,
  WandSparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { clientId } from '../lib/ids';
import { composeMessage, draftKey, record, text } from '../lib/session';
import type { Attachment, SessionController } from '../lib/use-session';
import { useSkillPicker } from '../lib/use-skill-picker';
import { PromptRefiner } from './prompt-refiner';

export function Composer({ controller }: { controller: SessionController }) {
  const { state, connection, ready, modelPending, send, submit, queue, removeQueued, notice } =
    controller;
  const [draft, setDraft] = useState('');
  const [references, setReferences] = useState<string[]>([]);
  const [images, setImages] = useState<Attachment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reading, setReading] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<'queue' | 'steer'>('queue');
  const [refineOriginal, setRefineOriginal] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const skills = useSkillPicker(draft, setDraft, textarea, controller);
  const imageInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const appliedDraft = useRef('');
  const mention = /(?:^|\s)@([^\s@]*)$/.exec(draft);
  const query = mention?.[1];
  const enabled =
    connection === 'open' &&
    ready &&
    Boolean(state.id && state.model) &&
    !modelPending &&
    !controller.compactPending;

  useEffect(() => {
    mounted.current = true;
    try {
      const saved = record(JSON.parse(localStorage.getItem(draftKey(state.id)) ?? '{}'));
      setDraft(text(saved.text));
      setReferences(
        Array.isArray(saved.references)
          ? saved.references.filter((r): r is string => typeof r === 'string')
          : [],
      );
    } catch {
      /* A malformed draft must not prevent composing. */
    }
    setLoaded(true);
    return () => {
      mounted.current = false;
    };
  }, [state.id]);
  useEffect(() => {
    if (!loaded || !state.id) return;
    try {
      localStorage.setItem(draftKey(state.id), JSON.stringify({ text: draft, references }));
    } catch {
      /* Draft still lives in memory. */
    }
  }, [draft, references, loaded, state.id]);
  useEffect(() => {
    const request = controller.draftRequest;
    if (
      !loaded ||
      !request ||
      request.sessionId !== state.id ||
      appliedDraft.current === request.id
    )
      return;
    appliedDraft.current = request.id;
    if (images.length + (request.images?.length ?? 0) > 4)
      notice('Remove attached images before restoring this message.');
    else {
      if (request.text) setDraft((value) => [value, request.text].filter(Boolean).join('\n\n'));
      if (request.reference) setReferences((items) => [...new Set([...items, request.reference!])]);
      if (request.images?.length) setImages((items) => [...items, ...request.images!]);
      textarea.current?.focus();
    }
    controller.consumeDraft(request.id);
  }, [controller.draftRequest, controller.consumeDraft, state.id, loaded, images.length, notice]);
  useEffect(() => {
    if (query === undefined || !enabled) return;
    const timer = setTimeout(
      () => send('files.list', { sessionId: state.id, query, limit: 12 }),
      120,
    );
    return () => clearTimeout(timer);
  }, [query, enabled, send, state.id]);

  const attachImages = async (files: File[]) => {
    if (reading) return;
    setReading(true);
    try {
      const selected = files.slice(0, Math.max(0, 4 - images.length));
      const next: Attachment[] = [];
      for (const file of selected) {
        if (
          !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
          file.size > 5 * 1024 * 1024
        ) {
          notice('Use PNG, JPEG, WebP or GIF images up to 5 MB each.');
          continue;
        }
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
          reader.onerror = () => reject(new Error('Image could not be read.'));
          reader.readAsDataURL(file);
        });
        next.push({ id: clientId(), name: file.name, mediaType: file.type, data });
      }
      if (mounted.current) setImages((current) => [...current, ...next].slice(0, 4));
    } catch {
      notice('Image could not be read. Try attaching it again.');
    } finally {
      if (mounted.current) setReading(false);
    }
  };
  const sendDraft = () => {
    if (!enabled || reading) return;
    if (submit(composeMessage(draft, references), images, deliveryMode)) {
      setDraft('');
      setReferences([]);
      setImages([]);
      setDeliveryMode('queue');
      textarea.current?.focus();
    }
  };
  return (
    <div className="composer-area">
      {queue.length > 0 && (
        <section className="message-queue" aria-label="Queued messages">
          <header className="queue-heading">
            <span>
              {queue.length} queued ·{' '}
              {controller.queuePaused ? 'paused' : state.running ? 'waiting for this run' : 'ready'}
            </span>
            <button
              type="button"
              onClick={controller.toggleQueue}
              aria-label={controller.queuePaused ? 'Resume queue' : 'Pause queue'}
            >
              {controller.queuePaused ? <Play size={12} /> : <Pause size={12} />}
              {controller.queuePaused ? 'Resume' : 'Pause'}
            </button>
          </header>
          {queue.map((item, i) => (
            <div key={item.id}>
              <span>
                <b>{i + 1}</b> {item.mode === 'steer' && <em>steer · </em>}
                {item.content || `${item.images.length} image(s)`}
              </span>
              <div className="queue-item-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move queued message ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => controller.moveQueued(item.id, -1)}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move queued message ${i + 1} down`}
                  disabled={i === queue.length - 1}
                  onClick={() => controller.moveQueued(item.id, 1)}
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Edit queued message ${i + 1}`}
                  disabled={reading || images.length + item.images.length > 4}
                  onClick={() => {
                    setDraft((value) => [value, item.content].filter(Boolean).join('\n\n'));
                    setImages((items) => [...items, ...item.images]);
                    removeQueued(item.id);
                    textarea.current?.focus();
                  }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove queued message ${i + 1}`}
                  onClick={() => removeQueued(item.id)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          sendDraft();
        }}
      >
        {(references.length > 0 || images.length > 0) && (
          <div className="attachment-list">
            {references.map((path) => (
              <span className="attachment" key={path}>
                <FileCode2 size={13} />
                <span>{path}</span>
                <button
                  type="button"
                  aria-label={`Remove ${path}`}
                  onClick={() => setReferences((items) => items.filter((v) => v !== path))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {images.map((image) => (
              <span className="attachment" key={image.id}>
                <ImagePlus size={13} />
                <span>{image.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${image.name}`}
                  onClick={() => setImages((items) => items.filter((v) => v.id !== image.id))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {skills.open && enabled && (
          <section className="file-picker skill-picker" aria-label="Matching skills">
            <div id={skills.listId} role="listbox" aria-label="Skills">
              {skills.matches.map((skill, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={index === skills.selected}
                  id={`${skills.listId}-${index}`}
                  key={skill.name}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => skills.pick(skill.name)}
                >
                  <strong>${skill.name}</strong>
                  <small>{skill.description}</small>
                </button>
              ))}
            </div>
            {!skills.matches.length && <p role="status">{skills.status}</p>}
          </section>
        )}
        {query !== undefined && enabled && !skills.open && (
          <section className="file-picker" aria-label="Matching project files">
            {state.matches.length ? (
              state.matches.map((path) => (
                <button
                  type="button"
                  key={path}
                  onClick={() => {
                    setReferences((items) => [...new Set([...items, path])]);
                    setDraft((value) => value.replace(/@[^\s@]*$/, ''));
                    textarea.current?.focus();
                  }}
                >
                  <FileCode2 size={14} />
                  {path}
                </button>
              ))
            ) : (
              <p>No matching files. Type a project path.</p>
            )}
          </section>
        )}
        <textarea
          ref={textarea}
          aria-label="Message"
          value={draft}
          aria-controls={skills.open ? skills.listId : undefined}
          aria-activedescendant={
            skills.open && skills.matches.length ? `${skills.listId}-${skills.selected}` : undefined
          }
          rows={3}
          placeholder="Describe what you want to build…"
          onChange={(event) => {
            setDraft(event.target.value);
            skills.trackCursor();
          }}
          onSelect={skills.trackCursor}
          onKeyDown={(event) => {
            if (skills.onKeyDown(event)) return;
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              sendDraft();
            }
            if (event.key === 'Escape' && query !== undefined)
              setDraft((value) => value.replace(/@[^\s@]*$/, ''));
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files).filter((file) =>
              file.type.startsWith('image/'),
            );
            if (files.length) {
              event.preventDefault();
              void attachImages(files);
            }
          }}
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
            <button
              type="button"
              className="icon-button"
              aria-label="Refine prompt"
              title="Refine prompt"
              disabled={!enabled || !draft.trim() || reading}
              onClick={() => setRefineOriginal(draft)}
            >
              <WandSparkles size={17} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Attach images"
              title="Attach images · or paste an image"
              disabled={reading || images.length >= 4}
              onClick={() => imageInput.current?.click()}
            >
              <ImagePlus size={17} />
            </button>
            <input
              ref={imageInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(event) => {
                void attachImages(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
            <span>
              <kbd>@</kbd> files <span className="separator">/</span> <kbd>$</kbd> skills{' '}
              <span className="separator">/</span> <kbd>↵</kbd> {state.running ? 'queue' : 'send'}
            </span>
          </div>
          <div className="composer-actions">
            {state.running && (
              <select
                className="delivery-mode"
                aria-label="Message delivery"
                title="Steer stops the current run, then sends this message first."
                value={deliveryMode}
                onChange={(e) => setDeliveryMode(e.target.value as 'queue' | 'steer')}
              >
                <option value="queue">Queue</option>
                <option value="steer">Steer</option>
              </select>
            )}
            {state.running && (
              <button
                type="button"
                className="stop-button"
                disabled={!enabled}
                onClick={() => send('abort', { sessionId: state.id })}
              >
                <Square size={12} fill="currentColor" />
                Stop
              </button>
            )}
            <button
              type="submit"
              className="send-button"
              aria-label={
                state.running
                  ? deliveryMode === 'steer'
                    ? 'Steer message'
                    : 'Queue message'
                  : 'Send message'
              }
              disabled={
                !enabled || reading || (!draft.trim() && !references.length && !images.length)
              }
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </div>
      </form>
      {refineOriginal !== null && (
        <PromptRefiner
          original={refineOriginal}
          controller={controller}
          onClose={() => setRefineOriginal(null)}
          onApply={(value) => {
            setDraft((current) =>
              current === refineOriginal ? value : [current, value].filter(Boolean).join('\n\n'),
            );
            textarea.current?.focus();
          }}
        />
      )}
      <p className={`composer-footnote ${enabled ? 'composer-guidance' : ''}`}>
        {!enabled
          ? controller.compactPending
            ? 'Compacting context…'
            : modelPending
              ? 'Switching model…'
              : connection !== 'open'
                ? 'Reconnecting — your draft stays here.'
                : 'Opening session…'
          : 'Shift + Enter for a new line'}
      </p>
    </div>
  );
}
