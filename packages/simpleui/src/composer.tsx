import {
  CircleStop,
  FileText,
  Image,
  ListPlus,
  Send,
  ShieldAlert,
  Split,
  Waves,
  X,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { useComposerState } from './hooks/use-composer-state.js';
import { useSkillMentionPicker } from './hooks/use-skill-mention-picker.js';
import type { StatusNotice } from './hooks/use-status-notice.js';
import { detectFileMention, fileBasename } from './lib/file-mention.js';
import { removeQueuedAt } from './lib/queue-model.js';
import type { SimpleSocket } from './lib/ws.js';
import { QueuedMessages } from './queued-messages.js';
import { RefinePanel } from './refine-panel.js';
import type { ConnectionState, SessionInfo } from './types.js';

interface ComposerProps {
  composer: ReturnType<typeof useComposerState>;
  skillSocket: SimpleSocket | null | undefined;
  session: SessionInfo | null;
  running: boolean;
  connection: ConnectionState;
  notice: StatusNotice | null;
  preRefineSeconds: number;
}

function safeLine(value: unknown): string {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > 180 ? `${text.slice(0, 177)}…` : text;
  } catch {
    return 'Tool input';
  }
}

export function Composer({
  composer,
  skillSocket,
  session,
  running,
  connection,
  notice,
  preRefineSeconds,
}: ComposerProps) {
  const {
    draft,
    setDraft,
    fileRefs,
    setFileRefs,
    fileMention,
    setFileMention,
    fileMatches,
    filePickerIndex,
    setFilePickerIndex,
    fileSearching,
    pendingConfirm,
    textareaRef,
    queue,
    refineState,
    submitWith,
    abort,
    decideConfirm,
    selectFile,
    refineDecision,
    refineRetry,
    refineRetryFallback,
    refineStartNow,
    refineSendEdited,
    refineEditInComposer,
    attachedImages,
    attachImages,
    removeImage,
    visionSupported,
  } = composer;
  // Queue controls the composition root used to derive at the call site:
  // the queue lives in the hook, so clear/remove are local setQueue uses.
  const clearQueue = () => composer.setQueue([]);
  const removeQueued = (id: string) =>
    composer.setQueue((current) =>
      removeQueuedAt(
        current,
        current.findIndex((item) => item.id === id),
      ),
    );
  const skillMentions = useSkillMentionPicker(
    draft,
    setDraft,
    textareaRef,
    skillSocket,
    session?.id,
    connection,
  );
  const empty = !draft.trim() && fileRefs.length === 0 && attachedImages.length === 0;
  const offline = connection !== 'open';
  // While the refine panel owns the text, the composer must not accept a
  // second submit for the same message.
  const locked = offline || refineState !== null;

  // Permission-prompt a11y: the bar is an alertdialog — focus lands on the
  // safest action when it appears (Deny for destructive tools, Allow for
  // standard ones) so keyboard operators and screen readers can act
  // immediately, and focus returns to the composer once it resolves.
  const denyButtonRef = useRef<HTMLButtonElement | null>(null);
  const allowButtonRef = useRef<HTMLButtonElement | null>(null);
  const hadConfirmRef = useRef(false);
  useEffect(() => {
    if (!pendingConfirm) return;
    // Absent tier behaves as standard (mirrors the className fallback);
    // any non-default tier the server sends — today 'destructive' — is
    // treated as risky, so an unknown future tier fails safe to Deny.
    const risky =
      pendingConfirm.riskTier != null &&
      pendingConfirm.riskTier !== 'standard' &&
      pendingConfirm.riskTier !== 'safe';
    (risky ? denyButtonRef : allowButtonRef).current?.focus();
  }, [pendingConfirm]);
  useEffect(() => {
    if (pendingConfirm) {
      hadConfirmRef.current = true;
      return;
    }
    if (hadConfirmRef.current) {
      hadConfirmRef.current = false;
      // The decision unmounted the bar's buttons — hand focus back to the
      // composer instead of dropping it to <body>.
      textareaRef.current?.focus();
    }
  }, [pendingConfirm, textareaRef]);

  return (
    <div className="composer-inner">
      {pendingConfirm && (
        <div
          className={`permission-bar ${pendingConfirm.riskTier ?? 'standard'}`}
          role="alertdialog"
          aria-labelledby="permission-confirm-title"
          aria-describedby="permission-confirm-input"
        >
          <ShieldAlert size={17} aria-hidden="true" />
          <div className="permission-copy">
            <strong id="permission-confirm-title">Allow {pendingConfirm.toolName}?</strong>
            <span id="permission-confirm-input">{safeLine(pendingConfirm.input)}</span>
          </div>
          <div className="permission-actions">
            <button
              type="button"
              ref={denyButtonRef}
              aria-keyshortcuts="n"
              onClick={() => decideConfirm('no')}
            >
              Deny
            </button>
            <button
              type="button"
              aria-keyshortcuts="a"
              onClick={() => decideConfirm('always-exact')}
            >
              Same input / args
            </button>
            {pendingConfirm.toolName === 'exec' && (
              <button type="button" onClick={() => decideConfirm('always-command')}>
                Command, any args
              </button>
            )}
            <button type="button" onClick={() => decideConfirm('always-tool')}>
              Tool, any input
            </button>
            <button
              type="button"
              className="primary"
              ref={allowButtonRef}
              aria-keyshortcuts="y"
              onClick={() => decideConfirm('yes')}
            >
              Allow
            </button>
          </div>
        </div>
      )}

      {refineState && (
        <RefinePanel
          state={refineState}
          onDecision={refineDecision}
          onRetry={refineRetry}
          onRetryFallback={refineRetryFallback}
          onStartRefine={refineStartNow}
          onSendEdited={refineSendEdited}
          onEditInComposer={refineEditInComposer}
          preRefineSeconds={preRefineSeconds}
        />
      )}

      <QueuedMessages queue={queue} onClear={clearQueue} onRemove={removeQueued} />

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          submitWith('btw');
        }}
      >
        {skillMentions.popup}
        {fileMention && !skillMentions.open && (
          <div className="file-picker" role="listbox" aria-label="Project files">
            <div className="file-picker-heading">
              <span>PROJECT FILES{fileMention.query && ` · ${fileMention.query}`}</span>
              <span>↑↓ · ENTER</span>
            </div>
            <div className="file-picker-list">
              {fileSearching && fileMatches.length === 0 ? (
                <div className="file-picker-empty">Searching…</div>
              ) : fileMatches.length === 0 ? (
                <div className="file-picker-empty">No matching files</div>
              ) : (
                fileMatches.map((path, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === filePickerIndex}
                    className={index === filePickerIndex ? 'active' : undefined}
                    key={path}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setFilePickerIndex(() => index)}
                    onClick={() => selectFile(path)}
                  >
                    <FileText size={13} aria-hidden="true" />
                    <span>{path}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
        {fileRefs.length > 0 && (
          <fieldset className="file-references" aria-label="Referenced files">
            {fileRefs.map((path) => (
              <span className="file-reference" key={path} title={path}>
                <FileText size={12} aria-hidden="true" />
                <span>{fileBasename(path)}</span>
                <button
                  type="button"
                  onClick={() => setFileRefs((current) => current.filter((ref) => ref !== path))}
                  aria-label={`Remove ${path}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </fieldset>
        )}
        {attachedImages.length > 0 && (
          <fieldset className="file-references" aria-label="Attached images">
            {attachedImages.map((img) => (
              <span className="file-reference" key={img.id} title={img.name}>
                <Image size={12} aria-hidden="true" />
                <span>{img.name}</span>
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  aria-label={`Remove ${img.name}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </fieldset>
        )}
        {/\[VIBE\]/i.test(draft) && (
          <div className="vibe-mode-pill" role="status">
            <Waves size={12} aria-hidden="true" />
            <span>
              <strong>VIBE Protocol:</strong> Three-Stage Verification (Spec → Coder → Auditor)
            </span>
          </div>
        )}
        <textarea
          ref={textareaRef}
          aria-label="Message"
          aria-controls={skillMentions.open ? skillMentions.listId : undefined}
          aria-activedescendant={skillMentions.open ? skillMentions.activeId : undefined}
          aria-autocomplete="list"
          value={draft}
          placeholder={
            offline
              ? 'Waiting for connection…'
              : running
                ? 'Add to the run…  ENTER rides alongside · @ file · $ skill'
                : 'Tell WrongStack what to do…  @ file · $ skill'
          }
          disabled={locked}
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            skillMentions.setCursor(event.target.selectionStart ?? value.length);
            setFileMention(detectFileMention(value, event.target.selectionStart ?? value.length));
          }}
          onSelect={(event) => {
            const textarea = event.currentTarget;
            skillMentions.setCursor(textarea.selectionStart);
            setFileMention(detectFileMention(textarea.value, textarea.selectionStart));
          }}
          onKeyDown={(event) => {
            if (skillMentions.onKeyDown(event)) return;
            if (fileMention) {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setFilePickerIndex((current) =>
                  fileMatches.length > 0 ? (current + 1) % fileMatches.length : 0,
                );
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setFilePickerIndex((current) =>
                  fileMatches.length > 0
                    ? (current - 1 + fileMatches.length) % fileMatches.length
                    : 0,
                );
                return;
              }
              if ((event.key === 'Enter' || event.key === 'Tab') && fileMatches.length > 0) {
                event.preventDefault();
                const path = fileMatches[filePickerIndex];
                if (path) selectFile(path);
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setFileMention(null);
                return;
              }
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              // Enter is the softest send: it never interrupts a run.
              // Steering is an explicit, separate button.
              submitWith(event.ctrlKey || event.metaKey ? 'queue' : 'btw');
            }
          }}
        />
        <div className="composer-actions">
          <button
            type="button"
            className="image-attach-button"
            title={visionSupported ? 'Attach images' : 'Current model does not support vision'}
            aria-label="Attach images"
            disabled={offline || !visionSupported}
            onClick={attachImages}
          >
            <Image size={17} />
          </button>
          {/* Stop stays reachable while a run is in flight even with a draft
              typed — aborting and sending are independent intents. */}
          {running && (
            <button
              type="button"
              className="mode-button stop"
              onClick={abort}
              title="Stop the run"
              aria-label="Stop run"
            >
              <CircleStop size={15} />
              <span>Stop</span>
            </button>
          )}
          {running && (
            <button
              type="button"
              className="mode-button steer"
              onClick={() => submitWith('steer')}
              disabled={locked || empty}
              title="Interrupt the run and send this instead"
              aria-label="Steer the run with this message"
            >
              <Split size={15} />
              <span>Steer</span>
            </button>
          )}
          <button
            type="button"
            className="mode-button queue"
            onClick={() => submitWith('queue')}
            disabled={locked || empty}
            title="Hold this until the current run finishes"
            aria-label="Add message to queue"
          >
            <ListPlus size={15} />
            <span>Queue</span>
          </button>
          <button
            type="submit"
            className="send-button"
            disabled={empty || locked}
            title={running ? 'Send alongside the run' : 'Send'}
            aria-label={running ? 'Send message alongside the run' : 'Send message'}
          >
            <Send size={18} />
            <span>Send</span>
          </button>
        </div>
      </form>
      <div className="composer-meta">
        <span className={notice ? `composer-notice ${notice.tone}` : undefined} aria-live="polite">
          {notice?.text ??
            (running
              ? '@ FILE · ENTER ADDS TO RUN · CTRL+ENTER QUEUES'
              : '@ FILE · ENTER SEND · SHIFT+ENTER NEW LINE')}
        </span>
        <span>{session?.model ?? 'NO MODEL'}</span>
      </div>
    </div>
  );
}
