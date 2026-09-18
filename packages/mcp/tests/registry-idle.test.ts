import type { EventBus } from '@wrongstack/core/kernel';
import type { Logger } from '@wrongstack/core/types';
import { describe, expect, it, vi } from 'vitest';
import { type RegistryIdleContext, sleepIdleSlot, sweepIdleSlots } from '../src/registry-idle.js';
import type { ServerSlot } from '../src/registry-slots.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((r) => setImmediate(r));
};

function makeCtx(servers: Map<string, ServerSlot>, idleTimeoutMs = 5_000): RegistryIdleContext {
  return {
    servers,
    idleTimeoutMs,
    events: { emit: vi.fn(), on: vi.fn() } as unknown as EventBus,
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger,
    recordOperation: vi.fn(),
    onChildExit: vi.fn(),
    onToolsChanged: vi.fn(),
    removeCatalogListeners: vi.fn(),
  };
}

function makeSlot(holdClose?: Promise<void>, inFlightCalls = 0): ServerSlot {
  const client = {
    closeCalls: { count: 0 },
    close: async () => {
      client.closeCalls.count++;
      if (holdClose) await holdClose;
    },
    removeExitListener: vi.fn(),
    removeDisconnectListener: vi.fn(),
    removeToolsChangedListener: vi.fn(),
  };
  return {
    cfg: { name: 'proof', transport: 'stdio' },
    state: 'connected',
    client,
    lazy: true,
    toolNames: ['proof_tool'],
    lazyTools: [],
    discoveredTools: [{ name: 'proof_tool' }],
    lastUsed: Date.now() - 10_000,
    reconnectPending: false,
    reconnectTimer: undefined,
    reconnectCycles: 0,
    onDisconnect: undefined,
    registeredLazy: true,
    operations: {
      inFlightCalls,
      sleepCount: 0,
      wakeCount: 0,
      restartCount: 0,
      reconnectCount: 0,
    },
  } as unknown as ServerSlot;
}

const idleSleepEvents = (ctx: RegistryIdleContext): number =>
  (ctx.events.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([, payload]) => (payload as { reason?: string } | undefined)?.reason === 'idle-sleep',
  ).length;

describe('sleepIdleSlot teardown window', () => {
  it('does not advertise a usable connection while the idle-sleep close is pending', async () => {
    const gate = deferred();
    const slot = makeSlot(gate.promise);
    const client = slot.client as unknown as { closeCalls: { count: number } };
    const ctx = makeCtx(new Map([['proof', slot]]));

    const sleeping = sleepIdleSlot(ctx, slot);
    await tick();

    // While close is pending the slot must look detached, or
    // ensureConnected's fast path (`slot.client && slot.state ===
    // 'connected'`) resolves a demand-wake with the closing client.
    expect(slot.client).toBeUndefined();
    expect(slot.state).not.toBe('connected');

    gate.resolve();
    await sleeping;
    expect(slot.state).toBe('dormant');
    expect(client.closeCalls.count).toBe(1);
  });

  it('an overlapping sweep must not re-enter sleep while a close is pending', async () => {
    const gate = deferred();
    const slot = makeSlot(gate.promise);
    const client = slot.client as unknown as { closeCalls: { count: number } };
    const ctx = makeCtx(new Map([['proof', slot]]));

    const sleeping = sleepIdleSlot(ctx, slot);
    await tick();
    // Not awaited yet: a re-entered sleep would park on the same close gate.
    const sweeping = sweepIdleSlots(ctx);
    await tick();

    expect(client.closeCalls.count).toBe(1);

    gate.resolve();
    await Promise.all([sleeping, sweeping]);

    expect(slot.operations.sleepCount).toBe(1);
    expect(client.closeCalls.count).toBe(1);
    expect(idleSleepEvents(ctx)).toBe(1);
  });

  it('control: a healthy idle sleep ends dormant with one close and one event', async () => {
    const slot = makeSlot();
    const client = slot.client as unknown as { closeCalls: { count: number } };
    const ctx = makeCtx(new Map([['proof', slot]]));

    await sleepIdleSlot(ctx, slot);

    expect(slot.state).toBe('dormant');
    expect(slot.client).toBeUndefined();
    expect(client.closeCalls.count).toBe(1);
    expect(slot.operations.sleepCount).toBe(1);
    expect(idleSleepEvents(ctx)).toBe(1);
    expect(ctx.recordOperation).toHaveBeenCalledWith(slot, 'sleep', 'idle-timeout');
  });

  it('control: the sweep skips a connected slot with calls in flight', async () => {
    const slot = makeSlot(undefined, 1);
    const ctx = makeCtx(new Map([['proof', slot]]));

    const anyConnectedLazy = await sweepIdleSlots(ctx);

    expect(slot.state).toBe('connected');
    expect((slot.client as unknown as { closeCalls: { count: number } }).closeCalls.count).toBe(0);
    expect(anyConnectedLazy).toBe(true);
  });
});
