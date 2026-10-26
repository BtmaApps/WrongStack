import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  Clock3,
  CornerDownLeft,
  FilePlus2,
  Gauge,
  ListPlus,
  LoaderCircle,
  Paperclip,
  Pencil,
  RefreshCw,
  Sparkles,
  Square,
  Terminal,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ComposerAttachments, useComposerAttachments } from './ComposerAttachments';
import { type ComposerAttachment, wireAttachments } from './composer-attachments';
import { dispatchComposer, type SubmitMode, supportsQueue } from './composer-model';
import {
  appendToDraft,
  type ComposerFileReference,
  type DesktopCommandAction,
  desktopCommands,
  parseDesktopCommand,
  referenceMessage,
  splitReferenceMessage,
} from './composer-resources-model';
import type { EngineCommand, EngineSend } from './engine-operations';
import type { EngineState } from './engine-state';
import { Modal } from './Modal';
import { PromptRefinement } from './PromptRefinement';
import { PromptWorkspace } from './PromptWorkspace';
import { SessionContextPanel } from './SessionContextPanel';
import { SessionModelControls } from './SessionModelControls';
import { useComposerInput } from './useComposerInput';
import './composer.css';
import './composer-resources.css';

export function SessionComposer({
  state,
  send,
  command,
  draft,
  onDraftChange,
  onSettings,
  projectId,
  projectRoot,
  references,
  attachments,
  onAttachmentsChange,
  onReferencesChange,
  onNavigate,
}: {
  state: EngineState;
  send: EngineSend;
  command: EngineCommand;
  draft: string;
  onDraftChange: (text: string) => void;
  onSettings: () => void;
  projectId: string;
  projectRoot: string;
  references: ComposerFileReference[];
  attachments: ComposerAttachment[];
  onAttachmentsChange: (items: ComposerAttachment[]) => void;
  onReferencesChange: (refs: ComposerFileReference[]) => void;
  onNavigate: (target: 'files' | 'changes' | 'skills' | 'memory' | 'kanban' | 'atlas') => void;
}) {
  const [mode, setMode] = useState<SubmitMode>('btw'),
    [sending, setSending] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [refine, setRefine] = useState<{
      original: string;
      mode: SubmitMode;
      draftAtOpen: string;
    } | null>(null),
    [restore, setRestore] = useState<{
      text: string;
      paths: string[];
      attachments?: ComposerAttachment[];
    } | null>(null),
    [queueBusy, setQueueBusy] = useState(false),
    [enhanceDraft, setEnhanceDraft] = useState<boolean | null>(null),
    [prefBusy, setPrefBusy] = useState(false);
  const [promptWorkspace, setPromptWorkspace] = useState<'library' | 'journal' | null>(null),
    [contextPanel, setContextPanel] = useState<
      'inspect' | 'compact' | 'compact-aggressive' | 'repair' | 'clear' | null
    >(null),
    [commandHelp, setCommandHelp] = useState(false);
  const current = useRef(state),
    currentDraft = useRef(draft),
    busy = useRef(false),
    mounted = useRef(true);
  current.current = state;
  currentDraft.current = draft;
  const refsNow = useRef(references);
  const attachmentsNow = useRef(attachments);
  attachmentsNow.current = attachments;
  const media = useComposerAttachments(attachments, onAttachmentsChange);
  refsNow.current = references;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const queuePanel = useRef<HTMLDetailsElement>(null);
  const input = useComposerInput({
    draft,
    onDraftChange,
    references,
    onReferencesChange,
    messages: state.messages.map((message) => ({
      ...message,
      text: splitReferenceMessage(message.text).text,
    })),
    projectId,
    textarea,
  });
  const queueSupported = supportsQueue(state);
  const enhanceEnabled =
    enhanceDraft ?? state.results['prefs.updated']?.['enhanceEnabled'] === true;
  const setEnhance = async (value: boolean) => {
    setEnhanceDraft(value);
    setPrefBusy(true);
    setError('');
    try {
      await command('prefs.update', { enhanceEnabled: value }, ['key.operation_result']);
      const actual = await command('prefs.get', {}, ['prefs.updated']);
      if (actual['enhanceEnabled'] !== value)
        throw Error(
          'The profile did not confirm the refinement preference. Refresh before retrying.',
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnhanceDraft(null);
      setPrefBusy(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (state.connected && queueSupported) void send('queue.get').catch((e) => setError(String(e)));
  }, [state.connected, queueSupported, send]);
  useEffect(() => {
    const el = textarea.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }
  }, [draft]);
  useEffect(() => {
    if (!state.connected || state.running || !draft.trim()) return;
    const caps = state.results['session.start']?.['protocolCapabilities'];
    if (!Array.isArray(caps) || !caps.includes('session.provider-warm')) return;
    const timer = setTimeout(() => {
      void send('composer.warm').catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, state.connected, state.running, state.results['session.start'], send]);
  const deliver = async (
    text: string,
    selected: SubmitMode,
    original = text,
    refinedFrom?: string,
  ) => {
    if (busy.current) throw Error('A submit is already in progress.');
    busy.current = true;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const attached = [...refsNow.current];
      const files = [...attachmentsNow.current];
      const response = await dispatchComposer(
        referenceMessage(text, attached, projectRoot),
        selected,
        {
          current: () => current.current,
          send,
          command,
          waitForIdle: async () => {
            const started = Date.now();
            while (current.current.running) {
              if (!mounted.current || !current.current.connected)
                throw Error('The session detached while stopping. Your draft is kept.');
              if (Date.now() - started > 30000)
                throw Error(
                  'The engine has not finished stopping. Your draft is kept; check the run before retrying.',
                );
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          },
        },
        refinedFrom !== undefined
          ? referenceMessage(refinedFrom, attached, projectRoot)
          : undefined,
        wireAttachments(files),
      );
      if (!mounted.current) return;
      if (currentDraft.current === original) onDraftChange('');
      onReferencesChange(
        refsNow.current.filter((ref) => !attached.some((sent) => sent.path === ref.path)),
      );
      onAttachmentsChange(
        attachmentsNow.current.filter((item) => !files.some((sent) => sent.id === item.id)),
      );
      setRefine(null);
      setNotice(response);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      busy.current = false;
      if (mounted.current) setSending(false);
    }
  };
  const runCommand = (action: DesktopCommandAction | 'unknown', argument: string): boolean => {
    if (['queue', 'btw', 'steer'].includes(action) && argument) return false;
    if (action === 'unknown') {
      setError(
        'This desktop command is not available. Your draft was not sent. Prefix it with // to send it as literal text.',
      );
      return true;
    }
    if (argument) {
      setError('This command takes no arguments. Your draft was not sent.');
      return true;
    }
    setError('');
    if (action === 'help') setCommandHelp(true);
    else if (action === 'library' || action === 'journal') setPromptWorkspace(action);
    else if (
      action === 'context' ||
      action === 'compact' ||
      action === 'compact-aggressive' ||
      action === 'repair' ||
      action === 'clear'
    )
      setContextPanel(action === 'context' ? 'inspect' : action);
    else if (action === 'stop') stop();
    else if (action === 'enhance') void setEnhance(!enhanceEnabled);
    else if (action === 'settings') onSettings();
    else if (action === 'queue') {
      if (queuePanel.current) queuePanel.current.open = true;
      else setNotice('There are no pending queued prompts.');
    } else if (action === 'btw' || action === 'steer') setMode(action);
    else onNavigate(action);
    onDraftChange('');
    return true;
  };
  const submit = () => {
    if (
      (!draft.trim() && !references.length && !attachments.length) ||
      media.processing ||
      sending ||
      !state.connected ||
      state.needsSetup ||
      state.inputs.length
    )
      return;
    if (prefBusy || state.hydrating) return;
    const parsed = parseDesktopCommand(draft);
    if (parsed && runCommand(parsed.action, parsed.argument)) return;
    const selected =
      parsed && (parsed.action === 'queue' || parsed.action === 'btw' || parsed.action === 'steer')
        ? parsed.action
        : mode;
    const text = parsed?.argument || (draft.startsWith('//') ? draft.slice(1) : draft);
    if (enhanceEnabled && text.trim()) {
      setRefine({ original: text, mode: selected, draftAtOpen: draft });
      return;
    }
    void deliver(text, selected, draft).catch(() => {});
  };
  const queueAction = async (type: string, payload: Record<string, unknown> = {}) => {
    setQueueBusy(true);
    setError('');
    try {
      await command(type, payload, ['queue.state']);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void send('queue.get').catch(() => {});
    } finally {
      setQueueBusy(false);
    }
  };
  const stop = (edit = false) => {
    setError('');
    void send('abort')
      .then(() => {
        if (!edit) return;
        const previous = current.current.messages.findLast((message) => message.role === 'user');
        if (!previous) return;
        const view = {
          ...splitReferenceMessage(previous.text),
          attachments: previous.attachments ?? [],
        };
        if (currentDraft.current.trim() || refsNow.current.length || attachmentsNow.current.length)
          setRestore(view);
        else {
          onDraftChange(view.text);
          onReferencesChange(view.paths.map((path) => ({ path })));
          onAttachmentsChange(view.attachments);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  const canSend =
    state.connected &&
    !state.hydrating &&
    !state.needsSetup &&
    (!!draft.trim() || !!references.length || !!attachments.length) &&
    !media.processing &&
    !sending &&
    !prefBusy;
  const modeLabel =
    mode === 'queue'
      ? 'Queue'
      : mode === 'steer'
        ? 'Stop & steer'
        : state.running
          ? attachments.length
            ? 'Queue attachments'
            : 'BTW'
          : 'Message';
  return (
    <div className="native-composer-stack">
      {state.hydrating && (
        <p className="composer-notice" role="status">
          Syncing session history… Your draft stays here.
        </p>
      )}
      {input.popup}
      {state.queue.length > 0 && (
        <details className="composer-queue" ref={queuePanel}>
          <summary>
            <ListPlus size={14} /> {state.queue.length} queued{' '}
            {state.queue.length === 1 ? 'prompt' : 'prompts'}
            <small>Engine-owned · runs after this turn</small>
            <ChevronDown size={13} />
          </summary>
          <div className="composer-queue-heading">
            <span>Pending prompts</span>
            <button
              type="button"
              disabled={queueBusy || !state.connected}
              onClick={() => void queueAction('queue.clear')}
            >
              Clear queue
            </button>
          </div>
          <ol>
            {state.queue.map((item) => (
              <li key={item.id}>
                <p>
                  {splitReferenceMessage(item.text).text || 'Project file references'}
                  {splitReferenceMessage(item.text).paths.length > 0 && (
                    <small>
                      {' '}
                      · {splitReferenceMessage(item.text).paths.length} referenced files
                    </small>
                  )}
                  {item.imageCount > 0 && <small> · {item.imageCount} attachments</small>}
                </p>
                <div>
                  <button
                    type="button"
                    title="Copy queued text into the composer; the original stays queued"
                    disabled={sending}
                    onClick={() => {
                      const view = splitReferenceMessage(item.text);
                      if (draft.trim() || references.length || attachments.length) setRestore(view);
                      else {
                        onDraftChange(view.text);
                        onReferencesChange(view.paths.map((path) => ({ path })));
                      }
                    }}
                  >
                    <Pencil size={13} /> {item.imageCount > 0 ? 'Copy text only' : 'Copy to draft'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove queued prompt ${item.text}`}
                    disabled={queueBusy || !state.connected}
                    onClick={() => void queueAction('queue.remove', { id: item.id })}
                  >
                    <X size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
      {error && (
        <p className="composer-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="composer-notice" role="status">
          {notice}
        </p>
      )}
      {restore !== null && (
        <div className="composer-restore">
          <span>Your composer already contains a draft.</span>
          <button
            type="button"
            onClick={() => {
              onDraftChange(restore.text);
              onReferencesChange(restore.paths.map((path) => ({ path })));
              onAttachmentsChange(restore.attachments ?? []);
              setRestore(null);
            }}
          >
            Replace draft
          </button>
          <button type="button" onClick={() => setRestore(null)}>
            Keep current draft
          </button>
        </div>
      )}
      <form
        className="native-composer"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          if (!sending && !media.processing) media.setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            media.setDragging(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          media.setDragging(false);
          if (!sending) void media.add(Array.from(event.dataTransfer.files));
        }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <ComposerAttachments
          items={attachments}
          disabled={sending}
          onChange={onAttachmentsChange}
          control={media}
        />
        {references.length > 0 && (
          <section className="composer-reference-chips" aria-label="Attached project files">
            {references.map((ref) => (
              <span key={ref.path} title={ref.path}>
                <FilePlus2 size={12} />
                {ref.path}
                <button
                  type="button"
                  aria-label={`Remove file reference ${ref.path}`}
                  disabled={sending}
                  onClick={() =>
                    onReferencesChange(references.filter((item) => item.path !== ref.path))
                  }
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </section>
        )}
        <textarea
          ref={textarea}
          aria-label="Message WrongStack"
          placeholder={
            state.running
              ? 'Add a note, queue the next task, or steer…'
              : 'Describe what you want to build…'
          }
          value={draft}
          readOnly={sending}
          onPaste={(event) => {
            if (!event.clipboardData.files.length || sending) return;
            event.preventDefault();
            void media.add(Array.from(event.clipboardData.files));
            const text = event.clipboardData.getData('text/plain');
            if (text) {
              const el = event.currentTarget;
              input.replace(
                draft.slice(0, el.selectionStart) + text + draft.slice(el.selectionEnd),
                el.selectionStart + text.length,
              );
            }
          }}
          onChange={(e) => {
            input.onChange(e.target.value, e.target.selectionStart);
            setNotice('');
          }}
          onSelect={(event) => input.onSelect(event.currentTarget.selectionStart)}
          onKeyDown={(event) => {
            if (
              event.defaultPrevented ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229
            )
              return;
            if (input.onKey(event.key, event.shiftKey)) {
              event.preventDefault();
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <footer className="composer-toolbar">
          <SessionModelControls
            state={state}
            command={command}
            send={send}
            onSettings={onSettings}
          />
          <div className="composer-actions">
            <button
              type="button"
              className="composer-chip"
              aria-label="Attach images or PDFs"
              title="Attach images or PDFs · paste or drop also works"
              disabled={sending || media.processing}
              onClick={() => media.picker.current?.click()}
            >
              <Paperclip size={14} />
            </button>
            <button
              type="button"
              className="composer-chip"
              aria-label="Prompt journal"
              title="Prompt journal · this project"
              onClick={() => setPromptWorkspace('journal')}
            >
              <Clock3 size={14} />
            </button>
            <details className="composer-options">
              <summary title="Composer options" aria-label="Composer options">
                <Sparkles size={15} />
              </summary>
              <div>
                <button
                  type="button"
                  disabled={!canSend || !draft.trim()}
                  onClick={(e) => {
                    e.currentTarget.closest('details')?.removeAttribute('open');
                    setRefine({ original: draft, mode, draftAtOpen: draft });
                  }}
                >
                  <Sparkles size={14} /> Refine this draft
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    setPromptWorkspace('library');
                  }}
                >
                  <BookOpen size={14} /> Prompt library
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    input.replace(appendToDraft(draft, '@'));
                  }}
                >
                  <FilePlus2 size={14} /> Add project file
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    input.replace(appendToDraft(draft, '$'));
                  }}
                >
                  <Sparkles size={14} /> Insert skill mention
                </button>
                <button
                  type="button"
                  disabled={!state.connected}
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    setContextPanel('inspect');
                  }}
                >
                  <Gauge size={14} /> Context & instructions
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    setCommandHelp(true);
                  }}
                >
                  <Terminal size={14} /> Desktop commands
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={enhanceEnabled}
                    disabled={prefBusy || !state.connected}
                    onChange={(e) => void setEnhance(e.target.checked)}
                  />{' '}
                  Refine before sending
                </label>
                {prefBusy && <small role="status">Saving preference…</small>}
                <button
                  type="button"
                  disabled={!state.connected || queueBusy}
                  onClick={() => void queueAction('queue.get')}
                >
                  <RefreshCw size={14} /> Refresh engine queue
                </button>
                <small>
                  Enter sends · Shift Enter adds a line · ↑ recalls input · @ files · $ skills · /
                  commands.
                </small>
              </div>
            </details>
            {state.running && (
              <>
                <button
                  type="button"
                  className="composer-chip"
                  aria-label="Stop and edit last prompt"
                  title="Stop and edit last prompt"
                  disabled={sending || !state.connected}
                  onClick={() => stop(true)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="composer-chip"
                  aria-label="Stop run"
                  title="Stop run; pending queue remains"
                  disabled={sending || !state.connected}
                  onClick={() => stop()}
                >
                  <Square size={13} />
                </button>
              </>
            )}
            <label
              className="composer-chip submit-mode"
              title={
                mode === 'btw'
                  ? 'Idle: start a turn. Running: send a BTW note to this session’s leader.'
                  : mode === 'queue'
                    ? 'Add a persistent prompt. If idle it starts immediately.'
                    : 'Interrupt the current turn, then start your instruction. Clear pending queue first.'
              }
            >
              <select
                aria-label="Message delivery mode"
                value={mode}
                disabled={sending}
                onChange={(e) => setMode(e.target.value as SubmitMode)}
              >
                <option value="btw">{state.running ? 'BTW' : 'Message'}</option>
                <option value="queue" disabled={!queueSupported}>
                  Queue
                </option>
                <option value="steer">Stop & steer</option>
              </select>
            </label>
            <button
              type="submit"
              className="button primary composer-send"
              aria-label={state.running || mode !== 'btw' ? `Send ${modeLabel}` : 'Send message'}
              disabled={!canSend}
              title={`${modeLabel} · Enter`}
            >
              {sending ? (
                <LoaderCircle className="spin" size={16} />
              ) : mode === 'queue' ? (
                <ListPlus size={17} />
              ) : mode === 'steer' ? (
                <CornerDownLeft size={17} />
              ) : (
                <ArrowUp size={17} />
              )}
            </button>
          </div>
        </footer>
      </form>
      {state.running && attachments.length > 0 && mode === 'btw' && (
        <p className="composer-notice">
          Attachments start a queued turn after the current run. Choose Stop & steer to interrupt.
        </p>
      )}
      {refine && (
        <PromptRefinement
          original={refine.original}
          fileReferences={references.map((ref) => ref.path)}
          attachments={attachments}
          mode={refine.mode}
          command={command}
          state={state}
          onClose={() => setRefine(null)}
          onApply={(text) => {
            setMode(refine.mode);
            onDraftChange(text);
            setRefine(null);
          }}
          onSend={(text, selected) => deliver(text, selected, refine.draftAtOpen, refine.original)}
        />
      )}
      {promptWorkspace && (
        <PromptWorkspace
          projectId={projectId}
          sessionId={state.sessionId}
          kind={promptWorkspace}
          onClose={() => setPromptWorkspace(null)}
          onInsert={(text) => {
            input.replace(appendToDraft(currentDraft.current, text));
            setPromptWorkspace(null);
          }}
        />
      )}
      {contextPanel && (
        <SessionContextPanel
          command={command}
          running={state.running}
          maxContext={Number(state.results['session.start']?.['maxContext'] ?? 0)}
          initialAction={contextPanel === 'inspect' ? undefined : contextPanel}
          onClose={() => setContextPanel(null)}
        />
      )}
      {commandHelp && (
        <Modal onClose={() => setCommandHelp(false)}>
          <div className="composer-dialog resource-dialog">
            <header>
              <h2 id="dialog-title">Desktop commands</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close desktop commands"
                onClick={() => setCommandHelp(false)}
              >
                <X size={18} />
              </button>
            </header>
            <p>
              Choose to insert a command, then press Enter to run it. Unknown commands stay in your
              draft; use <code>{'//'}</code> for literal slash-prefixed text.
            </p>
            <div className="resource-list">
              {desktopCommands.map((command) => (
                <button
                  type="button"
                  key={command.name}
                  onClick={() => {
                    input.replace(`${command.name} `);
                    setCommandHelp(false);
                  }}
                >
                  <strong>{command.name}</strong>
                  <span>{command.description}</span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
