import { describe, expect, it, vi } from 'vitest';
import { makeACPServerAgentTurn } from '../src/agent/server-agent-turn.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('ACP disposed turn publication', () => {
  it.each([false, true])(
    'publishes only while the session is live (disposed=%s)',
    async (disposed) => {
      const entered = deferred();
      const completion = deferred();
      const handlers = new Map<string, (event: never) => void>();
      const turn = makeACPServerAgentTurn({
        agentFor: () =>
          ({
            run: async () => {
              entered.resolve();
              await completion.promise;
              return { text: 'answer' };
            },
            teardown: async () => {},
            events: {
              on: (name: string, handler: (event: never) => void) => {
                handlers.set(name, handler);
                return () => {
                  handlers.delete(name);
                };
              },
            },
          }) as never,
      });
      const emit = vi.fn();
      const pending = turn(
        {
          sessionId: 's1',
          prompt: [{ type: 'text', text: 'hi' }],
          modeId: 'code',
          configOptions: [],
          signal: new AbortController().signal,
        },
        emit,
      );
      await entered.promise;
      if (disposed) turn.dispose('s1');
      handlers.get('tool.started')?.({ id: 'tool', name: 'read_file', input: {} } as never);
      handlers.get('tool.executed')?.({
        id: 'tool',
        name: 'read_file',
        ok: true,
        output: 'read',
      } as never);
      completion.resolve();
      const result = await pending;
      expect(emit).toHaveBeenCalledTimes(disposed ? 0 : 3);
      expect(turn.replay('s1')).toHaveLength(disposed ? 0 : 2);
      expect(result.stopReason).toBe(disposed ? 'cancelled' : 'end_turn');
      turn.dispose('s1');
    },
  );
});
