import { afterEach, describe, expect, it, vi } from 'vitest';
import { WrongStackClient } from '../src/index.js';

type Listener = (event: unknown) => void;

/** A socket driven by hand: the test decides when it opens, what it reads and when it drops. */
class HandSocket {
  static all: HandSocket[] = [];
  readyState = 0;
  private readonly listeners = new Map<string, Listener[]>();
  constructor(readonly url: string) {
    HandSocket.all.push(this);
  }
  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  fire(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  open(): void {
    this.readyState = 1;
    this.fire('open');
  }
  read(frame: unknown): void {
    this.fire('message', { data: JSON.stringify(frame) });
  }
  send(): void {}
  close(code = 1000, reason = ''): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.fire('close', { code, reason });
  }
}

const start = {
  type: 'session.start',
  payload: { sessionId: 's1', model: 'm', provider: 'p', eventEpoch: 'e1' },
};

afterEach(() => {
  vi.useRealTimers();
  HandSocket.all = [];
});

describe('close() during a reconnect catch-up (F850)', () => {
  it('disarms the catch-up timer and never delivers its held frames to the closed client', async () => {
    vi.useFakeTimers();
    const connecting = WrongStackClient.connect({
      url: 'ws://127.0.0.1:1',
      WebSocket: HandSocket as never,
      reconnect: { attempts: 1, initialDelayMs: 1 },
    });
    const first = HandSocket.all[0] as HandSocket;
    first.open();
    first.read(start);
    const client = await connecting;
    const seen: number[] = [];
    client.on('custom.x', (payload) => seen.push((payload as { n: number }).n));
    first.read({ type: 'custom.x', seq: 1, payload: { sessionId: 's1', n: 1 } });

    first.readyState = 3;
    first.fire('close', { code: 1006, reason: 'drop' });
    await vi.advanceTimersByTimeAsync(1);
    const second = HandSocket.all[1] as HandSocket;
    second.open();
    second.read(start);
    await vi.advanceTimersByTimeAsync(0);
    // Skips ahead of the catch-up that has not arrived: held.
    second.read({ type: 'custom.x', seq: 3, payload: { sessionId: 's1', n: 3 } });

    client.close();
    expect(client.state).toBe('closed');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(seen).toEqual([1]);
  });
});
