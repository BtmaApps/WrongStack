'use client';

import { Check, CircleAlert, Square, Users } from 'lucide-react';
import { hasAgentWork, isActiveAgent } from '../lib/agent-state';
import type { SessionState } from '../lib/session';

export function SessionWorkStatus({
  state,
  connected,
  canStop,
  onWatch,
  onStop,
}: {
  state: Pick<SessionState, 'running' | 'runOutcome' | 'agents'>;
  connected: boolean;
  canStop: boolean;
  onWatch: () => void;
  onStop: () => void;
}) {
  const active = state.agents.filter((agent) => isActiveAgent(agent.status));
  const worked = state.agents.filter(hasAgentWork);
  if (!active.length && (state.running || !state.runOutcome)) return null;
  const failed = worked.some((agent) => ['failed', 'error'].includes(agent.status));
  const stopped = worked.some((agent) =>
    ['stopped', 'interrupted', 'cancelled', 'aborted'].includes(agent.status),
  );
  const title = !connected
    ? 'Work status may be stale'
    : active.length
      ? `${state.running ? 'Leader is working' : state.runOutcome === 'done' ? 'Leader finished' : state.runOutcome === 'aborted' ? 'Leader stopped' : state.runOutcome === 'error' ? 'Leader failed' : 'Leader is idle'} · ${active.length} ${active.length === 1 ? 'agent is' : 'agents are'} still working`
      : state.runOutcome === 'aborted'
        ? 'Work stopped'
        : state.runOutcome === 'error'
          ? 'Work ended with an error'
          : failed
            ? 'Work finished with agent errors'
            : stopped
              ? 'Work finished · Some agents stopped'
              : 'All work finished';
  return (
    <section
      className="session-work-status"
      aria-label="Session work status"
      data-state={
        !connected
          ? 'attention'
          : active.length
            ? 'active'
            : failed || stopped || state.runOutcome !== 'done'
              ? 'attention'
              : 'done'
      }
    >
      <div className="session-work-message" role="status">
        {active.length ? (
          <Users size={16} />
        ) : connected && state.runOutcome === 'done' && !failed && !stopped ? (
          <Check size={16} />
        ) : (
          <CircleAlert size={16} />
        )}
        <div>
          <strong>{title}</strong>
          <p>
            {!connected
              ? 'Reconnect to confirm the latest leader and agent state.'
              : active.length
                ? `${active
                    .slice(0, 3)
                    .map((agent) => agent.name)
                    .join(', ')}${active.length > 3 ? ` and ${active.length - 3} more` : ''}`
                : 'The leader and all agents are no longer running.'}
          </p>
        </div>
      </div>
      {(active.length > 0 || worked.length > 0) && (
        <div className="session-work-actions">
          <button type="button" className="secondary-button" onClick={onWatch}>
            <Users size={13} />
            {active.length ? 'Watch agents' : 'View agents'}
          </button>
          {active.length > 0 && (
            <button
              type="button"
              className="secondary-button"
              disabled={!connected || !canStop}
              onClick={onStop}
            >
              <Square size={12} />
              Stop all agents
            </button>
          )}
        </div>
      )}
    </section>
  );
}
