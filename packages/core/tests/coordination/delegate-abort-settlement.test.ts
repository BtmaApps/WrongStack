import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreparedDelegation } from '../../src/coordination/delegation/delegation-preparation.js';
import { settleDelegation } from '../../src/coordination/delegation/run-delegation.js';

function harness() {
  const listeners = new Set<unknown>();
  const task = {
    status: 'success',
    subagentId: 'worker',
    taskId: 'task',
    durationMs: 0,
    iterations: 1,
    toolCalls: 0,
  };
  const director = {
    fleet: {
      filter: (_name: string, listener: unknown) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    awaitTasks: vi.fn(async () => [task]),
    observeTask: vi.fn(() => () => {}),
    terminate: vi.fn(async () => {}),
    snapshot: () => ({ perSubagent: {} }),
  };
  const prepared = {
    director,
    opts: {},
    input: { task: 'audit' },
    cfg: {},
    target: 'worker',
    timeoutMs: 60_000,
    maxHandoffs: 0,
    emitCompleted: () => {},
  } as unknown as PreparedDelegation;
  const first = {
    subagentId: 'worker',
    taskId: 'task',
    handoffCount: 0,
    attemptConfig: { name: 'worker' },
  };
  return { director, prepared, first, listeners };
}

afterEach(() => vi.useRealTimers());

describe('delegation cancelled before settlement starts', () => {
  it.each([false, true])(
    'does not arm a timer, register a waiter or observer after cancellation (observe=%s)',
    async (observe) => {
      vi.useFakeTimers();
      const { director, prepared, first, listeners } = harness();
      const stop = new AbortController();
      stop.abort();
      const result = await settleDelegation(prepared, first, stop.signal, { observe });
      expect(result.stopReason).toBe('aborted');
      expect(director.terminate).toHaveBeenCalledWith('worker');
      expect(director.awaitTasks).not.toHaveBeenCalled();
      expect(director.observeTask).not.toHaveBeenCalled();
      expect(listeners.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('keeps timer and listener counts flat over repeated cancellations', async () => {
    vi.useFakeTimers();
    const { prepared, first, listeners } = harness();
    const stop = new AbortController();
    stop.abort();
    for (let i = 0; i < 20; i++) await settleDelegation(prepared, first, stop.signal);
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still completes a live settlement and cleans up its timer and listeners', async () => {
    vi.useFakeTimers();
    const { prepared, first, listeners } = harness();
    const result = await settleDelegation(prepared, first, new AbortController().signal);
    expect(result.ok).toBe(true);
    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
