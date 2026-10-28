import { useEffect, useRef, useState } from 'react';
import type { EngineSend } from './engine-operations';
import { type EngineState, entries } from './engine-state';

type Operation = 'cleanup_worktrees' | 'rollback' | 'destroy';
const titles: Record<Operation, string> = {
  cleanup_worktrees: 'Clean managed worktrees',
  rollback: 'Revert merged commits',
  destroy: 'Clear project SDD',
};

export function SddLifecycle({
  state,
  board,
  boards,
  send,
}: {
  state: EngineState;
  board: Record<string, unknown>;
  boards: Record<string, unknown>[];
  send: EngineSend;
}) {
  const [operation, setOperation] = useState<Operation | null>(null);
  const [pending, setPending] = useState<Operation | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [revertMerged, setRevertMerged] = useState(false);
  const seenResult = useRef(state.results['sdd.board.lifecycle_result']);
  const runId = typeof board['runId'] === 'string' ? board['runId'] : '';
  const active = [board, ...boards].some((item) =>
    ['running', 'paused'].includes(String(item['status'])),
  );
  const loaded = Boolean(state.results['sdd.board.list']);
  const merged = entries(board['mergedCommits']);
  useEffect(() => {
    setOperation(null);
    setRevertMerged(false);
  }, [runId]);
  useEffect(() => {
    const incoming = state.results['sdd.board.lifecycle_result'];
    if (!incoming || incoming === seenResult.current) return;
    seenResult.current = incoming;
    if (!pending || incoming['op'] !== pending) return;
    setPending(null);
    setResult(incoming);
    if (incoming['ok'] === true) {
      const refresh =
        incoming['op'] === 'destroy'
          ? ['sdd.spec.discard', 'sdd.spec.get', 'specs.list', 'sdd.board.list', 'sdd.board.get']
          : ['sdd.board.list', 'sdd.board.get'];
      for (const type of refresh) void send(type).catch((e) => setError(String(e)));
    }
  }, [state.results['sdd.board.lifecycle_result'], pending, send]);
  const execute = async () => {
    if (!operation || active || !loaded) return;
    const op = operation;
    setOperation(null);
    setPending(op);
    setResult(null);
    setError('');
    try {
      await send(`sdd.board.${op}`, {
        ...(runId ? { runId } : {}),
        ...(op === 'destroy' ? { revertMerged } : {}),
      });
    } catch (e) {
      setPending(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="sdd-lifecycle" aria-label="SDD project maintenance">
      <span className="eyebrow">AFTER EXECUTION</span>
      <h3>Project maintenance</h3>
      <p>Manage retained worktrees, merged commits and SDD records for this project.</p>
      {active && <p>Stop active project runs before using maintenance operations.</p>}
      <div className="sdd-actions">
        {(['cleanup_worktrees', 'rollback', 'destroy'] as const).map((op) => (
          <button
            type="button"
            className="button secondary"
            key={op}
            disabled={
              !loaded ||
              active ||
              Boolean(pending) ||
              (op === 'rollback' && (!runId || !merged.length))
            }
            onClick={() => {
              setOperation(op);
              setRevertMerged(false);
            }}
          >
            {titles[op]}
          </button>
        ))}
      </div>
      {operation && (
        <div className="sdd-lifecycle-confirm">
          <h4>{titles[operation]}?</h4>
          <p>
            {operation === 'destroy'
              ? 'This clears all specifications, task graphs, interview state, SDD boards and mirrored SDD Kanban boards in this project. Managed worktrees and branches, including unmerged changes, are removed.'
              : operation === 'cleanup_worktrees'
                ? 'Remove all managed worktrees and their branches for this project, including unmerged changes.'
                : `Create history-preserving revert commits for this run’s ${merged.length} recorded merged commits. The engine requires the recorded base branch and a clean working tree.`}
          </p>
          {operation === 'destroy' && merged.length > 0 && (
            <label>
              <input
                type="checkbox"
                checked={revertMerged}
                onChange={(e) => setRevertMerged(e.target.checked)}
              />{' '}
              Also revert this run’s {merged.length} merged commits
            </label>
          )}
          {operation === 'destroy' && revertMerged && (
            <p>
              If reverting fails, the engine still clears the SDD records and reports the reason.
            </p>
          )}
          <div className="sdd-actions">
            <button type="button" className="button secondary" onClick={() => setOperation(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              disabled={active || Boolean(pending)}
              onClick={() => void execute()}
            >
              Confirm {titles[operation].toLowerCase()}
            </button>
          </div>
        </div>
      )}
      {pending && <p role="status">{titles[pending]} requested. Waiting for the engine result…</p>}
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="sdd-lifecycle-result" role="status">
          <strong>
            {result['ok'] !== true
              ? 'Operation refused'
              : result['reason']
                ? 'Completed with a warning'
                : 'Operation completed'}
          </strong>
          {typeof result['reason'] === 'string' && <p>{result['reason']}</p>}
          <dl>
            {typeof result['removed'] === 'number' && (
              <div>
                <dt>Worktrees removed</dt>
                <dd>{result['removed']}</dd>
              </div>
            )}
            {typeof result['reverted'] === 'number' && (
              <div>
                <dt>Commits reverted</dt>
                <dd>{result['reverted']}</dd>
              </div>
            )}
          </dl>
          {Array.isArray(result['deleted']) && result['deleted'].length > 0 && (
            <p>
              Cleared: {result['deleted'].filter((item) => typeof item === 'string').join(', ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
