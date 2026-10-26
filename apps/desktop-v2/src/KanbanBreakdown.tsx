import type { KanbanDecompositionProposal } from '@wrongstack/webui-server';
import { GitBranch, Scissors } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { entries, record } from './engine-values';
import { GraphCanvas } from './GraphCanvas';
import type { VisualGraph } from './graph-model';

type Row = Record<string, unknown>;
export function KanbanBreakdown({
  task,
  board,
  command,
  onRefresh,
  onSelect,
  disabled,
}: {
  task: Row;
  board: Row;
  command: EngineCommand;
  onRefresh: () => Promise<void>;
  onSelect: (task: Row) => void;
  disabled: boolean;
}) {
  const proposal = record(task['decomposition']) as Partial<KanbanDecompositionProposal>;
  const [edits, setEdits] = useState(() => entries(proposal['proposedSubtasks']));
  const [reason, setReason] = useState(''),
    [titles, setTitles] = useState(''),
    [chain, setChain] = useState(true),
    [inheritChecks, setInheritChecks] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const graph = useMemo<VisualGraph>(
    () => ({
      nodes: edits.map((item, i) => ({
        id: `part-${i}`,
        label: String(item['title']),
        detail: `${Array.isArray(item['successCriteria']) ? item['successCriteria'].length : 0} checks`,
        group: 'Proposed work',
        weight: 0.5,
        data: item,
      })),
      edges: edits.flatMap((item, i) =>
        (Array.isArray(item['dependsOnIndex']) ? item['dependsOnIndex'] : [])
          .filter((index) => Number.isInteger(index) && index >= 0 && index < edits.length)
          .map((index) => ({
            source: `part-${i}`,
            target: `part-${index}`,
            label: 'depends on',
            weight: 1,
          })),
      ),
    }),
    [edits],
  );
  const act = async (type: string, payload: Row) => {
    setBusy(true);
    setError('');
    try {
      await command(type, { boardId: board['id'], taskId: task['id'], ...payload }, [type], {
        timeoutMs: 45000,
      });
      setTitles('');
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const children = entries(board['tasks']).filter(
    (t) =>
      t['parentTaskId'] === task['id'] ||
      (Array.isArray(task['childTaskIds']) && task['childTaskIds'].includes(t['id'])),
  );
  const pending = proposal['status'] === 'proposed';
  return (
    <section className="kanban-breakdown" aria-label="Task breakdown">
      <header className="task-section-heading">
        <GitBranch size={18} />
        <div>
          <h2>Break work into outcomes</h2>
          <p>Review the engine's proposal or split this task into explicit child cards.</p>
        </div>
      </header>
      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}
      {Object.keys(proposal).length > 0 && (
        <section className="task-decomposition-proposal">
          <div className="task-status-spine">
            <strong>{String(proposal['status'])}</strong>
            <small>{String(proposal['mode'])} mode</small>
          </div>
          {Boolean(proposal['rationale']) && <p>{String(proposal['rationale'])}</p>}
          <GraphCanvas
            graph={graph}
            selected={selected}
            onSelect={setSelected}
            layout="layers"
            label="Proposed task dependency graph"
            empty={<p>No proposed child tasks.</p>}
          />
          {edits.map((item, i) => (
            <div className="task-proposal-child" key={i}>
              <label>
                Child {i + 1}
                <input
                  aria-label={`Proposed child ${i + 1}`}
                  value={String(item['title'])}
                  disabled={!pending || busy || disabled}
                  onChange={(e) =>
                    setEdits(edits.map((v, j) => (j === i ? { ...v, title: e.target.value } : v)))
                  }
                />
              </label>
              <label>
                Acceptance criteria
                <textarea
                  aria-label={`Proposed child ${i + 1} checks`}
                  value={
                    Array.isArray(item['successCriteria']) ? item['successCriteria'].join('\n') : ''
                  }
                  disabled={!pending || busy || disabled}
                  rows={3}
                  onChange={(e) =>
                    setEdits(
                      edits.map((v, j) =>
                        j === i
                          ? {
                              ...v,
                              successCriteria: e.target.value.split('\n').filter((s) => s.trim()),
                            }
                          : v,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
          {pending && (
            <>
              <label>
                Review reason
                <input
                  aria-label="Decomposition review reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="sage-reader-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={
                    disabled ||
                    busy ||
                    !edits.length ||
                    edits.some((e) => !String(e['title']).trim())
                  }
                  onClick={() =>
                    void act('kanban.decomposition.approve', {
                      proposalId: proposal['id'],
                      edits,
                      reason,
                    })
                  }
                >
                  Approve decomposition
                </button>
                <button
                  type="button"
                  className="button secondary danger"
                  disabled={disabled || busy}
                  onClick={() =>
                    void act('kanban.decomposition.reject', { proposalId: proposal['id'], reason })
                  }
                >
                  Reject proposal
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {children.length > 0 && (
        <section>
          <h3>Child tasks · {children.length}</h3>
          {children.map((child) => (
            <button
              type="button"
              className="task-related"
              key={String(child['id'])}
              onClick={() => onSelect(child)}
            >
              {String(child['title'])}
              <small>{String(child['status'])}</small>
            </button>
          ))}
        </section>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act('kanban.task.split', {
            childTitles: titles
              .split('\n')
              .map((t) => t.trim())
              .filter(Boolean),
            chainChildren: chain,
            inheritSuccessCriteria: inheritChecks,
            inheritAssignment: false,
            inheritLabels: true,
            inheritDependencies: true,
            rewireDependents: true,
          });
        }}
      >
        <h3>Manual split</h3>
        <label>
          Child outcomes · one per line
          <textarea
            aria-label="Child task titles"
            rows={5}
            required
            value={titles}
            onChange={(e) => setTitles(e.target.value)}
            placeholder={'Implement the parser\nVerify malformed inputs\nDocument the contract'}
          />
        </label>
        <label className="task-inline-check">
          <input type="checkbox" checked={chain} onChange={(e) => setChain(e.target.checked)} />
          Chain children in this order
        </label>
        <label className="task-inline-check">
          <input
            type="checkbox"
            checked={inheritChecks}
            onChange={(e) => setInheritChecks(e.target.checked)}
          />
          Copy parent acceptance criteria
        </label>
        <p className="field-help">
          Children inherit labels and dependencies, with no active worker claim. Dependents are
          rewired by the engine.
        </p>
        <button
          type="submit"
          className="button secondary"
          disabled={disabled || busy || titles.split('\n').filter((t) => t.trim()).length < 2}
        >
          <Scissors size={13} />
          {busy ? 'Splitting…' : 'Split into child tasks'}
        </button>
      </form>
    </section>
  );
}
