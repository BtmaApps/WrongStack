import { describe, expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({
  active: new Set<() => void>(),
  registered: null as null | { onShutdown(): Promise<void> },
  unregister: vi.fn(),
}));
vi.mock('@wrongstack/core/utils', () => ({
  toErrorMessage: String,
  addFatalSalvageHook: (hook: () => void) => {
    seam.active.add(hook);
    return () => seam.active.delete(hook);
  },
}));
vi.mock('../src/server/server-runtime.js', () => ({
  registerShutdown: (options: typeof seam.registered) => {
    seam.registered = options;
    return seam.unregister;
  },
}));
vi.mock('../src/server/instance-registry.js', () => ({ unregisterInstance: async () => {} }));

import { setupWebuiShutdown } from '../src/server/start-webui-shutdown.js';

function fixture() {
  const noop = () => {};
  const done = async () => {};
  return {
    session: { append: done, close: done, flushSync: noop },
    tokenCounter: { total: () => ({ input: 0, output: 0 }) },
    clients: new Map(),
    httpServer: {},
    companionServer: null,
    wssPrimary: {},
    stopEmptySessionCleanup: { dispose: done },
    getKanbanSupervisorDispose: () => null,
    todosCheckpoint: { detach: done },
    stopHeapWatchdog: done,
    getCredentialWatcherClose: () => undefined,
    getProxyInstantApplyDispose: () => noop,
    disposeRealtimeHandlers: noop,
    logger: { warn: noop },
    brainMonitor: { stop: noop },
    agentServices: { runSageSessionHygiene: done },
    mcpRegistry: { stopAll: done },
    sessionIdentity: { stop: done },
    eventArming: { getDispose: () => undefined },
    getEternalSubscription: () => null,
    clearEternalSubscription: noop,
    codebaseIndexing: { dispose: noop },
    memoryStore: { dispose: done },
    vectorMemoryStore: undefined,
    globalConfigPath: 'D:/fake/config.json',
  };
}
describe('shutdown registration ownership', () => {
  it('unregisters both owned hooks while preserving a sibling host', async () => {
    const first = setupWebuiShutdown(fixture() as never);
    const second = setupWebuiShutdown(fixture() as never);
    expect(seam.active.size).toBe(2);
    first();
    expect(seam.active.size).toBe(1);
    first();
    expect(seam.active.size).toBe(1);
    second();
    expect(seam.active.size).toBe(0);
    setupWebuiShutdown(fixture() as never);
    await seam.registered!.onShutdown();
    expect(seam.active.size).toBe(0);
  });
});
