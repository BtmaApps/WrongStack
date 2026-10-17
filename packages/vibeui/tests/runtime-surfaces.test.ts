import { describe, expect, it } from 'vitest';
import { assistantProjection } from '../src/lib/assistant-projection';
import { initialState, reduceFrame } from '../src/lib/session';

const start = () =>
  reduceFrame(initialState(), {
    type: 'session.start',
    payload: {
      sessionId: 'one',
      provider: 'account',
      model: 'model',
      maxContext: 10000,
      appVersion: '1.2.3',
      latestVersion: '1.2.4',
      updateAvailable: true,
    },
  });

describe('runtime controls and context', () => {
  it('merges shared and scoped preference broadcasts without erasing autonomy or YOLO', () => {
    let state = reduceFrame(start(), {
      type: 'prefs.updated',
      payload: { sessionId: 'one', autonomy: 'auto', yolo: true },
    });
    state = reduceFrame(state, { type: 'prefs.updated', payload: { reasoningEffort: 'high' } });
    expect(state.prefs).toMatchObject({ autonomy: 'auto', yolo: true, reasoningEffort: 'high' });
    expect(
      reduceFrame(state, { type: 'prefs.updated', payload: { sessionId: 'other', yolo: false } }),
    ).toBe(state);
  });
  it('preserves authoritative version information and reports successful compaction only on its event', () => {
    const state = start();
    expect(state).toMatchObject({
      appVersion: '1.2.3',
      latestVersion: '1.2.4',
      updateAvailable: true,
    });
    const result = reduceFrame(state, {
      type: 'context.compacted',
      payload: { sessionId: 'one', before: 6000, after: 2500 },
    });
    expect(result.tokens).toBe(2500);
    expect(result.load).toBe(0.25);
    expect(
      reduceFrame(result, {
        type: 'context.compacted',
        payload: { sessionId: 'foreign', after: 2 },
      }),
    ).toBe(result);
  });
  it('keeps cumulative cache usage separate from current request coverage', () => {
    let state = reduceFrame(start(), {
      type: 'ctx.pct',
      payload: { sessionId: 'one', tokens: 1200, maxContext: 10000, load: 0.12 },
    });
    state = reduceFrame(state, {
      type: 'stats.get',
      payload: {
        sessionId: 'one',
        cache: { readTokens: 90000, writeTokens: 7000, hitRatio: 0.75, last: { hitRatio: 0.8 } },
        currentRequest: { cacheRead: 1500 },
      },
    });
    expect(state.cache).toMatchObject({
      readTokens: 90000,
      writeTokens: 7000,
      hitRatio: 0.75,
      lastHitRatio: 0.8,
      coverageTokens: 1200,
    });
    expect(
      reduceFrame(state, {
        type: 'ctx.pct',
        payload: { tokens: 1400, maxContext: 10000, load: 0.14 },
      }).cache,
    ).toBe(state.cache);
    expect(
      reduceFrame(state, {
        type: 'session.start',
        payload: { sessionId: 'two', model: 'different' },
      }).cache,
    ).toBeNull();
  });
});

describe('next steps', () => {
  const reply =
    'Ready.\n<nextsteps>\n1. Add keyboard navigation\n2. Verify mobile layout\n</nextsteps>';
  it('uses the canonical parser, strips control metadata and hides partial streaming tags', () => {
    expect(assistantProjection(reply)).toEqual({
      text: 'Ready.',
      steps: [
        { index: 1, text: 'Add keyboard navigation' },
        { index: 2, text: 'Verify mobile layout' },
      ],
    });
    expect(assistantProjection('Ready.\n<nextsteps>\n1. Add')).toEqual({
      text: 'Ready.',
      steps: [],
    });
    expect(assistantProjection('Complete.\n<nextsteps-complete/>').text).toBe('Complete.');
  });
  it('does not turn fenced examples into actionable suggestions or truncate user documentation', () => {
    const example = 'Example:\n```xml\n<nextsteps>\n1. Example only\n</nextsteps>\n```';
    expect(assistantProjection(example)).toEqual({ text: example, steps: [] });
  });
  it('gates suggestions on terminal replies and preserves terminal replay metadata', () => {
    let state = reduceFrame(start(), {
      type: 'provider.response',
      payload: { sessionId: 'one', content: reply, stopReason: 'tool_use' },
    });
    expect(state.messages.at(-1)?.final).toBe(false);
    state = reduceFrame(state, {
      type: 'provider.response',
      payload: { sessionId: 'one', content: reply, stopReason: 'end_turn' },
    });
    expect(state.messages.at(-1)?.final).toBe(true);
    state = reduceFrame(state, {
      type: 'session.start',
      payload: { sessionId: 'two', replayMessages: [{ role: 'assistant', content: reply }] },
    });
    expect(state.messages.at(-1)?.final).toBe(true);
  });
});

