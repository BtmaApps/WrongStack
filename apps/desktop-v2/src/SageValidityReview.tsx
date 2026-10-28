import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { readSageSourceReview, type SageSourceReview } from './sage-validity-review-model';

export function SageValidityReview({
  memory,
  command,
}: {
  memory: Record<string, unknown>;
  command: EngineCommand;
}) {
  const [review, setReview] = useState<SageSourceReview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    setReview(null);
    setError('');
    setBusy(false);
    generation.current++;
    return () => {
      generation.current++;
    };
  }, [memory['id'], memory['revision'], command]);
  const check = async () => {
    const version = ++generation.current;
    setBusy(true);
    setError('');
    setReview(null);
    try {
      const reply = await command(
        'memory.sage.get',
        { id: memory['id'], reviewValidity: true, expectedRevision: memory['revision'] },
        ['memory.sage.get'],
        { timeoutMs: 15000 },
      );
      if (generation.current === version) setReview(readSageSourceReview(reply, memory));
    } catch (error) {
      if (generation.current === version)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (generation.current === version) setBusy(false);
    }
  };
  return (
    <section className="sage-validity-review" aria-label="SAGE source evidence review">
      <header>
        <h3>
          <ShieldCheck size={14} /> Source evidence
        </h3>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => {
            void check();
          }}
        >
          <RefreshCw size={13} />
          {busy ? 'Checking current files…' : 'Check current sources'}
        </button>
      </header>
      <p>
        Review the saved literal checks against current project files. This does not establish the
        memory's overall applicability or change its lifecycle.
      </p>
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {review && (
        <>
          <p role="status">
            Source snapshot · revision {review.observedRevision} ·{' '}
            {new Date(review.checkedAt).toLocaleString()}
          </p>
          {!review.checks.length && (
            <p>No literal source checks configured. Applicability still needs human review.</p>
          )}
          {review.checks.map((check, index) => (
            <article
              className={`sage-validity-result ${check.status}`}
              key={index}
              aria-label={`Source check ${index + 1}`}
            >
              <header>
                <strong>{check.path}</strong>
                <span>
                  {check.status === 'satisfied'
                    ? 'Literal found'
                    : check.status === 'not_satisfied'
                      ? 'Literal missing'
                      : 'Unknown'}
                </span>
              </header>
              <pre>{check.text}</pre>
              {check.status === 'unknown' && (
                <p>
                  The source check could not be established. Unreadable, large or unavailable
                  sources may remain unknown.
                </p>
              )}
              {check.sourceHash && (
                <details>
                  <summary>Source fingerprint</summary>
                  <code>{check.sourceHash}</code>
                </details>
              )}
            </article>
          ))}
          <p className="field-help">
            Current files can change after this snapshot. The applicability statement always remains
            a human judgement.
          </p>
        </>
      )}
    </section>
  );
}
