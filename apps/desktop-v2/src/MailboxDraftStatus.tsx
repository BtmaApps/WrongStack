import type { DurableFormState } from './durable-form-draft';
import type { MailDraft } from './mailbox-model';

/** Restore, save-failure and other-window states of the saved mailbox draft. */
export function MailboxDraftStatus({
  restoredAt,
  saved,
  onResolve,
  onRetry,
}: {
  restoredAt: number | undefined;
  saved: DurableFormState<MailDraft> | null;
  onResolve: (choice: 'local' | 'saved') => void;
  onRetry: () => void;
}) {
  if (!saved) return null;
  if (saved.review)
    return (
      <div className="mailbox-confirm" role="alert">
        <p>
          Another window saved a different unsent message for this project
          {saved.review.value ? `: “${saved.review.value.subject || 'no subject'}”` : ' (empty)'}.
          Choose which one to keep.
        </p>
        <button type="button" className="button secondary" onClick={() => onResolve('local')}>
          Keep this window’s message
        </button>
        <button type="button" className="button secondary" onClick={() => onResolve('saved')}>
          Use saved message
        </button>
      </div>
    );
  if (saved.error)
    return (
      <div className="mailbox-confirm" role="alert">
        <p>{saved.error}</p>
        {!saved.ready && (
          <button type="button" className="button secondary" onClick={onRetry}>
            Retry loading saved draft
          </button>
        )}
      </div>
    );
  if (!saved.ready)
    return (
      <p className="field-help" role="status">
        Loading saved message draft…
      </p>
    );
  if (restoredAt)
    return (
      <p className="studio-notice" role="status">
        Restored an unsent message saved {new Date(restoredAt).toLocaleString()}. Use “Resume
        message draft” to finish or discard it.
      </p>
    );
  return null;
}
