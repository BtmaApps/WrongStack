import type { SessionStore } from '@wrongstack/contracts/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { registryMock } = vi.hoisted(() => ({
  registryMock: { listByProject: vi.fn() },
}));
vi.mock('@wrongstack/core/storage', () => ({
  getSessionRegistry: () => registryMock,
}));

import { scheduleInteractiveEmptySessionSweep } from '../src/wiring/empty-session-sweep.js';

function summary(id: string, startedAt: string) {
  return { id, title: id, startedAt, model: 'test', provider: 'test', tokenTotal: 0 };
}

function storeMock() {
  return {
    list: vi.fn(async (): Promise<ReturnType<typeof summary>[]> => []),
    isEmpty: vi.fn(async () => true),
    delete: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('scheduleInteractiveEmptySessionSweep', () => {
  it('sweeps idle ownerless empties while protecting the active and registry-held sessions', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const store = storeMock();
    store.list.mockImplementation(async () => [
      summary('stale-empty', new Date(now - 60 * 60_000).toISOString()),
      summary('fresh-elsewhere', new Date(now - 60_000).toISOString()),
      summary('held-by-webui', new Date(now - 60 * 60_000).toISOString()),
      summary('current', new Date(now - 60 * 60_000).toISOString()),
    ]);
    registryMock.listByProject.mockResolvedValue([{ sessionId: 'held-by-webui' }]);

    // The boot establishes its session moments after scheduling.
    let activeId: string | undefined;
    const scheduled = scheduleInteractiveEmptySessionSweep({
      sessionStore: store as unknown as SessionStore,
      globalRoot: 'D:/tmp/global',
      projectSlug: 'proj',
      getActiveSessionId: () => activeId,
      logger: { info: vi.fn(), error: vi.fn() },
    });
    activeId = 'current';

    await vi.advanceTimersByTimeAsync(30_000);

    expect(store.delete).toHaveBeenCalledTimes(1);
    expect(store.delete).toHaveBeenCalledWith('stale-empty');
    // Another surface's live holding, its brand-new tab, and this run's own
    // session all survive.
    expect(store.delete).not.toHaveBeenCalledWith('held-by-webui');
    expect(store.delete).not.toHaveBeenCalledWith('fresh-elsewhere');
    expect(store.delete).not.toHaveBeenCalledWith('current');

    await scheduled.dispose();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.delete).toHaveBeenCalledTimes(1);
  });

  it('fails open to local-only guards when the registry probe rejects', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const store = storeMock();
    store.list.mockImplementation(async () => [
      summary('stale-empty', new Date(now - 60 * 60_000).toISOString()),
    ]);
    registryMock.listByProject.mockRejectedValue(new Error('catalog daemon down'));

    const scheduled = scheduleInteractiveEmptySessionSweep({
      sessionStore: store as unknown as SessionStore,
      globalRoot: 'D:/tmp/global',
      projectSlug: 'proj',
      getActiveSessionId: () => undefined,
      logger: { info: vi.fn(), error: vi.fn() },
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.delete).toHaveBeenCalledWith('stale-empty');

    await scheduled.dispose();
  });

  it('probes the live registry for the project slug it was given', async () => {
    vi.useFakeTimers();
    const store = storeMock();
    registryMock.listByProject.mockResolvedValue([]);
    const scheduled = scheduleInteractiveEmptySessionSweep({
      sessionStore: store as unknown as SessionStore,
      globalRoot: 'D:/tmp/global',
      projectSlug: 'my-project',
      getActiveSessionId: () => 'current',
      logger: { info: vi.fn(), error: vi.fn() },
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(registryMock.listByProject).toHaveBeenCalledWith('my-project');

    await scheduled.dispose();
  });
});
