import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeACPServerAgentTurn } from '../src/agent/server-agent-turn.js';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
afterEach(() => vi.useRealTimers());
describe('ACP reloaded session timeout ownership', () => {
  it.each(['serial', 'overlap', 'reject-old'])(
    'releases replacement timers after %s completion',
    async (order) => {
      vi.useFakeTimers();
      const old = gate(),
        next = gate(),
        oldEntered = gate(),
        nextEntered = gate();
      let builds = 0;
      const turn = makeACPServerAgentTurn({
        timeoutMs: 10_000,
        agentFor: () => {
          const index = builds++;
          return {
            run: async () => {
              (index === 0 ? oldEntered : nextEntered).release();
              await (index === 0 ? old : next).promise;
              if (index === 0 && order === 'reject-old') throw new Error('old run failed');
              return { text: 'answer' };
            },
            teardown: async () => {},
          } as never;
        },
      });
      const input = {
        sessionId: 'reload',
        prompt: [],
        modeId: 'code',
        configOptions: [],
        signal: new AbortController().signal,
      };
      const first = turn(input, () => {}).catch((error: Error) => error);
      await oldEntered.promise;
      turn.dispose('reload');
      if (order === 'serial') {
        old.release();
        await first;
      }
      const second = turn(input, () => {});
      await nextEntered.promise;
      if (order !== 'serial') {
        old.release();
        await first;
      }
      turn.dispose('reload');
      const remaining = vi.getTimerCount();
      next.release();
      await second;
      expect(remaining).toBe(0);
      turn.dispose('reload');
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
