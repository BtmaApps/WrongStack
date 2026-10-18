'use client';

import { ArrowUpRight } from 'lucide-react';
import type { ToolEntry } from '../lib/session';
import { RunSignal } from './vibe-visuals';

const statusLabels: Record<ToolEntry['status'], string> = {
  running: 'Running',
  done: 'Completed',
  error: 'Failed',
  interrupted: 'Interrupted',
};

export function WorkingActivity({
  tools,
  onInspect,
  onViewActivity,
}: {
  tools: ToolEntry[];
  onInspect: (id: string) => void;
  onViewActivity: () => void;
}) {
  const activeTool = tools.filter((tool) => tool.status === 'running').at(-1);
  const recent = tools.slice(-3).reverse();
  return (
    <div className="working-activity">
      <div className="working-line">
        <RunSignal />
        <span className="working-label" role="status">
          {activeTool ? `${activeTool.name} is running` : 'Working on it'}
        </span>
        <button type="button" onClick={onViewActivity}>
          View activity <ArrowUpRight size={12} />
        </button>
      </div>
      {recent.length > 0 && (
        <ul className="recent-tools" aria-label="Recent tool calls">
          {recent.map((tool) => (
            <li key={tool.id}>
              <button
                type="button"
                aria-label={`Inspect ${tool.name} · ${statusLabels[tool.status]}`}
                title={`Inspect ${tool.name}`}
                onClick={() => onInspect(tool.id)}
              >
                <span
                  className={`status-dot ${tool.status === 'running' ? 'busy' : tool.status === 'error' || tool.status === 'interrupted' ? 'error' : ''}`}
                  aria-hidden="true"
                />
                <span className="recent-tool-name">{tool.name}</span>
                <span className="recent-tool-status">{statusLabels[tool.status]}</span>
                <ArrowUpRight size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
