import { vi } from 'vitest';
import { sleepIdleSlot } from '../src/registry-idle.js';

async function idleCase(replace: boolean, mode: 'replace' | 'remove' | 'stop' = 'replace') {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const slot = {
    cfg: { name: 'server' },
    state: 'connected',
    client: { close: async () => gate },
    operations: { inFlightCalls: 0, sleepCount: 0 },
    reconnectPending: false,
  } as never;
  const replacement = {
    cfg: { name: 'server' },
    state: 'connected',
    client: { close: async () => {} },
    operations: { inFlightCalls: 0, sleepCount: 0 },
  } as never;
  const emit = vi.fn();
  const record = vi.fn();
  const servers = new Map([['server', slot]]);
  const ctx = {
    servers,
    events: { emit },
    log: { warn: vi.fn(), info: vi.fn() },
    recordOperation: record,
    removeCatalogListeners: vi.fn(),
  } as never;
  const pending = sleepIdleSlot(ctx, slot);
  if (replace) {
    if (mode === 'remove') servers.delete('server');
    else if (mode === 'stop') Object.assign(slot, { state: 'stopped' });
    else servers.set('server', replacement);
  }
  release();
  await pending;
  return {
    events: emit.mock.calls.length,
    records: record.mock.calls.length,
    current: servers.get('server'),
    replacement,
  };
}

import { expect, it } from 'vitest';

it('verifies replaced slot never publishes, including repeated replacement and normal control', async () => {
  const replaced = await idleCase(true);
  expect(replaced.events).toBe(0);
  expect(replaced.records).toBe(0);
  expect(replaced.current).toBe(replaced.replacement);
  for (const mode of ['remove', 'stop'] as const) {
    const actual = await idleCase(true, mode);
    expect(actual.events).toBe(0);
    expect(actual.records).toBe(0);
  }
  const control = await idleCase(false);
  expect(control.events).toBe(1);
  expect(control.records).toBe(1);
});
