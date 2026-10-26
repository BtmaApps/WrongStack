import { Check, LoaderCircle, RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AttachmentPreview } from './ComposerAttachments';
import type { ComposerAttachment } from './composer-attachments';
import { refinementText, type SubmitMode } from './composer-model';
import type { EngineCommand } from './engine-operations';
import type { EngineState } from './engine-state';
import { MarkdownContent } from './MarkdownContent';
import { Modal } from './Modal';

export function PromptRefinement({
  original,
  mode,
  command,
  state,
  onClose,
  onApply,
  onSend,
  fileReferences = [],
  attachments = [],
}: {
  original: string;
  mode: SubmitMode;
  command: EngineCommand;
  state: EngineState;
  onClose: () => void;
  onApply: (text: string) => void;
  onSend: (text: string, mode: SubmitMode) => Promise<void>;
  fileReferences?: readonly string[];
  attachments?: readonly ComposerAttachment[];
}) {
  const [result, setResult] = useState<Record<string, unknown>>({}),
    [busy, setBusy] = useState(true),
    [sending, setSending] = useState(false),
    [error, setError] = useState(''),
    [variant, setVariant] = useState<'original' | 'refined' | 'english'>('refined'),
    [feedback, setFeedback] = useState(''),
    [provider, setProvider] = useState(''),
    [model, setModel] = useState(''),
    [edited, setEdited] = useState<string | null>(null),
    [edit, setEdit] = useState(false);
  const generation = useRef(0);
  const refine = async (previous?: Record<string, unknown>) => {
    const own = ++generation.current;
    setBusy(true);
    setError('');
    try {
      if (!!provider.trim() !== !!model.trim())
        throw Error(
          'Enter both a provider and model, or leave both empty to use your configured refiner.',
        );
      const reply = await command(
        'model.refine',
        {
          text: original,
          timeoutMs: previous ? 180000 : 90000,
          ...(provider.trim() ? { provider: provider.trim(), model: model.trim() } : {}),
          ...(previous
            ? {
                previousRefined: previous['refined'],
                previousEnglish: previous['english'],
                ...(feedback.trim() ? { retryFeedback: feedback.trim() } : {}),
              }
            : {}),
        },
        ['model.refine_result'],
        { timeoutMs: previous ? 195000 : 105000 },
      );
      if (own !== generation.current) return;
      refinementText(reply, 'refined', original);
      setResult(reply);
      setVariant('refined');
      setEdited(null);
      setEdit(false);
    } catch (e) {
      if (own === generation.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (own === generation.current) setBusy(false);
    }
  };
  useEffect(() => {
    void refine();
    return () => {
      generation.current++;
    };
  }, []);
  let text = original;
  try {
    text = edited ?? refinementText(result, variant, original);
  } catch {
    text = original;
  }
  const ready = variant === 'original' || typeof result[variant] === 'string';
  const send = async () => {
    setSending(true);
    setError('');
    try {
      await onSend(text, mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };
  return (
    <Modal
      onClose={() => {
        if (!sending) onClose();
      }}
    >
      <div className="composer-dialog refine-dialog">
        <header>
          <div>
            <span className="eyebrow">REVIEW BEFORE SENDING</span>
            <h2 id="dialog-title">
              <Sparkles size={20} /> Refine your prompt
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Back to draft"
            disabled={sending}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <p>
          Your original draft stays intact. Approve a version, edit it, or return to the composer.
          Delivery mode:{' '}
          <strong>
            {mode === 'btw' ? 'Message / BTW' : mode === 'queue' ? 'Queue' : 'Stop & steer'}
          </strong>
          .
        </p>
        {fileReferences.length > 0 && (
          <section
            className="composer-reference-chips"
            aria-label="Files retained through refinement"
          >
            {fileReferences.map((path) => (
              <span key={path}>{path}</span>
            ))}
          </section>
        )}
        {attachments.length > 0 && (
          <section aria-label="Attachments retained through refinement">
            <p>
              Refinement changes the text only. These files stay attached to the approved message.
            </p>
            <AttachmentPreview items={attachments} interactive={false} />
          </section>
        )}
        <fieldset className="refine-versions" aria-label="Prompt versions">
          {(['original', 'refined', 'english'] as const).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={variant === key}
              disabled={sending || (key !== 'original' && typeof result[key] !== 'string')}
              onClick={() => {
                setVariant(key);
                setEdited(null);
              }}
            >
              {key === 'original' ? 'Original' : key === 'refined' ? 'Refined' : 'English'}
            </button>
          ))}
        </fieldset>
        {busy && (
          <p className="refine-progress" role="status">
            <LoaderCircle size={15} className="spin" /> Refining with your configured model…
          </p>
        )}
        {error && (
          <p role="alert" className="composer-error">
            {error} Your draft is kept.
          </p>
        )}
        <label className="refine-edit-toggle">
          <input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} /> Edit
          this version
        </label>
        {edit ? (
          <textarea
            aria-label="Edit refined prompt"
            className="refine-editor"
            value={text}
            onChange={(e) => setEdited(e.target.value)}
          />
        ) : (
          <section className="refine-preview" aria-label="Prompt preview">
            <MarkdownContent text={text} />
          </section>
        )}
        <details className="refine-options">
          <summary>Refiner model & retry</summary>
          <p>
            Empty fields use the configured refiner and fallback policy. This selection does not
            change the chat model.
          </p>
          <div>
            <label>
              Provider ID
              <input
                aria-label="Refiner provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder={state.provider}
              />
            </label>
            <label>
              Model ID
              <input
                aria-label="Refiner model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={state.model}
              />
            </label>
          </div>
          <label>
            What should improve?
            <input
              aria-label="Refinement feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Keep it shorter, preserve constraints…"
            />
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={busy || sending}
            onClick={() => void refine(Object.keys(result).length ? result : undefined)}
          >
            <RefreshCw size={13} /> Retry refinement
          </button>
        </details>
        {typeof result['refinedWith'] === 'object' && (
          <small className="composer-effort-hint">
            Refined with {String((result['refinedWith'] as Record<string, unknown>)['provider'])} /{' '}
            {String((result['refinedWith'] as Record<string, unknown>)['model'])}
          </small>
        )}
        <footer>
          <button type="button" className="button secondary" disabled={sending} onClick={onClose}>
            Keep original draft
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={sending || !ready || !text.trim()}
            onClick={() => onApply(text)}
          >
            Use in composer
          </button>
          <button
            type="button"
            className="button primary"
            disabled={sending || !ready || !text.trim()}
            onClick={() => void send()}
          >
            <Check size={14} /> {sending ? 'Sending…' : 'Approve & send'}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
