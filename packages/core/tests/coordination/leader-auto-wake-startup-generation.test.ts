import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeaderAutoWakeController } from '../../src/coordination/delegation/leader-auto-wake.js';
import { LeaderDeliveryHub } from '../../src/coordination/delegation/leader-delivery-hub.js';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const cleanup: Array<() => Promise<void>> = [];

function harness() {
  vi.useFakeTimers();
  const hub = new LeaderDeliveryHub();
  const warn = vi.fn();
  const controller = new LeaderAutoWakeController({
    hub,
    now: () => 1_000_000,
    minWakeIntervalMs: 0,
    logger: { warn },
  });
  const gates = [deferred(), deferred(), deferred(), deferred()];
  let count = 0;
  const startWakeTurn = vi.fn(() => gates[count++]!.promise);
  controller.attachPort({
    isIdle: () => true,
    hasPendingUserInput: () => false,
    isConfirmPending: () => false,
    isOpen: () => true,
    isDisplayed: () => true,
    startWakeTurn,
  });
  const enqueue = (id: string) =>
    hub.enqueue({
      deliveryId: id,
      sessionId: 'session',
      kind: 'delegation_result',
      createdAt: 0,
      wake: true,
      payload: {
        delegationId: id,
        target: 'helper',
        task: 't',
        ok: true,
        handoffs: 0,
        summary: 'done',
      },
    });
  cleanup.push(async () => {
    controller.dispose();
    for (const gate of gates) gate.resolve();
    await Promise.allSettled(gates.map((gate) => gate.promise));
  });
  return { controller, gates, startWakeTurn, enqueue, hub, warn };
}

afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  vi.useRealTimers();
});

describe('auto-wake startup completion ownership', () => {
  it.each(['resolve', 'reject'] as const)(
    'keeps the replacement startup guarded when an older startup finishes with %s',
    async (completion) => {
      const { controller, gates, startWakeTurn, enqueue, hub, warn } = harness();
      enqueue('first');
      expect(controller.evaluate('session')).toBe('woken');
      expect(controller.evaluate('session')).toBe('busy');
      hub.take('session');
      enqueue('second');
      expect(controller.onRunFinished('session')).toBe('woken');
      expect(controller.evaluate('session')).toBe('busy');
      if (completion === 'reject') gates[0]!.reject(new Error('old startup failed'));
      else gates[0]!.resolve();
      await gates[0]!.promise.catch(() => undefined);
      expect(controller.evaluate('session')).toBe('busy');
      expect(startWakeTurn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(completion === 'reject' ? 1 : 0);
    },
  );

  it('still releases the guard when the current startup completes', async () => {
    const { controller, gates, startWakeTurn, enqueue, hub } = harness();
    enqueue('first');
    expect(controller.evaluate('session')).toBe('woken');
    expect(controller.evaluate('session')).toBe('busy');
    gates[0]!.resolve();
    await gates[0]!.promise;
    hub.take('session');
    enqueue('second');
    expect(controller.evaluate('session')).toBe('woken');
    expect(startWakeTurn).toHaveBeenCalledTimes(2);
  });

  it('does not revive a disposed controller when a pending startup completes', async () => {
    const { controller, gates, startWakeTurn, enqueue } = harness();
    enqueue('first');
    expect(controller.evaluate('session')).toBe('woken');
    controller.dispose();
    gates[0]!.resolve();
    await gates[0]!.promise;
    enqueue('second');
    expect(controller.evaluate('session')).toBe('disabled');
    expect(controller.chainLength('session')).toBe(0);
    expect(startWakeTurn).toHaveBeenCalledTimes(1);
  });
});
