import { describe, expect, it } from 'vitest';
import { initialState, reduceFrame } from '../src/lib/session';

function workingAgent() {
  let state = reduceFrame(initialState(), {
    type: 'session.start',
    payload: { sessionId: 'one', provider: 'fixture', model: 'fixture-model' },
  });
  state = reduceFrame(state, {
    type: 'subagent.event',
    payload: {
      sessionId: 'one',
      subagentId: 'worker',
      kind: 'task_started',
      name: 'Reviewer',
      description: 'Review changes',
    },
  });
  return reduceFrame(state, {
    type: 'agent.status_changed',
    payload: {
      sessionId: 'one',
      subagentId: 'worker',
      status: 'running',
      currentTool: 'read_file',
      partialText: 'Still reading…',
    },
  });
}

describe('agent lifecycle reconciliation', () => {
  it('drops stale active workers on a canonical same-session reconnect', () => {
    const state = reduceFrame(workingAgent(), {
      type: 'session.start',
      payload: { sessionId: 'one', provider: 'fixture', model: 'fixture-model', agentSessions: [] },
    });
    expect(state.agents).toEqual([]);
  });

  it('preserves work when an agent snapshot is omitted or malformed', () => {
    const state = workingAgent();
    for (const agents of [undefined, null, {}]) {
      expect(
        reduceFrame(state, {
          type: 'sessions.status_update',
          payload: { sessions: [{ sessionId: 'one', agents }] },
        }),
      ).toBe(state);
    }
  });

  it('records leader completion without marking a running worker complete, and resets for the next run', () => {
    let state = reduceFrame(workingAgent(), {
      type: 'run.result',
      payload: { sessionId: 'one', status: 'done', iterations: 1 },
    });
    expect(state.runOutcome).toBe('done');
    expect(state.running).toBe(false);
    expect(state.agents[0]?.status).toBe('running');
    state = reduceFrame(state, {
      type: 'session.run_state',
      payload: { sessionId: 'one', isRunning: true },
    });
    expect(state.runOutcome).toBeNull();
    state = reduceFrame(state, {
      type: 'run.result',
      payload: { sessionId: 'one', status: 'aborted', iterations: 1 },
    });
    expect(state.runOutcome).toBe('aborted');
  });
  it('settles disappeared active agents when the current session reports an authoritative empty fleet', () => {
    const state = workingAgent();
    const foreign = reduceFrame(state, {
      type: 'sessions.status_update',
      payload: { sessions: [{ sessionId: 'other', agents: [] }] },
    });
    expect(foreign).toBe(state);
    const next = reduceFrame(state, {
      type: 'sessions.status_update',
      payload: { sessions: [{ sessionId: 'one', agents: [] }] },
    });
    expect(next.agents[0]).toMatchObject({ status: 'stopped', currentTool: '' });
    expect(next.agents[0]?.task).toBe('Review changes');
  });

  it('replaces streaming output with the final result when a worker completes', () => {
    const state = reduceFrame(workingAgent(), {
      type: 'subagent.event',
      payload: {
        sessionId: 'one',
        subagentId: 'worker',
        kind: 'task_completed',
        status: 'done',
        finalText: 'Review complete.',
      },
    });
    expect(state.agents[0]?.partialText).toBe('');
    expect(state.agents[0]?.entries.at(-1)?.content).toBe('Review complete.');
    expect(state.agents[0]?.currentTool).toBe('');
  });

  it('clears stale tool activity on a terminal status update', () => {
    const state = reduceFrame(workingAgent(), {
      type: 'agent.status_changed',
      payload: { sessionId: 'one', subagentId: 'worker', status: 'idle' },
    });
    expect(state.agents[0]?.currentTool).toBe('');
  });
});
