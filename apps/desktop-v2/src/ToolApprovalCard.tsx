import {
  AlertTriangle,
  Check,
  Clock3,
  FileCode2,
  Globe,
  ShieldAlert,
  Terminal,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DiffPreview } from './DiffPreview';
import type { EngineSend } from './engine-operations';
import { record } from './engine-values';
import './tool-approval.css';

type Decision = 'yes' | 'no' | 'deny' | 'always-exact' | 'always-command' | 'always-tool';
function label(key: string) {
  return key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}
export function StructuredToolValue({ value }: { value: unknown }) {
  if (value === null) return <span className="approval-empty">None</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ol>
        {value.map((item, index) => (
          <li key={index}>
            <StructuredToolValue value={item} />
          </li>
        ))}
      </ol>
    ) : (
      <span className="approval-empty">Empty list</span>
    );
  if (typeof value === 'object' && value !== null) {
    const fields = Object.entries(value);
    return fields.length ? (
      <dl>
        {fields.map(([key, item]) => (
          <div key={key}>
            <dt>{label(key)}</dt>
            <dd>
              <StructuredToolValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    ) : (
      <span className="approval-empty">Empty object</span>
    );
  }
  if (typeof value === 'string') return <pre>{value || '(empty text)'}</pre>;
  return <span>{String(value)}</span>;
}

export function ToolApprovalCard({
  approval,
  send,
  connected,
}: {
  approval: Record<string, unknown>;
  send: EngineSend;
  connected: boolean;
}) {
  const [scope, setScope] = useState<'always-exact' | 'always-command' | 'always-tool'>(
    'always-exact',
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [now, setNow] = useState(Date.now());
  const pendingRef = useRef(false),
    alive = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = String(approval['id'] ?? ''),
    tool = String(approval['toolName'] ?? 'Tool');
  const input = record(approval['input']);
  const commandKey = ['command', 'cmd', 'script'].find(
    (key) => typeof input[key] === 'string' && input[key],
  );
  const command = commandKey ? input[commandKey] : undefined;
  const remainingInput = commandKey
    ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== commandKey))
    : approval['input'];
  const path = String(input['file_path'] ?? input['path'] ?? '');
  const oldText = input['old_string'],
    newText = input['new_string'];
  const edit =
    /^(edit|str_replace|edit_file|multi_edit)$/i.test(tool) &&
    typeof oldText === 'string' &&
    typeof newText === 'string';
  const canShowDiff = edit && oldText !== newText && oldText.length + newText.length <= 200000;
  const isRule = approval['decisionSource'] === 'yolo_user_rule';
  const destructive =
    approval['riskTier'] === 'destructive' || approval['decisionSource'] === 'yolo_destructive';
  const reason = typeof approval['boundaryReason'] === 'string' ? approval['boundaryReason'] : '';
  const deadline = typeof approval['deadlineAt'] === 'number' ? approval['deadlineAt'] : null;
  const seconds = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const Icon = /edit|write|create|patch/i.test(tool)
    ? FileCode2
    : /bash|shell|exec|command/i.test(tool)
      ? Terminal
      : /fetch|http|web|request/i.test(tool)
        ? Globe
        : ShieldAlert;
  useEffect(() => {
    if (deadline === null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [deadline]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const decide = async (decision: Decision) => {
    if (!id || !connected || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      await send('tool.confirm_result', { id, decision });
      if (!alive.current) return;
      // A transport write is not the decision. Keep the card until the engine
      // broadcasts tool.confirm_resolved; allow a retry if no resolution arrives.
      timer.current = setTimeout(() => {
        pendingRef.current = false;
        setPending(false);
        setError(
          'The engine has not confirmed this decision. Check the connection before retrying.',
        );
      }, 15000);
    } catch (e) {
      if (!alive.current) return;
      pendingRef.current = false;
      setPending(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <article
      className={`approval-card tool-approval ${destructive ? 'approval-destructive' : ''}`}
      aria-label={`Approval for ${tool}`}
    >
      <header>
        <div className="approval-icon">
          <Icon size={18} />
        </div>
        <div>
          <span className="eyebrow">APPROVAL REQUIRED</span>
          <h3>{tool}</h3>
          <p>{reason || 'Review what this tool will do before allowing it to run.'}</p>
        </div>
        <span className="approval-risk">
          {destructive ? 'Destructive' : approval['riskTier'] === 'safe' ? 'Safe' : 'Standard'}
        </span>
      </header>
      {isRule && (
        <p className="approval-notice">
          <AlertTriangle size={14} /> A user rule requires this confirmation. A remembered allow
          rule would not override it.
        </p>
      )}
      {seconds !== null && (
        <p className="approval-deadline" role="status">
          <Clock3 size={13} />{' '}
          {seconds
            ? `Decision window: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
            : 'Waiting for the engine’s decision…'}
        </p>
      )}
      {typeof command === 'string' && command && (
        <section className="approval-command" aria-label="Command to run">
          <strong>Command</strong>
          <pre>{command}</pre>
        </section>
      )}
      {canShowDiff && (
        <section className="approval-diff" aria-label="Proposed file edit">
          <strong>Proposed edit</strong>
          <DiffPreview before={oldText} after={newText} path={path || 'File'} />
        </section>
      )}
      {approval['input'] !== undefined && (
        <section className="approval-arguments" aria-label="Tool arguments">
          <strong>Tool arguments</strong>
          <StructuredToolValue value={remainingInput} />
        </section>
      )}
      {typeof approval['suggestedPattern'] === 'string' && approval['suggestedPattern'] && (
        <div className="approval-pattern">
          <strong>Matching subject</strong>
          <code>{approval['suggestedPattern']}</code>
        </div>
      )}
      {!isRule && (
        <label className="approval-scope">
          Remember an approval for
          <select
            value={scope}
            disabled={pending || !connected || !id}
            onChange={(event) => setScope(event.target.value as typeof scope)}
            aria-label="Remembered approval scope"
          >
            <option value="always-exact">This exact request</option>
            {tool === 'exec' && (
              <option value="always-command">This executable, with any arguments</option>
            )}
            <option value="always-tool">All requests for {tool}</option>
          </select>
          <small>
            Approval is saved for 24 hours when possible. Protected operations may still ask.
          </small>
        </label>
      )}
      {error && (
        <p className="composer-error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <p role="status" className="approval-waiting">
          Sending decision; waiting for the engine…
        </p>
      )}
      <p className="approval-decision-hint">
        Deny also blocks matching retries while this engine retains its in-memory denial. Remember
        denial saves a rule for the matching subject; the scope selector applies to remembered
        approvals.
      </p>
      <footer className="approval-actions">
        <button
          type="button"
          className="button secondary"
          title="Deny this and future requests matching the displayed subject"
          disabled={pending || !connected || !id}
          onClick={() => void decide('deny')}
        >
          Remember denial
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={pending || !connected || !id}
          title="Deny this request and matching retries while the engine retains its in-memory denial"
          onClick={() => void decide('no')}
        >
          <X size={14} /> Deny
        </button>
        {!isRule && (
          <button
            type="button"
            className="button secondary"
            disabled={pending || !connected || !id}
            onClick={() => void decide(scope)}
          >
            Allow & remember
          </button>
        )}
        <button
          type="button"
          className="button primary"
          disabled={pending || !connected || !id}
          onClick={() => void decide('yes')}
        >
          <Check size={14} /> Allow once
        </button>
      </footer>
    </article>
  );
}
