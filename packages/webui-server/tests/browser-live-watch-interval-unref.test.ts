import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

const live = vi.hoisted(() => ({
  sessions: vi.fn(),
  details: vi.fn(),
  watch: vi.fn(),
}));
vi.mock('@wrongstack/tools', () => ({ liveBrowser: live }));

const { handleBrowserLiveUnwatch, handleBrowserLiveWatch } = await import(
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

// Real timers on purpose: `hasRef()` must report the state of the REAL
// event-loop reference; vitest's fake-timer objects do not.
describe('browser.live.watch details interval', () => {
  const realSetInterval = globalThis.setInterval;
  let created: NodeJS.Timeout[] = [];

  beforeEach(() => {
    created = [];
    globalThis.setInterval = ((handler: (...args: never[]) => void, ms?: number) => {
      const timer = realSetInterval(handler, ms) as unknown as NodeJS.Timeout;
      created.push(timer);
      return timer as unknown as number;
    }) as typeof setInterval;
    live.sessions.mockResolvedValue([session('b1', 's1')]);
    live.details.mockResolvedValue({
      url: 'https://example.test/',
      title: 'Example',
      console: [],
      network: [],
    });
    live.watch.mockResolvedValue(async () => undefined);
  });

  afterEach(() => {
    globalThis.setInterval = realSetInterval;
    vi.clearAllMocks();
  });

  it("does not keep the process alive: the watch's details interval is unref'd", async () => {
    const ws = createWs();
    await handleBrowserLiveWatch(
      ws,
      { type: 'browser.live.watch', payload: { id: 'b1', sessionId: 's1' } } as never,
      '/p',
    );

    expect(created.length).toBeGreaterThan(0);
    // The watch interval is housekeeping: the HTTP/WS listener keeps the
    // process alive while it serves, so the interval must not hold the loop
    // hostage past shutdown (same .unref convention as every other broadcast
    // interval in this package: goal broadcast/catalog ticks, worktree
    // broadcast, connection-lifecycle drain, client-presence heartbeat).
    for (const timer of created) expect(timer.hasRef()).toBe(false);

    // Lifecycle stays clean: unwatch tears the interval down as before.
    await handleBrowserLiveUnwatch(ws);
  });
});
