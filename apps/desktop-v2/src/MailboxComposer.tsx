import { Send, X } from 'lucide-react';
import { useState } from 'react';
import { MarkdownContent } from './MarkdownContent';
import { Modal } from './Modal';
import { emptyMailDraft, type MailDraft, mailboxSendTypes } from './mailbox-model';

export function MailboxComposer({
  draft,
  setDraft,
  busy,
  replacement,
  setReplacement,
  setComposing,
  send,
  displayedError,
}: {
  draft: MailDraft;
  setDraft: (draft: MailDraft) => void;
  busy: boolean;
  replacement: MailDraft | null;
  setReplacement: (draft: MailDraft | null) => void;
  setComposing: (value: boolean) => void;
  send: () => void;
  displayedError: string;
}) {
  const [preview, setPreview] = useState(false);
  const [discard, setDiscard] = useState(false);
  return (
    <Modal
      onClose={() => {
        if (busy) return;
        setComposing(false);
        setReplacement(null);
        setDiscard(false);
      }}
    >
      <header>
        <div>
          <span className="eyebrow">PROJECT MAILBOX</span>
          <h2 id="dialog-title">{draft.replyTo ? 'Reply to message' : 'Compose message'}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close mailbox composer"
          disabled={busy}
          onClick={() => {
            setComposing(false);
            setReplacement(null);
          }}
        >
          <X size={16} />
        </button>
      </header>
      <form
        className="mailbox-composer"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <p>
          Your unsent message is saved for this project and restored after a restart. Closing this
          window does not send it; it is removed after a confirmed send or a discard.
        </p>
        <p>
          Named recipients target an agent. This project workspace does not bind messages to a
          conversation; the leader alias can reach project leaders.
        </p>
        {replacement && (
          <div className="mailbox-confirm">
            <p>Replace the current message draft with this reply?</p>
            <button type="button" className="button secondary" onClick={() => setReplacement(null)}>
              Keep current message draft
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setDraft(replacement);
                setReplacement(null);
              }}
            >
              Replace message draft
            </button>
          </div>
        )}
        <fieldset disabled={busy || !!replacement}>
          <div className="mailbox-controls">
            <label>
              To
              <input
                aria-label="Mailbox recipient"
                required
                value={draft.type === 'broadcast' ? '*' : draft.to}
                disabled={draft.type === 'broadcast'}
                list="mailbox-actors"
                onChange={(event) => setDraft({ ...draft, to: event.target.value })}
              />
            </label>
            <label>
              Type
              <select
                aria-label="Mailbox message type"
                value={draft.type}
                onChange={(event) => setDraft({ ...draft, type: event.target.value })}
              >
                {mailboxSendTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mailbox-controls">
            <label>
              Priority
              <select
                aria-label="Mailbox priority"
                value={draft.priority}
                onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
              >
                {['low', 'normal', 'high'].map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label>
              Audience
              <select
                aria-label="Mailbox audience"
                value={draft.audience}
                onChange={(event) => setDraft({ ...draft, audience: event.target.value })}
              >
                <option value="all">All eligible recipients</option>
                <option value="leaders">Leaders only</option>
              </select>
            </label>
          </div>
          <label>
            Subject
            <input
              aria-label="Mailbox subject"
              required
              value={draft.subject}
              onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
            />
          </label>
          <label>
            Message
            <textarea
              aria-label="Mailbox message body"
              required
              rows={8}
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
          </label>
          <label className="provider-checkbox">
            <input
              type="checkbox"
              checked={preview}
              onChange={(event) => setPreview(event.target.checked)}
            />
            Preview message
          </label>
          {preview && <MarkdownContent text={draft.body} />}
          {draft.replyTo && <small>Reply reference: {draft.replyTo}</small>}
        </fieldset>
        {displayedError && (
          <p role="alert" className="session-error">
            {displayedError}
          </p>
        )}
        {discard ? (
          <div className="mailbox-confirm">
            <p>Discard this unsent message?</p>
            <button type="button" className="button secondary" onClick={() => setDiscard(false)}>
              Keep message draft
            </button>
            <button
              type="button"
              className="button secondary danger"
              onClick={() => {
                setDraft(emptyMailDraft());
                setDiscard(false);
                setComposing(false);
              }}
            >
              Confirm discard message draft
            </button>
          </div>
        ) : (
          <footer>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setDiscard(true)}
            >
              Discard message draft
            </button>
            <button type="submit" className="button primary" disabled={busy || !!replacement}>
              <Send size={14} />
              {busy ? 'Recording…' : 'Send mailbox message'}
            </button>
          </footer>
        )}
      </form>
    </Modal>
  );
}
