import type { KanbanAgentAssignment } from '@wrongstack/webui-server';
import { LoaderCircle, Play, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { entries, record } from './engine-values';
import { MarkdownContent } from './MarkdownContent';

type Row = Record<string, unknown>;
const strings = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
export function KanbanChoices({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: { id: string; name: string; description?: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const choices = [
    ...options,
    ...value
      .filter((id) => !options.some((o) => o.id === id))
      .map((id) => ({
        id,
        name: id,
        description: 'Stored selection; unavailable in the current catalog',
      })),
  ];
  return (
    <fieldset className="kanban-choice-picker">
      <legend>
        {label} <small>{value.length} selected</small>
      </legend>
      <input
        aria-label={`Search ${label.toLowerCase()}`}
        placeholder={`Search ${label.toLowerCase()}…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div>
        {choices
          .filter((o) =>
            `${o.name} ${o.description ?? ''}`.toLowerCase().includes(query.toLowerCase()),
          )
          .map((o) => (
            <label key={o.id}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={value.includes(o.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...value, o.id] : value.filter((v) => v !== o.id))
                }
              />
              <span>
                {o.name}
                {o.description && <small>{o.description}</small>}
              </span>
            </label>
          ))}
        {!choices.length && <p>No catalog entries available.</p>}
      </div>
    </fieldset>
  );
}
export function KanbanExecution({
  task,
  boardId,
  command,
  onRefresh,
  disabled = false,
}: {
  task: Row;
  boardId: string;
  command: EngineCommand;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}) {
  const assignment = record(task['assignment']) as Partial<KanbanAgentAssignment>;
  const [meta, setMeta] = useState<Row>({}),
    [providers, setProviders] = useState<Row[]>([]),
    [models, setModels] = useState<Row[]>([]);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [supported, setSupported] = useState(false),
    [confirm, setConfirm] = useState(false);
  const [agent, setAgent] = useState(String(assignment['agentId'] ?? task['assignedAgent'] ?? '')),
    [name, setName] = useState(String(assignment['name'] ?? '')),
    [role, setRole] = useState(String(assignment['role'] ?? ''));
  const [routing, setRouting] = useState(
    String(
      assignment['modelRouting'] ??
        (assignment['provider'] || assignment['model'] ? 'fixed' : 'session'),
    ),
  );
  const [provider, setProvider] = useState(String(assignment['provider'] ?? '')),
    [model, setModel] = useState(String(assignment['model'] ?? '')),
    [profile, setProfile] = useState(String(assignment['fallbackProfile'] ?? ''));
  const [skills, setSkills] = useState(strings(assignment['skills'])),
    [tools, setTools] = useState(strings(assignment['tools'])),
    [capabilities, setCapabilities] = useState(strings(assignment['allowedCapabilities'])),
    [fallbacks, setFallbacks] = useState(strings(assignment['fallbackModels']));
  const [capabilityMode, setCapabilityMode] = useState(
    Array.isArray(assignment['allowedCapabilities']) ? 'custom' : 'default',
  );
  const [retry, setRetry] = useState(
      String(assignment['retryPolicy'] ?? task['retryPolicy'] ?? 'off'),
    ),
    [cost, setCost] = useState(
      String(assignment['costCeilingUsd'] ?? task['costCeilingUsd'] ?? ''),
    ),
    [attempts, setAttempts] = useState(String(assignment['maxAttempts'] ?? ''));
  useEffect(() => {
    let current = true;
    void Promise.all([
      command('kanban.meta', {}, ['kanban.meta']),
      command('providers.saved', {}, ['providers.saved', 'key.operation_result']),
      command('kanban.capabilities', {}, ['kanban.capabilities']),
    ])
      .then(([metadata, saved, capability]) => {
        if (current) {
          setMeta(record(metadata['data']));
          setProviders(entries(saved['providers']));
          setSupported(record(capability['data'])['dispatchSupported'] === true);
        }
      })
      .catch((e) => {
        if (current) setError(String(e instanceof Error ? e.message : e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [command]);
  useEffect(() => {
    if (!provider) {
      setModels([]);
      return;
    }
    let current = true;
    setModels([]);
    void command('provider.models', { providerId: provider }, [
      'provider.models',
      'key.operation_result',
    ])
      .then((reply) => {
        if (current) setModels(entries(reply['models']));
      })
      .catch((e) => {
        if (current) setError(String(e instanceof Error ? e.message : e));
      });
    return () => {
      current = false;
    };
  }, [command, provider]);
  const runtimeProvider =
    typeof meta['sessionProvider'] === 'string'
      ? meta['sessionProvider']
      : String(record(meta['sessionProvider'])['id'] ?? '');
  const active = ['queued', 'running'].includes(String(assignment['status']));
  const validRoute =
    routing === 'fixed'
      ? !!provider && !!model
      : routing === 'fallback_profile'
        ? !!profile
        : routing === 'session' &&
          !!runtimeProvider &&
          runtimeProvider !== 'unconfigured' &&
          !!meta['sessionModel'];
  const payload = () => ({
    ...(agent.trim() ? { agentId: agent.trim() } : {}),
    ...(name.trim() ? { name: name.trim() } : {}),
    ...(role ? { role } : {}),
    modelRouting: routing,
    ...(routing === 'fixed' ? { provider, model } : {}),
    ...(routing === 'fallback_profile' ? { fallbackProfile: profile } : {}),
    fallbackModels: fallbacks,
    skills,
    tools,
    ...(capabilityMode === 'custom' ? { allowedCapabilities: capabilities } : {}),
    ...(attempts ? { maxAttempts: Number(attempts) } : {}),
    ...(cost ? { costCeilingUsd: Number(cost) } : {}),
    retryPolicy: retry,
    activityNote: 'Task execution route configured in desktop.',
  });
  const act = async (action: string, body: Row) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await command(action, { boardId, taskId: task['id'], ...body }, [action], {
        timeoutMs: 45000,
      });
      setConfirm(false);
      await onRefresh();
      setNotice(
        action === 'kanban.task.dispatch'
          ? 'Agent dispatched. The assignment below reports its actual progress.'
          : action === 'kanban.task.release'
            ? 'Claim released.'
            : 'Assignment saved.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const locked = disabled || busy || active;
  return (
    <section className="kanban-execution" aria-label="Task execution">
      <dl className="task-facts">
        <div>
          <dt>Run state</dt>
          <dd>{String(assignment['status'] ?? 'Unassigned')}</dd>
        </div>
        <div>
          <dt>Worker</dt>
          <dd>{String(assignment['subagentId'] ?? assignment['agentId'] ?? 'Not started')}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>
            {String(assignment['attempt'] ?? 0)} /{' '}
            {String(assignment['maxAttempts'] ?? 'engine default')}
          </dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>
            {[assignment['provider'], assignment['model']].filter(Boolean).join(' / ') ||
              'Engine default'}
          </dd>
        </div>
        {assignment.dispatchedAt && (
          <div>
            <dt>Started</dt>
            <dd>{new Date(assignment.dispatchedAt).toLocaleString()}</dd>
          </div>
        )}
        {assignment.completedAt && (
          <div>
            <dt>Finished</dt>
            <dd>{new Date(assignment.completedAt).toLocaleString()}</dd>
          </div>
        )}
        {assignment.heartbeatAt && (
          <div>
            <dt>Heartbeat</dt>
            <dd>{new Date(assignment.heartbeatAt).toLocaleString()}</dd>
          </div>
        )}
        {assignment.leaseExpiresAt && (
          <div>
            <dt>Lease until</dt>
            <dd>{new Date(assignment.leaseExpiresAt).toLocaleString()}</dd>
          </div>
        )}
      </dl>
      {Boolean(assignment.lastResult) && (
        <div className="task-run-output">
          <MarkdownContent text={String(assignment.lastResult)} />
        </div>
      )}
      {Boolean(assignment['error']) && (
        <p className="session-error" role="alert">
          {String(assignment['error'])}
        </p>
      )}
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="studio-notice" role="status">
          {notice}
        </p>
      )}
      {loading && <p className="quiet-state">Loading live tools, skills, and model routes…</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act('kanban.task.assign', payload());
        }}
      >
        <div className="inspector-two-fields">
          <label>
            Agent ID
            <input
              aria-label="Task agent ID"
              value={agent}
              disabled={locked}
              onChange={(e) => setAgent(e.target.value)}
            />
          </label>
          <label>
            Display name
            <input
              aria-label="Task agent name"
              value={name}
              disabled={locked}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
        <label>
          Role
          <select
            aria-label="Task agent role"
            value={role}
            disabled={locked}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">Engine default</option>
            {[
              ...new Set([
                'architect',
                'developer',
                'reviewer',
                'tester',
                'verifier',
                'security',
                'documenter',
                'external',
                'leader',
                'shadow',
                'subagent',
                ...(role ? [role] : []),
              ]),
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Primary model source
          <select
            aria-label="Task model routing"
            value={routing}
            disabled={locked}
            onChange={(e) => setRouting(e.target.value)}
          >
            <option value="session">Project engine default</option>
            <option value="fixed">Pinned provider and model</option>
            <option value="fallback_profile">Named fallback profile</option>
            {!['session', 'fixed', 'fallback_profile'].includes(routing) && (
              <option value={routing}>{routing} (stored route)</option>
            )}
          </select>
        </label>
        {routing === 'session' && (
          <p className="field-help">
            Current project engine: {runtimeProvider || 'No provider'} /{' '}
            {String(meta['sessionModel'] ?? 'No model')}. Configure its default in WrongStack
            settings.
          </p>
        )}
        {routing === 'fixed' && (
          <div className="inspector-two-fields">
            <label>
              Provider
              <select
                aria-label="Task execution provider"
                value={provider}
                disabled={locked}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModel('');
                }}
              >
                <option value="">Select saved provider</option>
                {providers.map((p) => (
                  <option key={String(p['id'])} value={String(p['id'])}>
                    {String(p['id'])}
                  </option>
                ))}
                {provider && !providers.some((p) => p['id'] === provider) && (
                  <option value={provider}>{provider} (stored)</option>
                )}
              </select>
            </label>
            <label>
              Model
              <select
                aria-label="Task execution model"
                value={model}
                disabled={locked}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="">Select model</option>
                {models.map((m) => (
                  <option key={String(m['id'])} value={String(m['id'])}>
                    {String(m['name'] ?? m['id'])}
                  </option>
                ))}
                {model && !models.some((m) => m['id'] === model) && (
                  <option value={model}>{model} (stored)</option>
                )}
              </select>
            </label>
          </div>
        )}
        {routing === 'fallback_profile' && (
          <label>
            Fallback profile
            <select
              aria-label="Task fallback profile"
              value={profile}
              disabled={locked}
              onChange={(e) => setProfile(e.target.value)}
            >
              <option value="">Select configured profile</option>
              {[
                ...new Set([
                  ...Object.keys(record(meta['fallbackProfiles'])),
                  ...(profile ? [profile] : []),
                ]),
              ].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
        <KanbanChoices
          label="Fallback models"
          options={models.map((m) => ({
            id: `${provider}/${m['id']}`,
            name: `${provider} / ${m['name'] ?? m['id']}`,
          }))}
          value={fallbacks}
          onChange={setFallbacks}
          disabled={locked}
        />
        <KanbanChoices
          label="Agentic skills"
          options={entries(meta['skills']).map((s) => ({
            id: String(s['name']),
            name: String(s['name']),
            description: String(s['description'] ?? ''),
          }))}
          value={skills}
          onChange={setSkills}
          disabled={locked}
        />
        <KanbanChoices
          label="Allowed tools"
          options={entries(meta['tools']).map((t) => ({
            id: String(t['name']),
            name: String(t['name']),
            description: String(t['description'] ?? ''),
          }))}
          value={tools}
          onChange={setTools}
          disabled={locked}
        />
        <p className="field-help">No tool selection uses the engine's default tool set.</p>
        <details className="task-detail-section">
          <summary>Budgets & capabilities</summary>
          <div className="inspector-two-fields">
            <label>
              Max attempts
              <input
                aria-label="Task max attempts"
                type="number"
                min="1"
                value={attempts}
                disabled={locked}
                onChange={(e) => setAttempts(e.target.value)}
              />
            </label>
            <label>
              Cost ceiling (USD)
              <input
                aria-label="Execution cost ceiling"
                type="number"
                min="0"
                step="0.01"
                value={cost}
                disabled={locked}
                onChange={(e) => setCost(e.target.value)}
              />
            </label>
          </div>
          <label>
            Retry policy
            <select
              aria-label="Execution retry policy"
              value={retry}
              disabled={locked}
              onChange={(e) => setRetry(e.target.value)}
            >
              {['off', 'incremental', 'exponential'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Capability policy
            <select
              aria-label="Task capability policy"
              value={capabilityMode}
              disabled={locked}
              onChange={(e) => setCapabilityMode(e.target.value)}
            >
              <option value="default">Engine worker policy</option>
              <option value="custom">Explicit allowlist</option>
            </select>
          </label>
          <KanbanChoices
            label="Capabilities"
            options={[
              'fs.read',
              'fs.write',
              'fs.write.outside-project',
              'net.outbound',
              'shell.exec',
              'shell.restricted',
              'shell.arbitrary',
              'session.todo',
              'tool.meta',
              'tool.mutate.any',
              'memory.read',
              'memory.write',
              'package.install',
              'subagent.spawn',
              'config.mutate',
            ].map((id) => ({ id, name: id }))}
            value={capabilities}
            onChange={(value) => {
              setCapabilityMode('custom');
              setCapabilities(value);
            }}
            disabled={locked}
          />
          <p className="field-help">
            Engine policy inherits its worker grant. An empty explicit allowlist grants no
            capabilities. Save an assignment when switching back to engine policy before
            dispatching.
          </p>
        </details>
        <button
          type="submit"
          className="button secondary"
          disabled={
            locked ||
            loading ||
            !['session', 'fixed', 'fallback_profile'].includes(routing) ||
            (routing === 'fixed' && (!provider || !model)) ||
            (routing === 'fallback_profile' && !profile)
          }
        >
          <Save size={13} />
          Save assignment
        </button>
      </form>
      {!supported && !loading && (
        <p className="field-help">This connected engine does not expose task dispatch.</p>
      )}
      {active ? (
        <p className="studio-notice">
          This task has an active claim. Route edits are locked until that claim is released or
          finishes. Releasing ownership does not stop an already running worker.
        </p>
      ) : (
        <button
          type="button"
          className="button primary full"
          disabled={
            disabled ||
            busy ||
            loading ||
            !supported ||
            !validRoute ||
            (capabilityMode === 'default' && Array.isArray(assignment['allowedCapabilities']))
          }
          onClick={() => setConfirm(true)}
        >
          {busy ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}Dispatch agent
        </button>
      )}
      {confirm && (
        <section className="task-dispatch-confirm" aria-label="Confirm task dispatch">
          <p>
            Run this task in the project using the selected model, tools and capabilities? The
            engine checks readiness and owns its execution lease.
          </p>
          <button
            type="button"
            className="button primary"
            disabled={disabled || busy}
            onClick={() => void act('kanban.task.dispatch', payload())}
          >
            Start task agent
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            Cancel dispatch
          </button>
        </section>
      )}
      {active && (
        <button
          type="button"
          className="button secondary"
          disabled={disabled || busy}
          onClick={() =>
            void act('kanban.task.release', {
              reason: 'Released explicitly from desktop.',
              status: 'ready',
            })
          }
        >
          Release claim
        </button>
      )}
    </section>
  );
}
