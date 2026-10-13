/**
 * `initialModeId`: a host that decides permissions itself starts the agent in
 * the mode where it asks (Claude's `default`), whatever mode the user runs
 * the agent in on their own.
 */
import { describe, expect, it, vi } from 'vitest';
import { type ACPSessionOpContext, executeCreateSession } from '../src/client/acp-session-ops.js';

function ctx(newSessionResult: unknown, initialModeId?: string) {
  const calls: Array<{ method: string; params: unknown }> = [];
  let id = 0;
  const c = {
    closed: false,
    sessionId: null,
    agentCapabilities: {},
    opts: { command: 'agent', projectRoot: '/p', ...(initialModeId ? { initialModeId } : {}) },
    allocId: () => ++id,
    sendRequest: vi.fn(async (_id: number, method: string, params: unknown) => {
      calls.push({ method, params });
      return method === 'session/new' ? newSessionResult : {};
    }),
    setSessionId: () => {},
    resetScratch: () => {},
    closeSession: async () => {},
  } as unknown as ACPSessionOpContext;
  return { c, calls };
}

const modes = (current: string) => ({
  sessionId: 's1',
  modes: {
    currentModeId: current,
    availableModes: [{ id: 'auto' }, { id: 'default' }, { id: 'acceptEdits' }],
  },
});

describe('executeCreateSession initialModeId', () => {
  it('switches to the requested mode when the agent offers it', async () => {
    const { c, calls } = ctx(modes('auto'), 'default');
    await expect(executeCreateSession(c)).resolves.toBe('s1');
    expect(calls.map((x) => x.method)).toEqual(['session/new', 'session/set_mode']);
    expect(calls[1]?.params).toEqual({ sessionId: 's1', modeId: 'default' });
  });

  it('sends nothing more when already in that mode, not offered, or not asked', async () => {
    for (const [result, want] of [
      [modes('default'), 'default'],
      [modes('auto'), 'plan-only'],
      [{ sessionId: 's1' }, 'default'],
      [modes('auto'), undefined],
    ] as const) {
      const { c, calls } = ctx(result, want);
      await executeCreateSession(c);
      expect(calls.map((x) => x.method)).toEqual(['session/new']);
    }
  });

  it('fails the session when the switch fails, rather than run in the wrong mode', async () => {
    const { c } = ctx(modes('auto'), 'default');
    (c.sendRequest as ReturnType<typeof vi.fn>).mockImplementation(
      async (_id: number, method: string) =>
        method === 'session/set_mode' ? { code: -32603, message: 'mode refused' } : modes('auto'),
    );
    await expect(executeCreateSession(c)).rejects.toThrow('session/set_mode failed: mode refused');
  });
});
