import type { AutomationPullRequestView, AutomationRunRecord } from '@wrongstack/webui-protocol';
import { useEffect, useRef, useState } from 'react';
import type { EngineHttp } from './engine-http';
import { MarkdownContent } from './MarkdownContent';
import { openExternal } from './platform';

export function AutomationPublication({
  run,
  http,
}: {
  run: AutomationRunRecord;
  http: EngineHttp;
}) {
  const [view, setView] = useState<AutomationPullRequestView | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [repository, setRepository] = useState(''),
    [base, setBase] = useState('main'),
    [title, setTitle] = useState(''),
    [reviewPublish, setReviewPublish] = useState(false),
    [reviewFollowUp, setReviewFollowUp] = useState(false);
  const alive = useRef(true),
    working = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const perform = async (operation = '', body?: unknown) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const next = (await http(
        `/api/automation/runs/${run.id}/pr${operation ? `/${operation}` : ''}`,
        operation ? 'POST' : 'GET',
        body,
      )) as AutomationPullRequestView;
      if (!alive.current) return;
      setView(next);
      setOpen(true);
      setReviewPublish(false);
      setReviewFollowUp(false);
      if (!next.plan && next.suggestedTarget) {
        setRepository(next.suggestedTarget.repository);
        setBase(next.suggestedTarget.base);
        setTitle(next.suggestedTarget.title);
      }
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const checks = run.result?.validation.checks;
  const eligible =
    run.status === 'completed' &&
    run.result?.validation.status === 'passed' &&
    !!checks?.length &&
    checks.every((check) => check.exitCode === 0);
  return (
    <section className="automation-publication" aria-label="Automation pull request review">
      <header>
        <h3>Pull request workflow</h3>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void perform()}
        >
          {open ? 'Refresh publication state' : 'Review publication state'}
        </button>
      </header>
      <p>
        Prepare a reviewed patch for a draft pull request. Publication uses the engine's verified
        evidence and fingerprint checks.
      </p>
      {!eligible && (
        <p className="quiet-state">
          A completed run with independently passed checks is required to prepare a publication
          plan.
        </p>
      )}
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">Reading or updating publication state…</p>}
      {open &&
        view &&
        (view.plan ? (
          <>
            <dl>
              <dt>Repository</dt>
              <dd>{view.plan.repository}</dd>
              <dt>Base</dt>
              <dd>
                {view.plan.base} · <code>{view.plan.baseCommit}</code>
              </dd>
              <dt>Branch</dt>
              <dd>{view.plan.branch}</dd>
              <dt>Title</dt>
              <dd>{view.plan.title}</dd>
              {view.plan.target && (
                <>
                  <dt>Existing pull request</dt>
                  <dd>
                    #{view.plan.target.number} · <code>{view.plan.target.headCommit}</code>
                  </dd>
                </>
              )}
            </dl>
            <h4>Reviewed files</h4>
            <ul>
              {view.plan.files.map((file) => (
                <li key={file}>
                  <code>{file}</code>
                </li>
              ))}
            </ul>
            <details>
              <summary>Publication evidence and identity</summary>
              <MarkdownContent text={view.plan.body} />
              <dl>
                <dt>Plan fingerprint</dt>
                <dd>
                  <code>{view.plan.fingerprint}</code>
                </dd>
                <dt>Patch SHA-256</dt>
                <dd>
                  <code>{view.plan.patchSha256}</code>
                </dd>
                <dt>Verification SHA-256</dt>
                <dd>
                  <code>{view.plan.verificationSha256}</code>
                </dd>
                <dt>Source / candidate tree</dt>
                <dd>
                  <code>
                    {view.plan.sourceTree} / {view.plan.candidateTree}
                  </code>
                </dd>
              </dl>
            </details>
            {view.receipt ? (
              <div className="feature-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    void openExternal(view.receipt!.url).catch((error) => setError(String(error)))
                  }
                >
                  Open draft PR #{view.receipt.number}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void perform('check', {})}
                >
                  Check publication CI
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="button primary"
                disabled={busy || !eligible}
                onClick={() => setReviewPublish(true)}
              >
                {view.plan.target ? 'Review pull request update' : 'Review draft PR publication'}
              </button>
            )}
            {reviewPublish && (
              <div className="automation-leave" role="alert">
                <h4>
                  {view.plan.target
                    ? 'Update this pull request?'
                    : 'Publish this draft pull request?'}
                </h4>
                <p>
                  The engine will push the reviewed branch and{' '}
                  {view.plan.target
                    ? 'update the existing pull request'
                    : 'create a draft pull request'}{' '}
                  in {view.plan.repository}. Only the displayed plan fingerprint is accepted.
                </p>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setReviewPublish(false)}
                >
                  Keep plan unpublished
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => void perform('publish', { fingerprint: view.plan!.fingerprint })}
                >
                  Publish reviewed plan
                </button>
              </div>
            )}
            {view.ci && (
              <section>
                <h4>Published commit checks · {view.ci.status}</h4>
                <p>
                  <code>{view.ci.commit}</code> · checked{' '}
                  {new Date(view.ci.checkedAt).toLocaleString()}
                </p>
                {view.ci.checks.map((check, index) => (
                  <article key={index}>
                    <strong>{check.name}</strong>
                    <p>{check.conclusion ?? check.status}</p>
                    {check.details && <pre className="automation-run-log">{check.details}</pre>}
                  </article>
                ))}
                {view.ci.status === 'failed' && view.ci.fingerprint && !view.followUpRunId && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setReviewFollowUp(true)}
                  >
                    Review CI follow-up run
                  </button>
                )}
                {reviewFollowUp && (
                  <div className="automation-leave" role="alert">
                    <p>
                      Queue a follow-up for the displayed failed CI evidence? The worker may run a
                      new model task using the saved job.
                    </p>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setReviewFollowUp(false)}
                    >
                      Keep current run
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        void perform('follow-up', { fingerprint: view.ci!.fingerprint })
                      }
                    >
                      Queue reviewed follow-up
                    </button>
                  </div>
                )}
              </section>
            )}
            {view.followUpRunId && (
              <p role="status">
                Follow-up queued: <code>{view.followUpRunId}</code>
              </p>
            )}
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform('prepare', { repository, base, title });
            }}
          >
            <fieldset disabled={busy || !eligible}>
              <legend>Prepare a publication plan</legend>
              <label>
                Repository
                <input
                  aria-label="Automation PR repository"
                  required
                  placeholder="owner/repository"
                  value={repository}
                  onChange={(event) => setRepository(event.target.value)}
                />
              </label>
              <label>
                Base branch
                <input
                  aria-label="Automation PR base"
                  required
                  value={base}
                  onChange={(event) => setBase(event.target.value)}
                />
              </label>
              <label>
                Pull request title
                <input
                  aria-label="Automation PR title"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <button type="submit" className="button secondary">
                Prepare reviewed publication plan
              </button>
            </fieldset>
          </form>
        ))}
    </section>
  );
}