describe('subagent observability', () => {
  it('hydrates worker replay and current snapshots without mixing sessions', () => {
    let state = reduceFrame(initialState(), {
      type: 'session.start',
      payload: {
        sessionId: 'one',
        agentSessions: [
          {
            subagentId: 'restored',
            agentName: 'Reviewer',
            status: 'running',
            model: 'replay-model',
            task: 'Review runtime',
            transcript: [
              { kind: 'text', content: 'Persisted agent output', ts: '2026-10-17T10:00:00Z' },
            ],
          },
        ],
      },
    });
    expect(state.agents[0]).toMatchObject({
      name: 'Reviewer',
      model: 'replay-model',
      task: 'Review runtime',
      status: 'running',
    });
    expect(state.agents[0]?.entries[0]?.content).toBe('Persisted agent output');
    state = reduceFrame(state, {
      type: 'sessions.status_update',
      payload: {
        sessions: [
          { sessionId: 'foreign', agents: [{ id: 'foreign-worker', model: 'wrong-model' }] },
          {
            sessionId: 'one',
            agents: [
              {
                id: 'restored',
                name: 'Reviewer',
                status: 'running',
                model: 'live-model',
                partialText: 'Latest work',
                tokensIn: 999999,
                currentTask: 'Review live state',
              },
            ],
          },
        ],
      },
    });
    expect(state.agents).toHaveLength(1);
    expect(state.agents[0]).toMatchObject({
      model: 'live-model',
      partialText: 'Latest work',
      task: 'Review live state',
      tokens: 0,
    });
  });
  it('keeps model and task through telemetry/status snapshots and records completion output', () => {
    let state = reduceFrame(start(), {
      type: 'subagent.event',
      payload: {
        sessionId: 'one',
        subagentId: 'worker',
        kind: 'spawned',
        name: 'Reviewer',
        provider: 'account',
        model: 'worker-model',
        description: 'Review auth flow',
      },
    });
    state = reduceFrame(state, {
      type: 'subagent.event',
      payload: { sessionId: 'one', subagentId: 'worker', kind: 'task_started' },
    });
    state = reduceFrame(state, {
      type: 'coordinator.stats',
      payload: {
        sessionId: 'one',
        subagentStatuses: [
          { id: 'worker', name: 'worker', status: 'running', currentTask: 'task-42' },
        ],
      },
    });
    state = reduceFrame(state, {
      type: 'subagent.event',
      payload: {
        sessionId: 'one',
        subagentId: 'worker',
        kind: 'iteration_summary',
        iteration: 3,
        toolCalls: 5,
        currentTool: 'read_file',
      },
    });
    expect(state.agents[0]).toMatchObject({
      name: 'Reviewer',
      model: 'worker-model',
      provider: 'account',
      status: 'running',
      iterations: 3,
      currentTool: 'read_file',
    });
    state = reduceFrame(state, {
      type: 'subagent.event',
      payload: {
        sessionId: 'one',
        subagentId: 'worker',
        kind: 'task_completed',
        status: 'done',
        finalText: 'Review complete',
      },
    });
    expect(state.agents[0]?.entries.at(-1)?.content).toBe('Review complete');
    expect(state.agents[0]?.model).toBe('worker-model');
    expect(state.agents[0]?.currentTool).toBe('');
  });
  it('isolates sessions, ignores leader rows and bounds transcript entries without duplicate keys', () => {
    const state = start();
    expect(
      reduceFrame(state, {
        type: 'subagent.event',
        payload: { sessionId: 'foreign', subagentId: 'x', kind: 'spawned' },
      }),
    ).toBe(state);
    expect(
      reduceFrame(state, {
        type: 'subagent.event',
        payload: { sessionId: 'one', subagentId: 'leader', kind: 'spawned' },
      }),
    ).toBe(state);
    let populated = state;
    for (let i = 0; i < 220; i++)
      populated = reduceFrame(populated, {
        type: 'agent.timeline.message',
        payload: { sessionId: 'one', subagentId: 'worker', content: `entry ${i}`, kind: 'text' },
      });
    expect(populated.agents[0]?.entries).toHaveLength(100);
    expect(new Set(populated.agents[0]?.entries.map((entry) => entry.id)).size).toBe(100);
  });
});
