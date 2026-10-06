import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  scheduleCleanup: vi.fn(),
  broadcast: vi.fn(),
}));
vi.mock('../src/server/session-cleanup-scheduler.js', () => ({
  scheduleOwnerlessEmptySessionCleanup: mocks.scheduleCleanup,
}));
vi.mock('../src/server/session-handlers.js', async () => {
  const { collectDisplayedSessionIds } = await import('../src/server/session-handler-helpers.js');
  return { collectDisplayedSessionIds };
});
vi.mock('../src/server/ws-utils.js', () => ({
  broadcast: mocks.broadcast,
  broadcastAll: vi.fn(),
  send: vi.fn(),
}));

import { setupStandaloneSessionMaintenance } from '../src/server/start-webui-session-maintenance.js';

type Input = Parameters<typeof setupStandaloneSessionMaintenance>[0];
type CleanupOptions = Parameters<
  typeof import('../src/server/session-cleanup-scheduler.js').scheduleOwnerlessEmptySessionCleanup
>[0];

beforeEach(() => vi.resetAllMocks());

function fixture() {
  let sessionId = 'foreground';
  const summaries = [
    {
      id: 'foreground',
      title: 'Original',
      name: 'Renamed',
      startedAt: '2026-01-01T00:00:00Z',
      model: 'model',
      provider: 'provider',
      tokenTotal: 0,
    },
    {
      id: 'background',
      title: 'Background',
      startedAt: '2026-01-01T00:00:00Z',
      model: 'model',
      provider: 'provider',
      tokenTotal: 0,
    },
  ];
  const store = { list: vi.fn(async () => summaries) };
  const stopCleanup = vi.fn();
  const offRenamed = vi.fn();
  const on = vi.fn();
  on.mockReturnValue(offRenamed);
  const hasParticipants = vi.fn((id: string) => id === 'collaborating');
  const clients = new Map([
    [{}, { sessionId: 'stale', sessionIds: new Set(['foreground', 'background']) }],
  ]);
  const input = {
    state: { getSessionStore: () => store, getSession: () => ({ id: sessionId }) },
    clients,
    collabHandler: { hasParticipants },
    logger: {},
    events: { on },
  } as unknown as Input;
  mocks.scheduleCleanup.mockReturnValue({ dispose: stopCleanup, runNow: vi.fn() });
  const result = setupStandaloneSessionMaintenance(input);
  const cleanup = mocks.scheduleCleanup.mock.calls[0]![0] as CleanupOptions;
  const renamed = on.mock.calls[0]![1] as () => void;
  return {
    input,
    store,
    result,
    cleanup,
    renamed,
    stopCleanup,
    offRenamed,
    switchSession: (id: string) => {
      sessionId = id;
    },
  };
}

describe('standalone session maintenance', () => {
  it('protects background tabs and reads current session ownership at sweep time', async () => {
    const f = fixture();
    expect(f.cleanup.getActiveSessionIds!()).toEqual(['foreground', 'background']);
    f.switchSession('new-session');
    expect(f.cleanup.getActiveSessionId()).toBe('new-session');
    expect(f.cleanup.getActiveSessionIds!()).toEqual(['new-session', 'foreground', 'background']);
    expect(f.cleanup.hasParticipants('collaborating')).toBe(true);
    expect(f.cleanup.hasParticipants('ownerless')).toBe(false);
    expect(f.cleanup.getSessionStore()).toBe(f.store);
    await f.result.stopEmptySessionCleanup.dispose();
    f.result.offSessionRenamed();
    expect(f.stopCleanup).toHaveBeenCalledOnce();
    expect(f.offRenamed).toHaveBeenCalledOnce();
  });

  it('broadcasts renamed session history using the live active session', async () => {
    const f = fixture();
    f.switchSession('background');
    f.renamed();
    await vi.waitFor(() => expect(mocks.broadcast).toHaveBeenCalledOnce());
    expect(f.store.list).toHaveBeenCalledWith(200);
    expect(mocks.broadcast).toHaveBeenCalledWith(f.input.clients, {
      type: 'sessions.list',
      payload: {
        sessions: [
          expect.objectContaining({ id: 'foreground', name: 'Renamed', isCurrent: false }),
          expect.objectContaining({ id: 'background', isCurrent: true }),
        ],
      },
    });
  });

  it('allows a later rename refresh after a history read fails', async () => {
    const f = fixture();
    f.store.list.mockRejectedValueOnce(new Error('temporary store failure'));
    f.renamed();
    await vi.waitFor(() => expect(f.store.list).toHaveBeenCalledOnce());
    expect(mocks.broadcast).not.toHaveBeenCalled();
    f.renamed();
    await vi.waitFor(() => expect(mocks.broadcast).toHaveBeenCalledOnce());
  });
});
