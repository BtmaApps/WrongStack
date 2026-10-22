import {
  VERSIONED_AUTOMATION_TEMPLATES as AUTOMATION_TEMPLATES,
  type AutomationJobInput,
  type AutomationJobRecord,
  type AutomationPreview,
  type AutomationStateView,
  automationRequest,
  editableAutomationJob,
  exportAutomationJob,
  formatAutomationCommands,
  createAutomationJobInput as freshJob,
  importAutomationJob,
  parseAutomationCommands,
} from '@wrongstack/webui-protocol';
import { useEffect, useRef, useState } from 'react';
import './automation.css';
import { parseUnifiedDiff } from '@wrongstack/tools/tool-diff';
import { AutomationPullRequestPanel } from './automation-pull-request.js';
import { AutomationRunResult, AutomationVerificationFields } from './automation-run-parts.js';

export function AutomationWorkspace({ sessionId }: { sessionId?: string | undefined } = {}) {
  const request = <T,>(route: string, method = 'GET', body?: unknown, signal?: AbortSignal) =>
    automationRequest<T>(route, method, body, signal, sessionId);
  const [state, setState] = useState<AutomationStateView | null>(null);
  const [spec, setSpec] = useState<AutomationJobInput>(freshJob);
  const [editing, setEditing] = useState<{ id: string; revision: number } | null>(null);
  const [credentialText, setCredentialText] = useState('');
  const [verificationText, setVerificationText] = useState('');
  const [eventText, setEventText] = useState('');
  const [preview, setPreview] = useState<AutomationPreview | null>(null);
  const [artifact, setArtifact] = useState('');
  const [portable, setPortable] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(false);
  const previewSequence = useRef(0);
  const artifactSequence = useRef(0);
  const refresh = async () => {
    const next = await request<AutomationStateView>('state');
    if (alive.current) setState(next);
  };
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    void request<AutomationStateView>('state', 'GET', undefined, abort.signal)
      .then(setState)
      .catch((cause) => {
        if (!abort.signal.aborted) setError(String(cause));
      });
    const timer = setInterval(() => {
      void refresh().catch(() => {
        /* Keep the last state during a transient disconnect. */
      });
    }, 5000);
    return () => {
      alive.current = false;
      abort.abort();
      clearInterval(timer);
    };
  }, []);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const change = <K extends keyof AutomationJobInput>(key: K, value: AutomationJobInput[K]) => {
    previewSequence.current++;
    setPreview(null);
    setSpec((current) => ({ ...current, [key]: value }));
  };
  const payload = () => {
    const credentials = credentialText.trim()
      ? credentialText.split(',').map((item) => {
          const [destination, ...reference] = item.trim().split('=');
          const [profile, provider, ...label] = reference.join('=').split('/');
          if (!destination || !profile || !provider || !label.length)
            throw new Error('Use ENV=profile/provider/key-label for credentials');
          return { envName: destination, profile, provider, keyLabel: label.join('/') };
        })
      : undefined;
    return {
      spec: {
        ...spec,
        envNames: spec.envNames.map((name) => name.trim()).filter(Boolean),
        credentials,
        verification: verificationText.trim()
          ? {
              commands: parseAutomationCommands(verificationText),
              timeoutMs: spec.verification?.timeoutMs ?? 300_000,
            }
          : undefined,
        github: spec.github?.repository.trim()
          ? {
              ...spec.github,
              events: spec.github.events.map((event) => event.trim()).filter(Boolean),
            }
          : undefined,
      },
      ...(eventText.trim() ? { event: JSON.parse(eventText) as unknown } : {}),
    };
  };
  const edit = (job?: AutomationJobRecord) => {
    previewSequence.current++;
    setPreview(null);
    setError('');
    setSpec(job ? editableAutomationJob(job) : freshJob());
    setEditing(job ? { id: job.id, revision: job.revision ?? 1 } : null);
    setVerificationText(formatAutomationCommands(job?.verification?.commands ?? []));
    setCredentialText(
      job?.credentials
        ?.map((ref) => `${ref.envName}=${ref.profile}/${ref.provider}/${ref.keyLabel}`)
        .join(',') ?? '',
    );
    setEventText('');
  };
  const github = spec.github ?? {
    repository: '',
    events: ['issue_comment.created'],
    secretEnv: 'GITHUB_WEBHOOK_SECRET',
  };
  const schedule = spec.schedule ? 'cron' : spec.intervalMs ? 'interval' : 'manual';
  return (
    <section className="automation-workspace" aria-label="Automations">
      <header>
        <div>
          <h1>Automations</h1>
          <p>Jobs run in copied Docker workspaces and return patches for review.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => edit()}>
          New job
        </button>
        <button type="button" disabled={busy} onClick={() => void perform(refresh)}>
          Refresh
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>Import / export a job</summary>
        <label>
          Portable job JSON
          <textarea
            rows={5}
            value={portable}
            onChange={(event) => setPortable(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const imported = importAutomationJob(JSON.parse(portable));
              await request('preview', 'POST', { spec: imported });
              if (alive.current)
                edit({ ...imported, id: '', projectRoot: '', createdAt: 0, nextRunAt: null });
              if (alive.current) setEditing(null);
            })
          }
        >
          Load for review
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const document = exportAutomationJob(payload().spec);
              await request('preview', 'POST', { spec: document.spec });
              if (alive.current) setPortable(JSON.stringify(document, null, 2));
            })
          }
        >
          Export current definition
        </button>
        <p>
          Imports start disabled and require local review. Only credential references are portable.
        </p>
      </details>
      {state && !state.workerOnline && (
        <p role="status">
          Worker offline. Jobs stay queued. Start <code>wstack automation serve</code> on this
          machine to execute them.
        </p>
      )}
      <div className="automation-columns">
        <aside aria-label="Saved jobs">
          {!state ? (
            <p>Loading jobs…</p>
          ) : state.jobs.length === 0 ? (
            <p>No jobs in this project.</p>
          ) : (
            state.jobs.map((job) => (
              <article key={job.id}>
                <h2>{job.name}</h2>
                <p>
                  {job.enabled ? 'Enabled' : 'Disabled'} ·{' '}
                  {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : 'Manual / events'}
                </p>
                <button type="button" disabled={busy} onClick={() => edit(job)}>
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy || !job.enabled}
                  onClick={() =>
                    void perform(async () => {
                      await request(`jobs/${job.id}/run`, 'POST', {
                        expectedRevision: job.revision ?? 1,
                      });
                      await refresh();
                    })
                  }
                >
                  Run now
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await request(`jobs/${job.id}/enabled`, 'POST', {
                        enabled: !job.enabled,
                        expectedRevision: job.revision ?? 1,
                      });
                      await refresh();
                    })
                  }
                >
                  {job.enabled ? 'Disable' : 'Enable'}
                </button>
              </article>
            ))
          )}
        </aside>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              const body = payload();
              const job = await request<AutomationJobRecord>(
                editing ? `jobs/${editing.id}` : 'jobs',
                editing ? 'PUT' : 'POST',
                { spec: body.spec, expectedRevision: editing?.revision },
              );
              if (alive.current) edit(job);
              await refresh();
            });
          }}
        >
          <h2>{editing ? 'Edit job' : 'Create job'}</h2>
          <label>
            Starting template
            <select
              aria-label="Starting template"
              value=""
              onChange={(event) => {
                const template = AUTOMATION_TEMPLATES[Number(event.target.value)];
                if (template) {
                  change('prompt', template.prompt);
                  change('name', template.name);
                  change('template', { id: template.id, version: template.version });
                }
              }}
            >
              <option value="" disabled>
                Choose a starting point
              </option>
              {AUTOMATION_TEMPLATES.map((template, index) => (
                <option key={template.name} value={index}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          {spec.template && (
            <p>
              Template: {spec.template.id} v{spec.template.version}. Required setup:{' '}
              {AUTOMATION_TEMPLATES.find(
                (item) => item.id === spec.template?.id,
              )?.requirements.join('; ')}
              .
            </p>
          )}
          <AutomationJobFields
            spec={spec}
            onChange={change}
            onEnvironmentChange={(environment) => {
              previewSequence.current++;
              setPreview(null);
              setSpec((current) => ({
                ...current,
                environment,
                image: environment?.image ?? current.image,
              }));
            }}
          />
          <div className="automation-fields">
            <label>
              Provider
              <input
                value={spec.provider ?? ''}
                onChange={(event) => change('provider', event.target.value || undefined)}
              />
            </label>
            <label>
              Model
              <input
                value={spec.model ?? ''}
                onChange={(event) => change('model', event.target.value || undefined)}
              />
            </label>
          </div>
          <label>
            Schedule
            <select
              aria-label="Schedule"
              value={schedule}
              onChange={(event) => {
                previewSequence.current++;
                setPreview(null);
                setSpec((current) => ({
                  ...current,
                  intervalMs: event.target.value === 'interval' ? 86400_000 : undefined,
                  schedule:
                    event.target.value === 'cron'
                      ? { type: 'cron', expression: '0 9 * * 1-5', timezone: 'UTC' }
                      : undefined,
                }));
              }}
            >
              <option value="manual">Manual / events</option>
              <option value="interval">Fixed interval</option>
              <option value="cron">Calendar schedule</option>
            </select>
          </label>
          {schedule === 'interval' && (
            <label>
              Interval in seconds
              <input
                type="number"
                min={60}
                value={(spec.intervalMs ?? 60_000) / 1000}
                onChange={(event) => change('intervalMs', Number(event.target.value) * 1000)}
              />
            </label>
          )}
          {spec.schedule && (
            <div className="automation-fields">
              <label>
                Cron expression
                <input
                  value={spec.schedule.expression}
                  onChange={(event) =>
                    change('schedule', { ...spec.schedule!, expression: event.target.value })
                  }
                />
              </label>
              <label>
                Timezone
                <input
                  value={spec.schedule.timezone}
                  onChange={(event) =>
                    change('schedule', { ...spec.schedule!, timezone: event.target.value })
                  }
                />
              </label>
            </div>
          )}
          <details>
            <summary>Credentials and execution limits</summary>
            <AutomationVerificationFields
              commands={verificationText}
              timeoutMs={spec.verification?.timeoutMs ?? 300_000}
              onCommandsChange={(text) => {
                previewSequence.current++;
                setPreview(null);
                setVerificationText(text);
              }}
              onTimeoutChange={(timeoutMs) =>
                change('verification', {
                  commands: spec.verification?.commands ?? [],
                  timeoutMs,
                })
              }
            />
            <label>
              Environment names
              <input
                placeholder="OPENAI_API_KEY"
                value={spec.envNames.join(',')}
                onChange={(event) => change('envNames', event.target.value.split(','))}
              />
            </label>
            <label>
              Saved credential references
              <input
                placeholder="OPENAI_API_KEY=default/openai/work"
                value={credentialText}
                onChange={(event) => {
                  previewSequence.current++;
                  setPreview(null);
                  setCredentialText(event.target.value);
                }}
              />
            </label>
            <div className="automation-fields">
              <label>
                Timeout in seconds
                <input
                  type="number"
                  min={1}
                  max={86400}
                  value={spec.timeoutMs / 1000}
                  onChange={(event) => change('timeoutMs', Number(event.target.value) * 1000)}
                />
              </label>
              <label>
                Maximum iterations
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={spec.maxIterations ?? 40}
                  onChange={(event) => change('maxIterations', Number(event.target.value))}
                />
              </label>
            </div>
            <label className="automation-check">
              <input
                type="checkbox"
                checked={spec.yolo}
                onChange={(event) => change('yolo', event.target.checked)}
              />
              Allow unattended tool execution in the container
            </label>
          </details>
          <details>
            <summary>GitHub events and conditions</summary>
            <label>
              Repository
              <input
                placeholder="owner/repo"
                value={github.repository}
                onChange={(event) =>
                  change('github', { ...github, repository: event.target.value })
                }
              />
            </label>
            <label>
              Events
              <input
                value={github.events.join(',')}
                onChange={(event) =>
                  change('github', {
                    ...github,
                    events: event.target.value.split(','),
                  })
                }
              />
            </label>
            <label>
              Webhook secret environment name
              <input
                value={github.secretEnv}
                onChange={(event) => change('github', { ...github, secretEnv: event.target.value })}
              />
            </label>
            {(['mention', 'label', 'branch', 'conclusion'] as const).map((key) => (
              <label key={key}>
                {key}
                <input
                  value={github.filters?.[key] ?? ''}
                  onChange={(event) =>
                    change('github', {
                      ...github,
                      filters: { ...github.filters, [key]: event.target.value || undefined },
                    })
                  }
                />
              </label>
            ))}
            <label className="automation-check">
              <input
                type="checkbox"
                checked={github.filters?.excludeBots ?? false}
                onChange={(event) =>
                  change('github', {
                    ...github,
                    filters: { ...github.filters, excludeBots: event.target.checked },
                  })
                }
              />
              Ignore bot events
            </label>
            <label className="automation-check">
              <input
                type="checkbox"
                checked={github.filters?.draft === false}
                onChange={(event) =>
                  change('github', {
                    ...github,
                    filters: { ...github.filters, draft: event.target.checked ? false : undefined },
                  })
                }
              />
              Exclude draft PRs
            </label>
            <label>
              Sample webhook payload
              <textarea
                rows={3}
                value={eventText}
                onChange={(event) => {
                  previewSequence.current++;
                  setPreview(null);
                  setEventText(event.target.value);
                }}
              />
            </label>
          </details>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const sequence = ++previewSequence.current;
                  const result = await request<AutomationPreview>('preview', 'POST', payload());
                  if (alive.current && previewSequence.current === sequence) setPreview(result);
                })
              }
            >
              Preview
            </button>
            <button type="submit" disabled={busy}>
              {editing ? 'Save changes' : 'Create job'}
            </button>
          </div>
          {preview && (
            <div role="status">
              <h3>Next scheduled runs</h3>
              {preview.nextRunTimes.length ? (
                <ul>
                  {preview.nextRunTimes.map((time) => (
                    <li key={time}>
                      {new Date(time).toLocaleString(undefined, {
                        timeZone: spec.schedule?.timezone,
                        timeZoneName: 'short',
                      })}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Manual or event-triggered.</p>
              )}
              {preview.missingReferences.length > 0 && (
                <p>Missing credentials: {preview.missingReferences.join(', ')}</p>
              )}
              {preview.filterPreview && (
                <p>
                  Sample event:{' '}
                  {preview.filterPreview.matches
                    ? 'matches'
                    : `does not match (${preview.filterPreview.reasons.join(', ')})`}
                </p>
              )}
              <p>Preview starts no container or model request.</p>
            </div>
          )}
        </form>
      </div>
      <section aria-label="Run history">
        <h2>Run history</h2>
        <p>
          Completed means execution and patch export succeeded. Independent check results are
          reported separately, with their saved evidence.
        </p>
        {state?.runs
          .slice()
          .reverse()
          .slice(0, 50)
          .map((run) => (
            <article key={run.id}>
              <strong>{state.jobs.find((job) => job.id === run.jobId)?.name ?? run.jobId}</strong> ·{' '}
              {run.status} · {run.subjectKey} · {new Date(run.createdAt).toLocaleString()}
              {run.error && <p>{run.error}</p>}
              {run.result && <AutomationRunResult result={run.result} />}
              {run.job?.environment && (
                <AutomationEnvironmentRun
                  runId={run.id}
                  sessionId={sessionId}
                  running={run.status === 'running'}
                />
              )}
              {run.status === 'completed' && run.result?.validation.status === 'passed' && (
                <AutomationPullRequestPanel runId={run.id} sessionId={sessionId} />
              )}
              {(run.status === 'queued' || run.status === 'running') && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await request(`runs/${run.id}/cancel`, 'POST');
                      await refresh();
                    })
                  }
                >
                  Cancel run
                </button>
              )}
              {(
                [
                  'changes.patch',
                  'output.log',
                  'run.json',
                  ...(run.result?.validation.evidence.includes('verification.log')
                    ? (['verification.log', 'verification.json'] as const)
                    : []),
                ] as const
              ).map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      const sequence = ++artifactSequence.current;
                      const result = await request<{ content: string }>(
                        `runs/${run.id}/artifact?name=${name}`,
                      );
                      if (alive.current && sequence === artifactSequence.current)
                        setArtifact(`${name}\n\n${result.content}`);
                    })
                  }
                >
                  {name === 'changes.patch'
                    ? 'View patch'
                    : name === 'run.json'
                      ? 'View result JSON'
                      : 'View log'}
                </button>
              ))}
            </article>
          ))}
      </section>
      {artifact && (
        <section aria-label="Run artifact">
          <button
            type="button"
            onClick={() => {
              artifactSequence.current++;
              setArtifact('');
            }}
          >
            Close artifact
          </button>
          {artifact.startsWith('changes.patch\n\n') ? (
            <pre>
              {parseUnifiedDiff(artifact.slice(15))?.map((row, index) => (
                <div
                  key={`${index}:${row.kind}`}
                  style={{
                    color:
                      row.kind === 'add'
                        ? 'var(--success)'
                        : row.kind === 'del'
                          ? 'var(--danger)'
                          : undefined,
                  }}
                >
                  {row.text}
                </div>
              )) ?? 'Patch exceeds the diff preview limit. Open the saved artifact to inspect it.'}
            </pre>
          ) : (
            <pre>{artifact}</pre>
          )}
        </section>
      )}
    </section>
  );
}
import { AutomationJobFields, AutomationEnvironmentRun } from './automation-environment';
