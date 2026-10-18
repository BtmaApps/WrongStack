'use client';

import { preserveSkillMentions } from '@wrongstack/webui-protocol';
import { WandSparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { clientId } from '../lib/ids';
import { record, text } from '../lib/session';
import type { SessionController } from '../lib/use-session';
import { CodePanel } from './code-panel';
import { Modal } from './dialogs';
import { usePresentation } from './presentation-mode';
import { RunSignal } from './vibe-visuals';

export function PromptRefiner({
  original,
  controller,
  onClose,
  onApply,
}: {
  original: string;
  controller: SessionController;
  onClose: () => void;
  onApply: (value: string) => void;
}) {
  const { state, connection, send, subscribe } = controller;
  const { mode } = usePresentation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refined, setRefined] = useState('');
  const [english, setEnglish] = useState('');
  const [usedModel, setUsedModel] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const requestId = clientId();
    setLoading(true);
    setError('');
    setRefined('');
    setEnglish('');
    setUsedModel('');
    const timer = setTimeout(() => {
      setLoading(false);
      setError('Refinement timed out. Your original draft is preserved.');
    }, 75_000);
    const off = subscribe((frame) => {
      if (frame.type !== 'model.refine_result') return;
      const p = record(frame.payload);
      if (p.sessionId !== state.id || p.requestId !== requestId) return;
      clearTimeout(timer);
      setLoading(false);
      if (text(p.error)) {
        setError(text(p.error));
        return;
      }
      setRefined(text(p.refined));
      setEnglish(text(p.english));
      setUsedModel(
        [text(record(p.refinedWith).provider), text(record(p.refinedWith).model)]
          .filter(Boolean)
          .join(' / '),
      );
      if (!text(p.refined).trim() && !text(p.english).trim())
        setError('The refiner returned no text. Your draft is preserved.');
    });
    if (
      !send('model.refine', { sessionId: state.id, requestId, text: original, timeoutMs: 60_000 })
    ) {
      clearTimeout(timer);
      setLoading(false);
      setError('Reconnect to refine this prompt.');
    }
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [original, state.id, retry, send, subscribe]);
  const apply = (value: string) => {
    onApply(preserveSkillMentions(original, value));
    onClose();
  };
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Refine your prompt"
      icon={<WandSparkles size={20} />}
      detailToggle
      description="Review and edit before returning a version to your draft. Nothing is sent to the agent automatically."
      wide
    >
      <details className="refiner-original" key={mode} open={mode === 'extended'}>
        <summary>Original prompt</summary>
        <CodePanel label="Original prompt" value={original} />
      </details>
      {loading && (
        <div className="refiner-loading" role="status">
          <RunSignal />
          <span>
            <strong>Refining your draft</strong>
            <small>
              Using your configured refiner or current model. Your original stays available.
            </small>
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!loading && !error && (
        <div className="refiner-versions">
          <label>
            Refined
            <textarea
              aria-label="Refined prompt"
              value={refined}
              onChange={(event) => setRefined(event.target.value)}
              rows={7}
            />
            <button
              type="button"
              className="primary-button"
              disabled={!refined.trim()}
              onClick={() => apply(refined)}
            >
              Use refined
            </button>
          </label>
          <label>
            English
            <textarea
              aria-label="English prompt"
              value={english}
              onChange={(event) => setEnglish(event.target.value)}
              rows={7}
            />
            <button
              type="button"
              className="secondary-button"
              disabled={!english.trim()}
              onClick={() => apply(english)}
            >
              Use English
            </button>
          </label>
        </div>
      )}
      {usedModel && <p className="fine-print">Refined with {usedModel}</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Keep original
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={connection !== 'open' || loading}
          onClick={() => setRetry((value) => value + 1)}
        >
          Try again
        </button>
      </div>
    </Modal>
  );
}
