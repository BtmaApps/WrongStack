import type { MCPTaskView } from '@wrongstack/webui-protocol';
import { ArrowLeft, Plug, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { Modal } from './Modal';
import { mcpTaskSnapshot, mcpTaskStatuses, mcpTaskTerminal } from './mcp-tasks-model';
import './session-mcp-tasks.css';

const labels: Record<MCPTaskView['status'], string> = {
  working: 'Working',
  input_required: 'Needs input',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
};
export function SessionMcpTasks({
  sessionId,
  connected,
  command,
  onBack,
  pendingReviews,
}: {
  sessionId: string;
  connected: boolean;
  command: EngineCommand;
  onBack: () => void;
  pendingReviews: number;
}) {
  const [tasks, setTasks] = useState<MCPTaskView[]>([]),
    [loaded, setLoaded] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [actionError, setActionError] = useState(''),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [cancel, setCancel] = useState<MCPTaskView | null>(null),
    [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const alive = useRef(true),
    reading = useRef(false),
    resultVersion = useRef(0),
    readSequence = useRef(0),
    actionPending = useRef(false);
  const load = useCallback(async () => {
    if (!connected || !sessionId || reading.current) return;
    reading.current = true;
    const version = resultVersion.current,
      request = ++readSequence.current;
    setLoading(true);
    try {
      const value = await command('mcp.tasks.list', { sessionId }, [
        'mcp.tasks.list',
        'mcp.tasks.result',
      ]);
      const next = mcpTaskSnapshot(value, sessionId);
      if (!alive.current || request !== readSequence.current || version !== resultVersion.current)
        return;
      setTasks(next);
      setLoaded(true);
      setError('');
    } catch (error) {
      if (alive.current && request === readSequence.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      reading.current = false;
      if (alive.current && request === readSequence.current) setLoading(false);
    }
  }, [connected, sessionId, command]);
  useEffect(() => {
    alive.current = true;
    resultVersion.current++;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    // Native windows share an engine socket. Independent correlated reads avoid replacing
    // another window's session-keyed server subscription and leave no watcher on UI restart.
    const poll = async () => {
      await load();
      if (!stopped) timer = setTimeout(poll, 2000);
    };
    if (connected && sessionId) void poll();
    return () => {
      stopped = true;
      alive.current = false;
      readSequence.current++;
      clearTimeout(timer);
    };
  }, [connected, sessionId, load]);
  const act = async (task: MCPTaskView, kind: 'retry' | 'cancel') => {
    if (actionPending.current) return;
    actionPending.current = true;
    setPending(task.id);
    setActionError('');
    setNotice('');
    try {
      const reply = await command(
        `mcp.tasks.${kind}`,
        { sessionId, id: task.id },
        ['mcp.tasks.result'],
        { timeoutMs: 120000 },
      );
      if (!alive.current) return;
      if (reply['sessionId'] !== sessionId)
        throw Error('Task action acknowledgement belongs to another session.');
      resultVersion.current++;
      setNotice(String(reply['message'] ?? 'The engine acknowledged the task request.'));
      if (kind === 'cancel') setCancelled((current) => new Set([...current, task.id]));
      setCancel(null);
      await load();
    } catch (error) {
      if (alive.current) setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      actionPending.current = false;
      if (alive.current) setPending('');
    }
  };
  const visible = tasks
    .filter(
      (task) =>
        (filter === 'all' || filter === task.status) &&
        `${task.id} ${task.server} ${task.tool}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt));
  const cancelCurrent = tasks.find((task) => task.id === cancel?.id);
  return (
    <section className="session-mcp-tasks" aria-label="Session MCP tasks">
      <header>
        <div>
          <span className="eyebrow">THIS CONVERSATION</span>
          <h2>MCP tasks</h2>
          <p>
            Remote work recorded for this session. Recovering observation collects the existing
            task; it does not run the tool again.
          </p>
        </div>
        <div className="feature-actions">
          <button type="button" className="button secondary" onClick={onBack}>
            <ArrowLeft size={14} />
            Back to conversation
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={!connected || loading || !!pending}
            onClick={() => void load()}
          >
            <RefreshCw size={14} />
            Refresh MCP tasks
          </button>
        </div>
      </header>
      <div className="mcp-task-summary">
        <span>{tasks.length} recorded</span>
        <span>{tasks.filter((task) => !mcpTaskTerminal(task)).length} active</span>
        <span>{tasks.filter((task) => task.status === 'input_required').length} need input</span>
        <span role="status">
          {!connected ? 'Disconnected' : 'Metadata refreshes every 2 seconds'}
        </span>
      </div>
      {pendingReviews > 0 && (
        <button type="button" className="button secondary" onClick={onBack}>
          Review pending session requests ({pendingReviews})
        </button>
      )}
      <div className="mcp-task-filters">
        <label>
          <Search size={14} />
          <input
            aria-label="Search session MCP tasks"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Server, tool or task ID…"
          />
        </label>
        <select
          aria-label="MCP task status"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          {mcpTaskStatuses.map((status) => (
            <option key={status} value={status}>
              {labels[status]}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {actionError && (
        <p className="session-error" role="alert">
          {actionError}
        </p>
      )}
      {notice && (
        <p className="feature-notice" role="status">
          {notice}
        </p>
      )}
      {!sessionId || !connected ? (
        <p className="quiet-state">Reconnect this conversation to read its task receipts.</p>
      ) : !loaded ? (
        <p role="status">
          {error && !loading
            ? 'Task metadata is unavailable. Refresh to try again.'
            : 'Reading recorded MCP tasks…'}
        </p>
      ) : !visible.length ? (
        <div className="mcp-task-empty">
          <Plug size={30} />
          <h3>{tasks.length ? 'No matching tasks.' : 'No recorded MCP tasks.'}</h3>
          <p>Opening this view does not invoke a tool or create remote work.</p>
        </div>
      ) : (
        <div className="mcp-task-list">
          {visible.map((task) => (
            <article key={task.id} data-mcp-task={task.id}>
              <header>
                <div>
                  <h3>
                    {task.server} / {task.tool}
                  </h3>
                  <code>{task.id}</code>
                </div>
                <span className={`mcp-task-status status-${task.status}`}>
                  {labels[task.status]}
                </span>
              </header>
              <p>
                {task.delivered
                  ? task.status === 'completed'
                    ? 'Result collected by this conversation.'
                    : 'Terminal status collected by this conversation.'
                  : task.observing
                    ? 'The engine is observing the existing remote task.'
                    : 'No current observer. Resume observation to recover its status or result.'}
              </p>
              {task.status === 'input_required' && (
                <button type="button" className="text-link" onClick={onBack}>
                  Return to the conversation to answer its pending question
                </button>
              )}
              <dl>
                <dt>Created</dt>
                <dd>{new Date(task.createdAt).toLocaleString()}</dd>
                <dt>Last updated</dt>
                <dd>{new Date(task.lastUpdatedAt).toLocaleString()}</dd>
              </dl>
              {!task.delivered && (
                <footer>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!connected || !!pending || task.observing}
                    onClick={() => void act(task, 'retry')}
                  >
                    Resume observation
                  </button>
                  {!mcpTaskTerminal(task) && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={!connected || !!pending || cancelled.has(task.id)}
                      onClick={() => setCancel(task)}
                    >
                      {cancelled.has(task.id)
                        ? 'Cancellation requested'
                        : 'Request task cancellation'}
                    </button>
                  )}
                </footer>
              )}
            </article>
          ))}
        </div>
      )}
      {cancel && (
        <Modal
          title="Cancel MCP task"
          onClose={() => {
            if (!pending) setCancel(null);
          }}
        >
          <div className="mcp-task-cancel">
            <h2>Request task cancellation?</h2>
            <p>
              {cancel.server} / {cancel.tool} · <code>{cancel.id}</code>
            </p>
            <p>
              The server confirms the final status. A cancellation request alone is not a completed
              cancellation.
            </p>
            {pendingReviews > 0 && (
              <button type="button" className="button secondary" onClick={onBack}>
                Review pending session requests ({pendingReviews})
              </button>
            )}
            {actionError && (
              <p className="session-error" role="alert">
                {actionError}
              </p>
            )}
            <button
              type="button"
              className="button secondary"
              disabled={!!pending}
              onClick={() => setCancel(null)}
            >
              Keep MCP task running
            </button>
            <button
              type="button"
              className="button primary"
              disabled={
                !!pending ||
                !cancelCurrent ||
                cancelCurrent.delivered ||
                mcpTaskTerminal(cancelCurrent)
              }
              onClick={() => cancelCurrent && void act(cancelCurrent, 'cancel')}
            >
              Confirm MCP cancellation request
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
