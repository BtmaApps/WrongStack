import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

const live = vi.hoisted(() => ({
  sessions: vi.fn(),
  details: vi.fn(),
  watch: vi.fn(),
}));
vi.mock('@wrongstack/tools', () => ({ liveBrowser: live }));

const { handleBrowserLiveList, handleBrowserLiveUnwatch, handleBrowserLiveWatch } = await import(
  '../src/server/browser-live.js'
);

type Sent = { type: string; payload: Record<string, unknown> };
function createWs() {
  const ws = Object.assign(new EventEmitter(), {
    readyState: 1,
    bufferedAmount: 0,
    sent: [] as Sent[],
    send(data: string) {
      this.sent.push(JSON.parse(data));
    },
  });
  return ws as unknown as WebSocket & { sent: Sent[]; bufferedAmount: number };
}

const session = (id: string, conversationId: string) => ({
  id,
  ownerId: 'leader',
  url: 'https://example.test/',
  title: 'Example',
  createdAt: 't0',
  lastUsedAt: 't1',
  tracing: false,
  conversationId,
});

let emitFrame: (frame: { data: string; width: number; height: number }) => void;
const stopScreencast = vi.fn(async () => undefined);

beforeEach(() => {
  vi.useFakeTimers();
  live.sessions.mockResolvedValue([session('b1', 's1'), session('b2', 's2')]);
  live.details.mockResolvedValue({
    url: 'https://example.test/',
    title: 'Example',
    console: [],
    network: [],
  });
  live.watch.mockImplementation(async (_root, _id, viewer) => {
    emitFrame = viewer;
    return stopScreencast;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const msg = (type: string, payload: Record<string, unknown>) => ({ type, payload }) as never;
const frames = (ws: { sent: Sent[] }) => ws.sent.filter((m) => m.type === 'browser.live.frame');

describe('browser live view', () => {
  it("lists only the asking tab's browser sessions", async () => {
    const ws = createWs();
    await handleBrowserLiveList(ws, msg('browser.live.list', { sessionId: 's1' }), '/p');
    expect(live.sessions).toHaveBeenCalledWith('/p');
    expect(ws.sent[0]).toEqual({
      type: 'browser.live.list',
      payload: {
        sessions: [
          {
            id: 'b1',
            ownerId: 'leader',
            url: 'https://example.test/',
            title: 'Example',
            createdAt: 't0',
            lastUsedAt: 't1',
          },
        ],
        sessionId: 's1',
      },
    });
  });

  it("refuses to watch another tab's browser", async () => {
    const ws = createWs();
    await handleBrowserLiveWatch(
      ws,
      msg('browser.live.watch', { id: 'b2', sessionId: 's1' }),
      '/p',
    );
    expect(live.watch).not.toHaveBeenCalled();
    expect(ws.sent[0]?.payload['success']).toBe(false);
  });

  it('sends details, then frames at most ten a second with the newest winning', async () => {
    const ws = createWs();
    await handleBrowserLiveWatch(
      ws,
      msg('browser.live.watch', { id: 'b1', sessionId: 's1' }),
      '/p',
    );
    expect(ws.sent[0]).toMatchObject({
      type: 'browser.live.details',
      payload: { id: 'b1', title: 'Example', sessionId: 's1' },
    });
    emitFrame({ data: 'f1', width: 10, height: 10 });
    emitFrame({ data: 'f2', width: 10, height: 10 });
    emitFrame({ data: 'f3', width: 10, height: 10 });
    expect(frames(ws).map((f) => f.payload['data'])).toEqual(['f1']);
    await vi.advanceTimersByTimeAsync(100);
    expect(frames(ws).map((f) => f.payload['data'])).toEqual(['f1', 'f3']);
  });

  it('holds frames back while the socket buffer is full', async () => {
    const ws = createWs();
    await handleBrowserLiveWatch(
      ws,
      msg('browser.live.watch', { id: 'b1', sessionId: 's1' }),
      '/p',
    );
    ws.bufferedAmount = 10 * 1024 * 1024;
    emitFrame({ data: 'f1', width: 10, height: 10 });
    await vi.advanceTimersByTimeAsync(500);
    expect(frames(ws)).toHaveLength(0);
    ws.bufferedAmount = 0;
    await vi.advanceTimersByTimeAsync(100);
    expect(frames(ws).map((f) => f.payload['data'])).toEqual(['f1']);
  });

  it('stops when the browser closes, when asked, and when the socket closes', async () => {
    const ws = createWs();
    await handleBrowserLiveWatch(
      ws,
      msg('browser.live.watch', { id: 'b1', sessionId: 's1' }),
      '/p',
    );
    live.details.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(1500);
    expect(ws.sent.at(-1)).toMatchObject({ type: 'browser.live.details', payload: { gone: true } });
    expect(stopScreencast).toHaveBeenCalledTimes(1);

    live.details.mockResolvedValue({ url: '', title: '', console: [], network: [] });
    await handleBrowserLiveWatch(
      ws,
      msg('browser.live.watch', { id: 'b1', sessionId: 's1' }),
      '/p',
    );
    await handleBrowserLiveUnwatch(ws);
    expect(stopScreencast).toHaveBeenCalledTimes(2);

    await handleBrowserLiveWatch(
      ws,
      msg('browser.live.watch', { id: 'b1', sessionId: 's1' }),
      '/p',
    );
    ws.emit('close');
    await vi.advanceTimersByTimeAsync(0);
    expect(stopScreencast).toHaveBeenCalledTimes(3);
    const sentBefore = ws.sent.length;
    emitFrame({ data: 'late', width: 1, height: 1 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(ws.sent.length).toBe(sentBefore);
  });
});
