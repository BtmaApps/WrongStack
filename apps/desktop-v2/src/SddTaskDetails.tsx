import { useState } from 'react';
import { entries, record } from './engine-state';
import { parseSddSubtasks } from './sdd-task-split';

const label = (value: unknown) =>
  typeof value === 'string' && value
    ? value
    : typeof value === 'number'
      ? String(value)
      : 'Not reported';
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export function SddTaskDetails({
  task,
  tasks,
  board,
  waiting,
  request,
  onSelect,
}: {
  task: Record<string, unknown>;
  tasks: Record<string, unknown>[];
  board: Record<string, unknown>;
  waiting: boolean;
  request: (type: string, payload: Record<string, unknown>, description: string) => Promise<void>;
  onSelect: (id: string) => void;
}) {
  const [agent, setAgent] = useState(
    typeof task['agentName'] === 'string' ? task['agentName'] : '',
  );
  const [model, setModel] = useState(typeof task['model'] === 'string' ? task['model'] : '');
  const [provider, setProvider] = useState(
    typeof task['provider'] === 'string' ? task['provider'] : '',
  );
  const [fallbacks, setFallbacks] = useState(strings(task['fallbackModels']).join('\n'));
  const [verification, setVerification] = useState(
    typeof task['verificationCommand'] === 'string' ? task['verificationCommand'] : '',
  );
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [splitText, setSplitText] = useState('');
  const [confirmSplit, setConfirmSplit] = useState(false);
  const live = ['running', 'paused'].includes(String(board['status']));
  const status = String(task['displayStatus'] ?? task['status']);
  const mutate = (action: string, payload: Record<string, unknown>, description: string) =>
    request(
      `sdd.board.${action}`,
      { runId: board['runId'], taskId: task['id'], ...payload },
      description,
    );
  const history = entries(record(board['taskEvents'])[String(task['id'])]);
  const feed = history.length
    ? history
    : entries(board['feed']).filter(
        (item) => item['taskId'] === task['id'] || item['taskShortId'] === task['shortId'],
      );
  const dependencies = strings(task['deps']);
  const dependents = tasks.filter((item) =>
    strings(item['deps']).includes(String(task['shortId'])),
  );
  return (
    <aside className="sdd-task-detail" aria-label="SDD task details">
      <span className="eyebrow">TASK {label(task['shortId'])}</span>
      <h3>{label(task['title'])}</h3>
      <p>
        {typeof task['description'] === 'string' && task['description']
          ? task['description']
          : 'No description recorded.'}
      </p>
      <dl className="sdd-task-meta">
        {[
          ['Status', task['displayStatus'] ?? task['status']],
          ['Priority', task['priority']],
          ['Type', task['type']],
          ['Agent', task['agentName']],
          ['Model', task['model'] ?? board['defaultModel']],
          ['Provider', task['provider'] ?? board['defaultProvider']],
          ['Retries', task['retries']],
          ['Branch', task['worktreeBranch']],
          ['Verification', task['verificationState']],
        ].map(([name, value]) => (
          <div key={String(name)}>
            <dt>{String(name)}</dt>
            <dd>{label(value)}</dd>
          </div>
        ))}
      </dl>
      {typeof task['verificationDetail'] === 'string' && task['verificationDetail'] && (
        <p className="session-error">{task['verificationDetail']}</p>
      )}
      {dependencies.length > 0 && (
        <div className="sdd-dependencies">
          <h4>Depends on</h4>
          {dependencies.map((id) => {
            const dependency = tasks.find((item) => item['shortId'] === id);
            return dependency && typeof dependency['id'] === 'string' ? (
              <button
                type="button"
                className="button secondary"
                key={id}
                onClick={() => onSelect(dependency['id'] as string)}
              >
                {label(dependency['title'])}
              </button>
            ) : (
              <span key={id}>{id}</span>
            );
          })}
        </div>
      )}
      {dependents.length > 0 && (
        <div className="sdd-dependencies">
          <h4>Unblocks</h4>
          {dependents.map((item) => (
            <button
              type="button"
              className="button secondary"
              key={String(item['id'])}
              onClick={() => onSelect(String(item['id']))}
            >
              {label(item['title'])}
            </button>
          ))}
        </div>
      )}
      {live && (
        <div className="sdd-task-controls">
          <p>
            Controls are applied by the active project run. Updated task details confirm the result.
          </p>
          <div className="sdd-actions">
            {['failed', 'blocked'].includes(status) && (
              <button
                type="button"
                className="button secondary"
                disabled={waiting}
                onClick={() => void mutate('retry', {}, 'Task retry')}
              >
                Retry task
              </button>
            )}
            {status === 'in_progress' && (
              <button
                type="button"
                className="button secondary"
                disabled={waiting}
                onClick={() => setConfirm('cancel')}
              >
                Cancel task
              </button>
            )}
            {['pending', 'blocked', 'queued'].includes(status) && (
              <button
                type="button"
                className="button secondary"
                disabled={waiting}
                onClick={() => setConfirm('delete')}
              >
                Delete task
              </button>
            )}
            {confirm && (
              <>
                <span>
                  {confirm === 'cancel'
                    ? 'Cancel this task’s worker?'
                    : 'Delete this task from the run?'}
                </span>
                <button
                  type="button"
                  className="button secondary"
                  disabled={waiting}
                  onClick={() => {
                    const action = confirm;
                    setConfirm(null);
                    void mutate(
                      action === 'cancel' ? 'cancel_task' : 'delete_task',
                      {},
                      action === 'cancel' ? 'Task cancellation' : 'Task deletion',
                    );
                  }}
                >
                  Confirm {confirm}
                </button>
                <button type="button" onClick={() => setConfirm(null)}>
                  Keep task
                </button>
              </>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (agent.trim())
                void mutate('reassign', { agentName: agent.trim() }, 'Task assignment');
            }}
          >
            <label>
              Assigned agent
              <input
                aria-label="Assigned agent"
                value={agent}
                onChange={(event) => setAgent(event.target.value)}
              />
            </label>
            <button type="submit" className="button secondary" disabled={!agent.trim() || waiting}>
              Update assignment
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(
                'set_task_model',
                {
                  ...(model.trim() ? { model: model.trim() } : {}),
                  ...(provider.trim() ? { provider: provider.trim() } : {}),
                },
                'Task model',
              );
            }}
          >
            <div className="sdd-model-inputs">
              <label>
                Provider override
                <input
                  aria-label="Provider override"
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                  placeholder="Keep current provider"
                />
              </label>
              <label>
                Model override
                <input
                  aria-label="Model override"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="Use run default"
                />
              </label>
            </div>
            <button type="submit" className="button secondary" disabled={waiting}>
              Update model
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(
                'set_task_fallbacks',
                {
                  fallbackModels: fallbacks
                    .split('\n')
                    .map((item) => item.trim())
                    .filter(Boolean),
                },
                'Task fallbacks',
              );
            }}
          >
            <label>
              Fallback models, one per line
              <textarea
                aria-label="Fallback models"
                value={fallbacks}
                onChange={(event) => setFallbacks(event.target.value)}
              />
            </label>
            <button type="submit" className="button secondary" disabled={waiting}>
              Update fallbacks
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(
                'set_task_verification',
                { verificationCommand: verification.trim() },
                'Task verification',
              );
            }}
          >
            <label>
              Verification command
              <input
                aria-label="Verification command"
                value={verification}
                onChange={(event) => setVerification(event.target.value)}
                placeholder="Completion gate command"
              />
            </label>
            <button type="submit" className="button secondary" disabled={waiting}>
              Update verification
            </button>
          </form>
          {['pending', 'blocked', 'queued'].includes(status) && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (parseSddSubtasks(splitText).length) setConfirmSplit(true);
              }}
            >
              <label>
                Split into subtasks
                <textarea
                  aria-label="Split into subtasks"
                  value={splitText}
                  onChange={(event) => {
                    setSplitText(event.target.value);
                    setConfirmSplit(false);
                  }}
                  placeholder={'One task per line: Title :: description'}
                />
              </label>
              {confirmSplit ? (
                <>
                  <p>
                    Create {parseSddSubtasks(splitText).length} subtasks and mark the parent as a
                    completed container. Subtasks inherit its blockers; dependent work waits for all
                    subtasks.
                  </p>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={waiting}
                    onClick={() => {
                      setConfirmSplit(false);
                      void mutate(
                        'split_task',
                        { subtasks: parseSddSubtasks(splitText) },
                        'Task split',
                      );
                    }}
                  >
                    Confirm split
                  </button>
                  <button type="button" onClick={() => setConfirmSplit(false)}>
                    Keep task
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  className="button secondary"
                  disabled={!parseSddSubtasks(splitText).length || waiting}
                >
                  Review split
                </button>
              )}
            </form>
          )}
        </div>
      )}
      {feed.length > 0 && (
        <div className="sdd-task-history">
          <h4>Task activity</h4>
          {feed.slice(-30).map((item, index) => (
            <article key={`${String(item['ts'])}-${index}`}>
              <strong>{label(item['kind'])}</strong>
              <p>{typeof item['text'] === 'string' ? item['text'] : 'No details recorded'}</p>
              {typeof item['detail'] === 'string' && <p>{item['detail']}</p>}
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}
