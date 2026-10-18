// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentMonitor } from '../src/components/agent-monitor';
import { SessionWorkStatus } from '../src/components/session-work-status';
import { initialState, reduceFrame, type SessionState } from '../src/lib/session';

function withWorker(status = 'running') {
  return reduceFrame(initialState(), {
    type: 'agent.status_changed',
    payload: {
      subagentId: 'reviewer',
      agentName: 'Reviewer',
      status,
      description: 'Review runtime',
      model: 'worker-model',
    },
  });
}
function render(state: SessionState, connected = true) {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = renderToStaticMarkup(
    createElement(SessionWorkStatus, {
      state,
      connected,
      canStop: true,
      onWatch: () => {},
      onStop: () => {},
    }),
  );
  return doc;
}
describe('leader and worker completion in chat', () => {
  it('shows the leader is finished while workers continue, with watch and stop actions', () => {
    const doc = render({ ...withWorker(), runOutcome: 'done' });
    expect(doc.body.textContent).toContain('Leader finished · 1 agent is still working');
    expect(doc.body.textContent).toContain('Reviewer');
    expect(doc.body.textContent).toContain('Watch agents');
    expect(doc.body.textContent).toContain('Stop all agents');
    expect(doc.body.textContent).not.toContain('All work finished');
  });
  it('shows full completion only once the last worker finishes', () => {
    const state = reduceFrame(
      { ...withWorker(), runOutcome: 'done' },
      {
        type: 'subagent.event',
        payload: {
          subagentId: 'reviewer',
          kind: 'task_completed',
          status: 'done',
          finalText: 'Reviewed.',
        },
      },
    );
    const doc = render(state);
    expect(doc.body.textContent).toContain('All work finished');
    expect(doc.body.textContent).toContain('View agents');
    expect(doc.body.textContent).not.toContain('Stop all agents');
  });
  it.each(['aborted', 'error'] as const)(
    'does not report successful completion after leader outcome %s',
    (runOutcome) => {
      const doc = render({ ...initialState(), runOutcome });
      expect(doc.body.textContent).not.toContain('All work finished');
      expect(doc.querySelector('[role="status"]')).not.toBeNull();
    },
  );
  it('keeps an agent failure visible instead of claiming success', () => {
    expect(render({ ...withWorker('failed'), runOutcome: 'done' }).body.textContent).toContain(
      'Work finished with agent errors',
    );
  });
  it('does not claim completion while disconnected, and disables stop', () => {
    const doc = render({ ...withWorker(), runOutcome: 'done' }, false);
    expect(doc.body.textContent).toContain('Work status may be stale');
    expect(doc.querySelectorAll('button:disabled')).toHaveLength(1);
  });
  it('stays quiet in a fresh session', () => {
    expect(render(initialState()).body.textContent).toBe('');
  });
  it('shows recently finished workers in the monitor without requiring a refresh or inactive toggle', () => {
    const state = withWorker('completed');
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = renderToStaticMarkup(
      createElement(AgentMonitor, { agents: state.agents, connected: true }),
    );
    expect(doc.body.textContent).toContain('All agents finished');
    expect(doc.querySelector('.agent-card')?.textContent).toContain('Reviewer');
  });
  it('does not label a prewarmed agent with a task description as finished', () => {
    const state = withWorker('idle');
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = renderToStaticMarkup(
      createElement(AgentMonitor, { agents: state.agents, connected: true }),
    );
    expect(doc.body.textContent).not.toContain('All agents finished');
    expect(doc.querySelector('.agent-card')).toBeNull();
  });
});
