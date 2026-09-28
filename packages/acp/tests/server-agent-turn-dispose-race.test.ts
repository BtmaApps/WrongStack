/**
 * A session closed or deleted while its turn is in flight. dispose() used to
 * run before the lazily-built Agent existed (or before the turn recorded its
 * history), so the turn then stored an Agent nobody would tear down, its
 * event-bus listeners, and replay history for a session that no longer
 * exists — session ids are never reused, so all of it leaked.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeACPServerAgentTurn } from '../src/agent/server-agent-turn.js';

function fakeAgent(run: () => Promise<unknown>) {
  const listeners = new Set<string>();
  return {
    listeners,
    teardown: vi.fn(async () => undefined),
    run,
    events: {
      on: (name: string) => {
        listeners.add(name);
        return () => listeners.delete(name);
      },
    },
  };
}

const input = (sessionId: string) => ({
  sessionId,
  prompt: [{ type: 'text' as const, text: 'hi' }],
  modeId: 'code',
  configOptions: [],
  signal: new AbortController().signal,
});

describe('makeACPServerAgentTurn dispose during a turn', () => {
  it('tears down an agent finished after its session was disposed', async () => {
    const agent = fakeAgent(async () => ({ text: 'answer' }));
    let release: () => void = () => {};
    const turn = makeACPServerAgentTurn({
      agentFor: async () => {
        await new Promise<void>((r) => {
          release = r;
        });
        return agent as never;
      },
    });
    const running = turn(input('s1'), () => {}); // agentFor is now awaiting release
    turn.dispose('s1');
    release();
    await expect(running).resolves.toEqual({ stopReason: 'cancelled' });
    await vi.waitFor(() => expect(agent.teardown).toHaveBeenCalledTimes(1));
    expect(turn.replay('s1')).toEqual([]);
    expect(agent.listeners.size).toBe(0);
  });

  it('contains a stale agent whose teardown throws', async () => {
    const agent = {
      ...fakeAgent(async () => ({ text: 'answer' })),
      teardown: () => {
        throw new Error('teardown broke');
      },
    };
    let release: () => void = () => {};
    const turn = makeACPServerAgentTurn({
      agentFor: async () => {
        await new Promise<void>((r) => {
          release = r;
        });
        return agent as never;
      },
    });
    const running = turn(input('s4'), () => {});
    turn.dispose('s4');
    release();
    await expect(running).resolves.toEqual({ stopReason: 'cancelled' });
  });

  it('records no replay history for a session disposed mid-run', async () => {
    let finish: () => void = () => {};
    const agent = fakeAgent(
      () =>
        new Promise((r) => {
          finish = () => r({ text: 'answer' });
        }),
    );
    const turn = makeACPServerAgentTurn({ agentFor: () => agent as never });
    const running = turn(input('s2'), () => {});
    await vi.waitFor(() => expect(agent.listeners.size).toBeGreaterThan(0));
    turn.dispose('s2');
    finish();
    await running;
    expect(turn.replay('s2')).toEqual([]);
  });

  it('still records history and keeps the agent for a live session', async () => {
    const agent = fakeAgent(async () => ({ text: 'answer' }));
    const agentFor = vi.fn(() => agent as never);
    const turn = makeACPServerAgentTurn({ agentFor });
    await turn(input('s3'), () => {});
    await turn(input('s3'), () => {});
    expect(agentFor).toHaveBeenCalledTimes(1);
    expect(agent.teardown).not.toHaveBeenCalled();
    expect(turn.replay('s3').length).toBeGreaterThan(0);
  });
});
