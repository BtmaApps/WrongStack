import { afterEach, describe, expect, it, vi } from 'vitest';
import { settleDelegation } from '../../src/coordination/delegation/run-delegation.js';

function harness(timeoutMs: number) {
  const terminated: string[] = [];
  let finishTask!: (result: unknown) => void;
  const director = {
    fleet: { filter: () => () => {} },
    awaitTasks: () =>
      new Promise((resolve) => {
        finishTask = (result) => resolve([result]);
      }),
    terminate: async (id: string) => {
      terminated.push(id);
    },
  };
  const settled = settleDelegation(
    {
      director,
      opts: {},
      input: { task: 'long job' },
      sessionId: 's1',
      target: 'worker',
      timeoutMs,
      maxHandoffs: 0,
      emitCompleted: () => {},
    } as never,
    { subagentId: 'sub-1', taskId: 'task-1', handoffCount: 0, attemptConfig: {} } as never,
    undefined,
  );
  return {
    settled,
    terminated,
    finish: () => finishTask({ taskId: 'task-1', subagentId: 'sub-1' }),
  };
}

describe('delegate host wait with a timeout beyond the timer range', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps waiting instead of terminating the worker after ~1 ms', async () => {
    vi.useFakeTimers();
    // Above 2^31-1 ms a raw setTimeout fires after ~1 ms (Node and Bun).
    const run = harness(3_000_000_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run.terminated).toEqual([]);
    run.finish();
    const result = (await run.settled) as { stopReason?: string };
    expect(result.stopReason).not.toBe('host_timeout');
    expect(run.terminated).toEqual([]);
  });

  it('still times out a short wait with no progress', async () => {
    vi.useFakeTimers();
    const run = harness(1_000);
    await vi.advanceTimersByTimeAsync(1_500);
    const result = (await run.settled) as { stopReason?: string };
    expect(result.stopReason).toBe('host_timeout');
    expect(run.terminated).toEqual(['sub-1']);
  });
});
