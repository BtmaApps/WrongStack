/**
 * Regression: SessionCatalogProjectClient request ids must wrap at
 * Number.MAX_SAFE_INTEGER.
 *
 * The client uses the id to route responses through its pending map. Once
 * `nextId++` leaves the safe-integer range, JavaScript rounds the value and
 * later requests can no longer be correlated reliably. Keep allocation on the
 * production request path and use a fake socket so the test is deterministic.
 */
import { describe, expect, it } from 'vitest';
import { SessionCatalogProjectClient } from '../src/session-catalog/client.js';

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

class FakeSocket {
  destroyed = false;
  readonly frames: string[] = [];

  write(frame: string): boolean {
    this.frames.push(frame);
    return true;
  }

  destroy(): void {
    this.destroyed = true;
  }

  once(event: string, listener: () => void): this {
    if (event === 'close') listener();
    return this;
  }

  end(): void {
    this.destroyed = true;
  }
}

interface ClientInternals {
  socket: FakeSocket;
  info: unknown;
  authToken: string;
  nextId: number;
  request(message: unknown, timeoutMs: number): Promise<unknown>;
  close(): Promise<void>;
}

function makeClient(nextId = 1): { client: ClientInternals; socket: FakeSocket } {
  const client = new SessionCatalogProjectClient({
    projectDir: 'D:/session-catalog-wrap-proof',
    projectRoot: 'D:/session-catalog-wrap-proof',
  }) as unknown as ClientInternals;
  const socket = new FakeSocket();
  client.socket = socket;
  client.info = {};
  client.authToken = 'proof-token';
  client.nextId = nextId;
  return { client, socket };
}

function call(client: ClientInternals): Promise<unknown> {
  return client.request({ type: 'request', op: 'ping', args: {} }, 60_000);
}

describe('SessionCatalogProjectClient request-id wrap', () => {
  it('emits MAX_SAFE_INTEGER once, then wraps to 1', async () => {
    const { client, socket } = makeClient(MAX_SAFE_INTEGER);
    const first = call(client);
    const second = call(client);
    const ids = socket.frames.map((frame) => (JSON.parse(frame) as { id: number }).id);

    expect(ids).toEqual([MAX_SAFE_INTEGER, 1]);
    await client.close();
    void Promise.allSettled([first, second]);
  });

  it('recovers when the counter already holds the old float64-saturated value', async () => {
    const { client, socket } = makeClient(MAX_SAFE_INTEGER + 1);
    const first = call(client);
    const second = call(client);
    const ids = socket.frames.map((frame) => (JSON.parse(frame) as { id: number }).id);

    expect(ids[0]).not.toBe(ids[1]);
    expect(ids.every((id) => Number.isSafeInteger(id))).toBe(true);
    await client.close();
    void Promise.allSettled([first, second]);
  });
});
