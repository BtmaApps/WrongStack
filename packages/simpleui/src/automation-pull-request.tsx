import { type AutomationPullRequestView, automationRequest } from '@wrongstack/webui-protocol';
import { useEffect, useRef, useState } from 'react';

const labels = {
  followUp: 'Queue CI repair',
  queued: 'CI repair queued',
  updatePR: 'Publish verified update to the same PR',
  targetPR: 'Existing PR and expected head',
  heading: 'Draft pull request',
  review: 'Review draft PR',
  repository: 'PR repository',
  base: 'PR base branch',
  title: 'PR title',
  branch: 'Publication branch',
  prepareHint: 'Prepare locally, then review the target, changes and verification evidence.',
  prepare: 'Prepare PR plan',
  evidence: 'Verification and publication plan',
  publish: 'Publish draft PR to GitHub',
  openPR: 'Open draft PR',
  check: 'Refresh CI',
  ci: 'Observed CI',
  ciHint:
    'Shows checks for the published commit. No checks means unknown; this does not certify branch protection or merge readiness.',
};

export function AutomationPullRequestPanel({
  runId,
  sessionId,
}: {
  runId: string;
  sessionId?: string | undefined;
}) {
  const label = (key: keyof typeof labels) => labels[key];
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AutomationPullRequestView | null>(null);
  const [repository, setRepository] = useState('');
  const [base, setBase] = useState('main');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  useEffect(() => {
    sequence.current++;
    setOpen(false);
    setView(null);
    setBusy(false);
    setError('');
    return () => {
      sequence.current++;
    };
  }, [runId, sessionId]);
  async function perform(operation = '', body?: unknown) {
    const current = ++sequence.current;
    setBusy(true);
    setError('');
    try {
      const next = await automationRequest<AutomationPullRequestView>(
        `runs/${runId}/pr${operation ? `/${operation}` : ''}`,
        operation ? 'POST' : 'GET',
        body,
        undefined,
        sessionId,
      );
      if (current === sequence.current) {
        setView(next);
        if (!next.plan && next.suggestedTarget) {
          setRepository(next.suggestedTarget.repository);
          setBase(next.suggestedTarget.base);
          setTitle(next.suggestedTarget.title);
        }
        setOpen(true);
      }
    } catch (reason) {
      if (current === sequence.current)
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  }
  return (
    <section className="automation-pr" aria-label={label('heading')}>
      {!open && (
        <button type="button" disabled={busy} onClick={() => void perform()}>
          {label('review')}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {open && (
        <>
          <h4>{label('heading')}</h4>
          {!view?.plan ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform('prepare', { repository, base, title });
              }}
            >
              <label>
                {label('repository')}
                <input
                  required
                  value={repository}
                  onChange={(event) => setRepository(event.target.value)}
                  placeholder="owner/repo"
                />
              </label>
              <label>
                {label('base')}
                <input required value={base} onChange={(event) => setBase(event.target.value)} />
              </label>
              <label>
                {label('title')}
                <input
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <p>{label('prepareHint')}</p>
              <button type="submit" disabled={busy}>
                {label('prepare')}
              </button>
            </form>
          ) : (
            <>
              <dl className="break-all">
                {view.plan.target && (
                  <>
                    <dt>{label('targetPR')}</dt>
                    <dd>
                      #{view.plan.target.number} · {view.plan.target.headCommit}
                    </dd>
                  </>
                )}
                <dt>{label('repository')}</dt>
                <dd>{view.plan.repository}</dd>
                <dt>{label('base')}</dt>
                <dd>
                  {view.plan.base} · {view.plan.baseCommit}
                </dd>
                <dt>{label('branch')}</dt>
                <dd>{view.plan.branch}</dd>
                <dt>{label('title')}</dt>
                <dd>{view.plan.title}</dd>
              </dl>
              <ul>
                {view.plan.files.map((file) => (
                  <li className="break-all" key={file}>
                    {file}
                  </li>
                ))}
              </ul>
              <details>
                <summary>{label('evidence')}</summary>
                <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{view.plan.body}</p>
                <code style={{ overflowWrap: 'anywhere' }}>{view.plan.fingerprint}</code>
              </details>
              {!view.receipt ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void perform('publish', { fingerprint: view.plan!.fingerprint })}
                >
                  {label(view.plan.target ? 'updatePR' : 'publish')}
                </button>
              ) : (
                <div className="automation-pr-actions">
                  <a href={view.receipt.url} target="_blank" rel="noreferrer">
                    {label('openPR')} #{view.receipt.number}
                  </a>
                  <button type="button" disabled={busy} onClick={() => void perform('check', {})}>
                    {label('check')}
                  </button>
                </div>
              )}
              {view.ci && (
                <div role="status">
                  <p>
                    {label('ci')}: {view.ci.status} · <code>{view.ci.commit.slice(0, 12)}</code>
                  </p>
                  <ul>
                    {view.ci.checks.slice(0, 20).map((check, index) => (
                      <li key={`${check.name}:${index}`}>
                        {check.name}: {check.conclusion ?? check.status}
                        {check.details && (
                          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                            {check.details}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p>{label('ciHint')}</p>
                  {view.ci.status === 'failed' && view.ci.fingerprint && !view.followUpRunId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void perform('follow-up', { fingerprint: view.ci!.fingerprint })
                      }
                    >
                      {label('followUp')}
                    </button>
                  )}
                </div>
              )}
              {view.followUpRunId && (
                <p role="status">
                  {label('queued')}:{' '}
                  <code style={{ overflowWrap: 'anywhere' }}>{view.followUpRunId}</code>
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
