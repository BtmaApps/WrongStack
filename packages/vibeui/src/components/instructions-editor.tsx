'use client';

import { useEffect, useState } from 'react';
import { text } from '../lib/session';
import { usePanelRequests } from '../lib/use-panel-requests';
import type { SessionController } from '../lib/use-session';
import { Modal } from './dialogs';

export function InstructionsEditor({
  controller,
  onClose,
}: {
  controller: SessionController;
  onClose: () => void;
}) {
  const { request, busy, error } = usePanelRequests(controller);
  const [document, setDocument] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const load = async () => {
    const p = await request('user_instructions.get', {}, 'user_instructions');
    if (p && !p.error) {
      setDocument(p);
      setDraft(text(p.text));
      setSaved(false);
    }
  };
  useEffect(() => {
    let live = true;
    void request('user_instructions.get', {}, 'user_instructions').then((p) => {
      if (live && p && !p.error) {
        setDocument(p);
        setDraft(text(p.text));
      }
    });
    return () => {
      live = false;
    };
  }, [request]);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Personal instructions"
      description="Your global WrongStack instructions apply to every project from the next turn. Changes are saved only when you choose Save."
      wide
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="fine-print">
          Waiting for the server…
        </p>
      )}
      {saved && (
        <p role="status" className="fine-print">
          Instructions saved.
        </p>
      )}
      <form
        className="instructions-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaved(false);
          const p = await request(
            'user_instructions.save',
            { text: draft, baseMtimeMs: document?.mtimeMs ?? null },
            'user_instructions',
          );
          if (p?.saved === true && !p.error) {
            setDocument(p);
            setDraft(text(p.text));
            setSaved(true);
          }
        }}
      >
        <label htmlFor="personal-instructions">Global instructions</label>
        <textarea
          id="personal-instructions"
          aria-label="Personal instructions text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
          rows={14}
          spellCheck={false}
          disabled={!document}
        />
        <div className="hub-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={
              busy || !document || controller.connection !== 'open' || draft === text(document.text)
            }
          >
            Save instructions
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || controller.connection !== 'open'}
            onClick={() => void load()}
          >
            Reload saved version
          </button>
        </div>
        <p className="fine-print">
          Reload replaces the draft above. Concurrent changes are checked by the backend before
          saving.
        </p>
      </form>
    </Modal>
  );
}
