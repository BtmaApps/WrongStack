import { describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { createSessionHandlers } from '../src/server/session-handlers.js';

/**
 * The session routes are where a tab starts showing a session. Background
 * delegation results held for a session nobody displayed (auto-wake Q1) are
 * released from exactly these moments: a newly declared tab, a resume of a
 * live tab, and a cold resume — the last one after the tracker re-queued what
 * the journal says was never delivered.
 */

const writer = (id: string) => ({
  id,
  startedAt: '2026-01-01T00:00:00.000Z',
  append: async () => undefined,
  close: async () => undefined,
});

function harness(options: { live?: string[]; events?: unknown[] } = {}) {
  const contexts = new Map<string, Record<string, unknown>>();
  const mkCtx = (id: string) => {
    const ctx = {
      session: writer(id),
      lastRequestTokens: 0,
      state: {
        messages: [],
        todos: [],
        replaceMessages: vi.fn(),
        replaceTodos: vi.fn(),
        setMeta: vi.fn(),
        deleteMeta: vi.fn(),
      },
      readFiles: new Set<string>(),
      fileMtimes: new Map<string, number>(),
      messages: [],
      meta: {},
      provider: { id: 'p' },
      flushConversationJournal: vi.fn(async () => undefined),
      clearMemoryEvidence: vi.fn(),
    };
    contexts.set(id, ctx as never);
    return ctx;
  };
  const rootCtx = mkCtx('sess_boot');
  for (const id of options.live ?? []) mkCtx(id);
  let current = rootCtx.session;
  const displayed: string[][] = [];
  const rehydrated: Array<{ sessionId: string; events: readonly unknown[] }> = [];
  const clients = new Map<WebSocket, { sessionId: string | null; sessionIds?: Set<string> }>();

  const handlers = createSessionHandlers({
    config: { model: 'm', provider: 'p' },
    context: rootCtx as never,
    tokenCounter: { account: vi.fn(), total: () => ({}), reset: vi.fn() } as never,
    getProjectRoot: () => '/repo',
    getSession: () => current as never,
    setSession: (next) => {
      current = next as never;
    },
    getSessionStore: () =>
      ({
        resolveId: async (id: string) => id,
        load: async () => ({ messages: [], events: [], usage: undefined }),
        resume: async (id: string) => ({
          writer: writer(id),
          data: { messages: [], events: options.events ?? [], usage: undefined },
        }),
        list: async () => [],
      }) as never,
    isSessionLive: (id) => contexts.has(id),
    getAgent: (id) => ({ ctx: contexts.get(id ?? '') ?? mkCtx(id ?? 'x') }) as never,
    clients: clients as never,
    onSessionsDisplayed: (ids) => displayed.push([...ids]),
    rehydrateDelegations: (sessionId, events) => rehydrated.push({ sessionId, events }),
    sessionStartPayload: async (overrides) => ({ ...overrides }) as never,
    sendMessage: () => undefined,
    broadcastMessage: () => undefined,
  });
  return { handlers, clients, displayed, rehydrated };
}

describe('session routes report newly displayed sessions', () => {
  it('reports only the tabs a subscribe newly declares', async () => {
    const h = harness();
    const ws = {} as WebSocket;
    h.clients.set(ws, { sessionId: 'sess_a' });

    await h.handlers.subscribeSessions(ws, {
      type: 'session.subscribe',
      payload: { sessionIds: ['sess_a', 'sess_b'] },
    });
    await h.handlers.subscribeSessions(ws, {
      type: 'session.subscribe',
      payload: { sessionIds: ['sess_a', 'sess_b', 'sess_c'] },
    });

    expect(h.displayed).toEqual([['sess_a', 'sess_b'], ['sess_c']]);
  });

  it('reports a live tab brought forward by resume', async () => {
    const h = harness({ live: ['sess_bg'] });
    const ws = {} as WebSocket;
    h.clients.set(ws, { sessionId: 'sess_boot' });

    await h.handlers.resumeSession(ws, { type: 'session.resume', payload: { id: 'sess_bg' } });

    expect(h.displayed).toEqual([['sess_bg']]);
    // A live session's undelivered results are still in this process's hub.
    expect(h.rehydrated).toEqual([]);
  });

  it('rehydrates a cold resume from its journal, then reports it displayed', async () => {
    const events = [{ type: 'delegate_completed', delegationId: 'del_1' }];
    const h = harness({ events });
    const ws = {} as WebSocket;
    h.clients.set(ws, { sessionId: 'sess_boot' });

    await h.handlers.resumeSession(ws, { type: 'session.resume', payload: { id: 'sess_cold' } });

    expect(h.rehydrated).toEqual([{ sessionId: 'sess_cold', events }]);
    expect(h.displayed).toEqual([['sess_cold']]);
  });
});
