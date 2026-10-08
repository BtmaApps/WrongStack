import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type {
  GoalWSMessage,
  GoalWsHandlerInternals,
} from '../src/server/goal-ws-handler-internals.js';
import { dispatchGoalMessage } from '../src/server/goal-ws-message-dispatch.js';

/**
 * Regression guard: `goal.*` board-mutation frames whose `payload` is absent
 * (malformed client, reconnect replay) must degrade to a graceful no-op or an
 * explicit `goal.error` frame — never a TypeError from destructuring
 * `undefined`, which upstream only logs as message_handler_failed.
 */

// Real timers not required; the graph fixture carries task t1 in phase p1 so
// the control case exercises the real mutation path.
function createWs(): WebSocket {
  return {} as WebSocket;
}

function createHost(overrides: { graph?: null } = {}) {
  const task = { id: 't1', status: 'pending', updatedAt: 0 };
  const graph =
    overrides.graph === null
      ? null
      : {
          phases: new Map([['p1', { taskGraph: { nodes: new Map([['t1', task]]) } }]]),
          updatedAt: 0,
        };
  const mocks = {
    broadcast: vi.fn(),
    broadcastState: vi.fn(),
    save: vi.fn(async () => undefined),
  };
  const host = {
    graph,
    orchestrator: null,
    broadcast: mocks.broadcast,
    broadcastState: mocks.broadcastState,
    persistence: { save: mocks.save },
  } as unknown as GoalWsHandlerInternals;
  return { host, task, mocks };
}

// The five destructuring sites (goal.retryTask/goal.runTask share one).
const BOARD_MUTATION_TYPES = [
  'goal.taskStatus',
  'goal.moveTask',
  'goal.assignTask',
  'goal.addTask',
  'goal.retryTask',
  'goal.runTask',
] as const;

describe('dispatchGoalMessage payload-less board-mutation frames', () => {
  for (const type of BOARD_MUTATION_TYPES) {
    it(`resolves a payload-less ${type} frame without throwing`, async () => {
      // retryTask/runTask fall through to a throwaway PhaseOrchestrator when
      // a graph is present; keep those two on a graph-less host so the test
      // isolates the destructuring fix.
      const { host } = createHost(
        type === 'goal.retryTask' || type === 'goal.runTask' ? { graph: null } : {},
      );
      await expect(
        dispatchGoalMessage(host, createWs(), { type } as GoalWSMessage),
      ).resolves.toBeUndefined();
    });
  }

  it('answers a payload-less goal.taskStatus with an explicit error frame and no state change', async () => {
    const { host, task, mocks } = createHost();
    await dispatchGoalMessage(host, createWs(), { type: 'goal.taskStatus' } as GoalWSMessage);
    expect(mocks.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'goal.error',
        payload: expect.objectContaining({
          message: expect.stringContaining('Invalid task status'),
        }),
      }),
    );
    expect(task.status).toBe('pending');
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.broadcastState).not.toHaveBeenCalled();
  });

  it('still applies a payload-bearing goal.taskStatus (control)', async () => {
    const { host, task, mocks } = createHost();
    await dispatchGoalMessage(host, createWs(), {
      type: 'goal.taskStatus',
      payload: { taskId: 't1', status: 'in_progress' },
    } as GoalWSMessage);
    expect(task.status).toBe('in_progress');
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.broadcastState).toHaveBeenCalledTimes(1);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
});
