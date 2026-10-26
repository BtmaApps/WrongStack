import {
  type AutomationJobInput,
  type AutomationJobRecord,
  type AutomationPreview,
  type AutomationStateView,
  createAutomationJobInput,
  editableAutomationJob,
  formatAutomationCommands,
  parseAutomationCommands,
} from '@wrongstack/webui-protocol';
import { Download, Eye, Pause, Play, Plus, RefreshCw, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { EngineHttp } from './engine-http';
import { record } from './engine-values';

export function AutomationWorkspace({ http }: { http: EngineHttp }) {
  const [data, setData] = useState<AutomationStateView>({
    jobs: [],
    runs: [],
    workerOnline: false,
  });
  const [selected, setSelected] = useState<AutomationJobRecord | null>(null);
  const [draft, setDraft] = useState<AutomationJobInput>(() => ({
    ...createAutomationJobInput(),
    enabled: false,
  }));
  const [commands, setCommands] = useState('');
  const [preview, setPreview] = useState<AutomationPreview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [artifact, setArtifact] = useState('');
  const load = useCallback(
    async () => setData((await http('/api/automation/state')) as AutomationStateView),
    [http],
  );
  useEffect(() => {
    void load().catch((error: unknown) =>
      setError(String(error instanceof Error ? error.message : error)),
    );
    const timer = setInterval(() => {
      void load().catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const edit = (job: AutomationJobRecord | null) => {
    setSelected(job);
    setDraft(job ? editableAutomationJob(job) : { ...createAutomationJobInput(), enabled: false });
    setCommands(job?.verification ? formatAutomationCommands(job.verification.commands) : '');
    setPreview(null);
    setNotice('');
  };
  const spec = (): AutomationJobInput => ({
    ...draft,
    ...(commands.trim()
      ? {
          verification: {
            commands: parseAutomationCommands(commands),
            timeoutMs: draft.verification?.timeoutMs ?? 120000,
          },
        }
      : { verification: undefined }),
  });
  const update = <K extends keyof AutomationJobInput>(key: K, value: AutomationJobInput[K]) => {
    setDraft((draft) => ({ ...draft, [key]: value }));
    setPreview(null);
  };
  const save = () =>
    run(async () => {
      const saved = (await http(
        selected ? `/api/automation/jobs/${selected.id}` : '/api/automation/jobs',
        selected ? 'PUT' : 'POST',
        { spec: spec(), ...(selected ? { expectedRevision: selected.revision ?? 1 } : {}) },
      )) as AutomationJobRecord;
      edit(saved);
      setNotice('The engine saved this automation.');
    });
  const exportJob = () =>
    run(async () => {
      if (!selected) return;
      const doc = await http(`/api/automation/jobs/${selected.id}/export`);
      const link = document.createElement('a');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
      );
      link.href = url;
      link.download = `${selected.name.replace(/[^a-z0-9-]/gi, '-')}.automation.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  const importJob = async (file: File) =>
    run(async () => {
      const document: unknown = JSON.parse(await file.text());
      const saved = (await http('/api/automation/import', 'POST', {
        document,
      })) as AutomationJobRecord;
      edit(saved);
      setNotice('Imported as a disabled automation for local review.');
    });
  return (
    <div className="feature-management">
      <div className="feature-toolbar">
        <span className={`automation-worker ${data.workerOnline ? 'online' : ''}`}>
          {data.workerOnline ? 'Worker online' : 'Worker offline · jobs remain editable'}
        </span>
        <button
          type="button"
          className="button secondary"
          onClick={() => void run(load)}
          disabled={busy}
        >
          <RefreshCw size={13} />
          Refresh
        </button>
        <label className="button secondary feature-import">
          Import
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Import automation"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importJob(file);
              event.target.value = '';
            }}
          />
        </label>
        <button type="button" className="button primary" onClick={() => edit(null)}>
          <Plus size={13} />
          New automation
        </button>
      </div>
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="feature-notice" role="status">
          {notice}
        </p>
      )}
      <div className="feature-split">
        <div>
          <section className="feature-record-list" aria-label="Automation jobs">
            {data.jobs.map((job) => (
              <button
                type="button"
                key={job.id}
                className={selected?.id === job.id ? 'selected-record' : ''}
                onClick={() => edit(job)}
              >
                <strong>{job.name}</strong>
                <p>{job.prompt}</p>
                <span className="feature-meta">
                  {job.enabled ? 'Enabled' : 'Disabled'} ·{' '}
                  {job.schedule
                    ? `${job.schedule.expression} · ${job.schedule.timezone}`
                    : job.intervalMs
                      ? `Every ${job.intervalMs / 60000} minutes`
                      : 'Manual only'}
                </span>
              </button>
            ))}
            {!data.jobs.length && <p className="quiet-state">No automations in this project.</p>}
          </section>
          <section className="automation-runs">
            <h3>Recent runs</h3>
            {data.runs.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.id.slice(0, 8)}</strong>
                  <span className="feature-meta">
                    {item.status} · {item.trigger}
                  </span>
                </div>
                {item.error && <p>{item.error}</p>}
                <div className="feature-actions">
                  {['queued', 'running'].includes(item.status) && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await http(`/api/automation/runs/${item.id}/cancel`, 'POST', {});
                        })
                      }
                    >
                      Cancel run
                    </button>
                  )}
                  {['output.log', 'verification.json', 'changes.patch'].map((name) => (
                    <button
                      type="button"
                      key={name}
                      className="text-link"
                      onClick={() =>
                        void run(async () => {
                          const reply = await http(
                            `/api/automation/runs/${item.id}/artifact?name=${encodeURIComponent(name)}`,
                          );
                          setArtifact(String(record(reply)['content'] ?? ''));
                        })
                      }
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </article>
            ))}
            {!data.runs.length && (
              <p className="quiet-state">Queued and completed runs appear here.</p>
            )}
          </section>
        </div>
        <form
          className="feature-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h3>{selected ? 'Edit automation' : 'Create automation'}</h3>
          <label>
            Name
            <input
              aria-label="Automation name"
              required
              value={draft.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </label>
          <label>
            Runtime image
            <input
              aria-label="Automation image"
              required
              value={draft.image}
              placeholder="wrongstack:latest"
              onChange={(event) => update('image', event.target.value)}
            />
          </label>
          <label>
            Instructions
            <textarea
              aria-label="Automation instructions"
              required
              rows={5}
              value={draft.prompt}
              onChange={(event) => update('prompt', event.target.value)}
            />
          </label>
          <div className="feature-field-grid">
            <label>
              Provider
              <input
                aria-label="Automation provider"
                value={draft.provider ?? ''}
                onChange={(event) => update('provider', event.target.value || undefined)}
              />
            </label>
            <label>
              Model
              <input
                aria-label="Automation model"
                value={draft.model ?? ''}
                onChange={(event) => update('model', event.target.value || undefined)}
              />
            </label>
            <label>
              Timeout (minutes)
              <input
                aria-label="Automation timeout"
                type="number"
                min={1}
                max={1440}
                value={draft.timeoutMs / 60000}
                onChange={(event) => update('timeoutMs', Number(event.target.value) * 60000)}
              />
            </label>
            <label>
              Maximum iterations
              <input
                aria-label="Automation iterations"
                type="number"
                min={1}
                max={1000}
                value={draft.maxIterations ?? 40}
                onChange={(event) => update('maxIterations', Number(event.target.value))}
              />
            </label>
          </div>
          <label>
            Environment variable names
            <input
              aria-label="Automation environment names"
              value={draft.envNames.join(', ')}
              placeholder="Names only, separated by commas"
              onChange={(event) =>
                update(
                  'envNames',
                  event.target.value
                    .split(',')
                    .map((name) => name.trim())
                    .filter(Boolean),
                )
              }
            />
          </label>
          <label>
            Schedule
            <select
              aria-label="Automation schedule"
              value={draft.schedule ? 'cron' : draft.intervalMs ? 'interval' : 'manual'}
              onChange={(event) => {
                const kind = event.target.value;
                setDraft((draft) => ({
                  ...draft,
                  schedule:
                    kind === 'cron'
                      ? {
                          type: 'cron',
                          expression: '0 9 * * *',
                          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        }
                      : undefined,
                  intervalMs: kind === 'interval' ? 3600000 : undefined,
                }));
              }}
            >
              <option value="manual">Manual only</option>
              <option value="interval">Interval</option>
              <option value="cron">Cron schedule</option>
            </select>
          </label>
          {draft.intervalMs && (
            <label>
              Interval (minutes)
              <input
                aria-label="Automation interval"
                type="number"
                min={1}
                value={draft.intervalMs / 60000}
                onChange={(event) => update('intervalMs', Number(event.target.value) * 60000)}
              />
            </label>
          )}
          {draft.schedule && (
            <div className="feature-field-grid">
              <label>
                Cron expression
                <input
                  aria-label="Automation cron"
                  value={draft.schedule.expression}
                  onChange={(event) =>
                    update('schedule', { ...draft.schedule!, expression: event.target.value })
                  }
                />
              </label>
              <label>
                Timezone
                <input
                  aria-label="Automation timezone"
                  value={draft.schedule.timezone}
                  onChange={(event) =>
                    update('schedule', { ...draft.schedule!, timezone: event.target.value })
                  }
                />
              </label>
            </div>
          )}
          <label>
            Verification commands
            <textarea
              aria-label="Automation verification commands"
              rows={3}
              value={commands}
              onChange={(event) => setCommands(event.target.value)}
              placeholder={'bun run typecheck\nbun run test'}
            />
          </label>
          <label className="feature-checkbox">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => update('enabled', event.target.checked)}
            />
            Enable this automation
          </label>
          <label className="feature-checkbox">
            <input
              type="checkbox"
              checked={draft.yolo}
              onChange={(event) => update('yolo', event.target.checked)}
            />
            Use the engine's YOLO permission mode
          </label>
          {preview && (
            <div className="automation-preview">
              <h4>Launch preview</h4>
              <p>
                {preview.nextRunTimes.length
                  ? preview.nextRunTimes.map((time) => new Date(time).toLocaleString()).join(' · ')
                  : 'Manual execution'}
              </p>
              {preview.missingReferences.length > 0 && (
                <p>Missing references: {preview.missingReferences.join(', ')}</p>
              )}
              <details>
                <summary>Runtime command</summary>
                <pre>{preview.args.join(' ')}</pre>
              </details>
            </div>
          )}
          <div className="feature-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy || !draft.name || !draft.image || !draft.prompt}
              onClick={() =>
                void run(async () => {
                  setPreview(
                    (await http('/api/automation/preview', 'POST', {
                      spec: spec(),
                    })) as AutomationPreview,
                  );
                })
              }
            >
              <Eye size={13} />
              Preview
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              <Save size={13} />
              {busy ? 'Working…' : 'Save automation'}
            </button>
          </div>
          {selected && (
            <div className="feature-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await http(`/api/automation/jobs/${selected.id}/run`, 'POST', {
                      expectedRevision: selected.revision ?? 1,
                    });
                    setNotice('The engine queued this run.');
                  })
                }
              >
                <Play size={13} />
                Queue run
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await http(`/api/automation/jobs/${selected.id}/enabled`, 'POST', {
                      enabled: !selected.enabled,
                      expectedRevision: selected.revision ?? 1,
                    });
                    const latest = (await http('/api/automation/state')) as AutomationStateView;
                    setData(latest);
                    const updated = latest.jobs.find((job) => job.id === selected.id);
                    if (updated) edit(updated);
                  })
                }
              >
                <Pause size={13} />
                {selected.enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void exportJob()}
              >
                <Download size={13} />
                Export
              </button>
            </div>
          )}
        </form>
      </div>
      {artifact && (
        <section className="automation-artifact">
          <h3>Run evidence</h3>
          <pre>{artifact}</pre>
        </section>
      )}
    </div>
  );
}
