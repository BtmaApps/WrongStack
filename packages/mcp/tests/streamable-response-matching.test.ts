import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamableHTTPTransport } from '../src/transport-streamable.js';

/**
 * A POST may be answered with a `text/event-stream` that carries notifications
 * and other requests' responses ahead of ours. `readResponse` stops reading the
 * moment it has OUR response; it must not stop on someone else's.
 */

const enc = new TextEncoder();
const event = (id: number, value: string): string =>
  `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result: { value } })}\n\n`;

function sseResponse(chunks: string[]): Response {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(enc.encode(chunks[index++]));
      else controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const transports: StreamableHTTPTransport[] = [];
function make(): StreamableHTTPTransport {
  const transport = new StreamableHTTPTransport({ name: 'srv', url: 'http://127.0.0.1:9/mcp' });
  transports.push(transport);
  return transport;
}

const settle = (promise: Promise<{ result?: unknown }>): Promise<string> =>
  promise.then(
    (response) => `ok:${JSON.stringify(response.result)}`,
    (error: Error) => `rejected:${error.message}`,
  );

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(transports.splice(0).map((transport) => transport.close()));
});

describe('streamed POST reply: response matching', () => {
  it('resolves with our response when an other-id event shares its chunk', async () => {
    vi.stubGlobal('fetch', async () => sseResponse([event(99, 'other') + event(1, 'mine')]));
    expect(await settle(make().request('ping', {}))).toBe('ok:{"value":"mine"}');
  });

  it('keeps reading past an other-id event delivered in an earlier chunk', async () => {
    vi.stubGlobal('fetch', async () => sseResponse([event(99, 'other'), event(1, 'mine')]));
    expect(await settle(make().request('ping', {}))).toBe('ok:{"value":"mine"}');
  });

  it('keeps reading past several other-id events, one per chunk', async () => {
    vi.stubGlobal('fetch', async () =>
      sseResponse([event(97, 'a'), event(98, 'b'), event(99, 'c'), event(1, 'mine')]),
    );
    expect(await settle(make().request('ping', {}))).toBe('ok:{"value":"mine"}');
  });

  it('matches our response when one event is split across chunk boundaries', async () => {
    const mine = event(1, 'mine');
    const cut = Math.floor(mine.length / 2);
    vi.stubGlobal('fetch', async () =>
      sseResponse([event(99, 'other'), mine.slice(0, cut), mine.slice(cut)]),
    );
    expect(await settle(make().request('ping', {}))).toBe('ok:{"value":"mine"}');
  });

  it('still rejects an id mismatch when the stream ends without our response', async () => {
    vi.stubGlobal('fetch', async () => sseResponse([event(99, 'other')]));
    expect(await settle(make().request('ping', {}))).toMatch(/id mismatch.*expected 1, got 99/);
  });
});
