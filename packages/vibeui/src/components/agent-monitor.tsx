'use client';

import { Users } from 'lucide-react';
import { useState } from 'react';
import type { AgentEntry } from '../lib/session';
import { Modal } from './dialogs';
import { MarkdownContent } from './markdown-content';

const active = (status: string) =>
  ['running', 'busy', 'working', 'active', 'starting', 'spawned'].includes(status);
export function AgentMonitor({ agents, connected }: { agents: AgentEntry[]; connected: boolean }) {
  const [selected, setSelected] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const visible = agents.filter((item) => showInactive || active(item.status));
  const agent = agents.find((item) => item.id === selected);
  const lastOutput =
    agent?.partialText ||
    agent?.entries.filter((entry) => ['text', 'result', 'error'].includes(entry.kind)).at(-1)
      ?.content;
  return (
    <section className="agent-monitor" aria-label="Subagents">
      <div className="panel-section-heading">
        <h2>Agents</h2>
        <span>{agents.filter((item) => active(item.status)).length} active</span>
      </div>
      <label className="inactive-toggle">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(event) => setShowInactive(event.target.checked)}
        />
        Show inactive ({agents.filter((item) => !active(item.status)).length})
      </label>
      {!visible.length && (
        <p className="panel-hint">No active agents. Delegated work will appear here.</p>
      )}
      {visible.map((item) => (
        <button
          type="button"
          className="agent-card"
          key={item.id}
          onClick={() => setSelected(item.id)}
        >
          <span
            className={`status-dot ${active(item.status) ? 'busy' : ['failed', 'error'].includes(item.status) ? 'error' : ''}`}
          />
          <span>
            <strong>{item.name}</strong>
            <small>{item.task || item.currentTool || 'Waiting for task details'}</small>
            <small>{item.model || 'Model not reported'}</small>
          </span>
          <small>{item.status}</small>
        </button>
      ))}
      <Modal
        open={Boolean(agent)}
        onOpenChange={(open) => {
          if (!open) setSelected('');
        }}
        title={agent?.name || 'Agent'}
        icon={<Users size={20} />}
        description="Task, model and latest activity for this session."
        wide
      >
        {agent && (
          <div className="agent-detail">
            {!connected && <p role="status">Disconnected - displayed activity may be stale.</p>}
            <div className="agent-summary">
              <span className={`status-dot ${active(agent.status) ? 'busy' : ''}`} />
              <small>{agent.status}</small>
              <strong>{agent.model || 'Model not reported'}</strong>
              {agent.provider && <small>{agent.provider}</small>}
            </div>
            <div className="agent-task">
              <small>Task</small>
              <p>{agent.task || 'No task description reported.'}</p>
            </div>
            <div className="agent-latest">
              <small>Latest output</small>
              {lastOutput ? (
                <MarkdownContent text={lastOutput.slice(-2500)} />
              ) : (
                <p className="panel-hint">Waiting for activity from this agent.</p>
              )}
            </div>
            <details className="agent-deeper">
              <summary>Detailed activity ({agent.entries.length})</summary>
              <p className="fine-print">
                {agent.iterations} iterations / {agent.toolCalls} tool calls. Older activity may be
                unavailable after reconnecting.
              </p>
              <div className="agent-transcript">
                {agent.entries.map((entry) => (
                  <details key={entry.id}>
                    <summary>
                      {entry.kind}
                      {entry.toolName ? ` - ${entry.toolName}` : ''}
                      {entry.ts && <time>{new Date(entry.ts).toLocaleTimeString()}</time>}
                    </summary>
                    <pre>{entry.content}</pre>
                  </details>
                ))}
              </div>
            </details>
          </div>
        )}
      </Modal>
    </section>
  );
}
