import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCP_CONSTANTS } from '../src/constants.js';
import { SSETransport } from '../src/transport-sse.js';

/**
 * `SSETransport.close()` cancels the stream reader. When the stream already
 * died (the usual reason a session is being closed) `cancel()` rejects with the
 * stream's error; that rejection must not escape as an unhandledRejection.
 */

const enc = new TextEncoder();
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason);
};

async function connected(): Promise<{
  transport: SSETransport;
  dropStream: (error: Error) => void;
}> {
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      controller.enqueue(enc.encode('event: endpoint\ndata: /messages\n\n'));
    },
  });
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') {
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    const request = JSON.parse(String(init.body)) as { id?: number; method: string };
    const result =
      request.method === 'initialize'
        ? {
            protocolVersion: MCP_CONSTANTS.PROTOCOL_VERSION,
            capabilities: {},
            serverInfo: { name: 'srv', version: '1' },
          }
        : request.method === 'tools/list'
          ? { tools: [] }
          : {};
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  const transport = new SSETransport({ name: 'srv', url: 'http://127.0.0.1:9/sse' });
  await transport.connect();
  return { transport, dropStream: (error) => streamController.error(error) };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

afterEach(() => {
  vi.unstubAllGlobals();
  process.off('unhandledRejection', onUnhandled);
  unhandled.length = 0;
});

describe('SSETransport.close()', () => {
  it('leaves no unhandled rejection when closing a healthy transport', async () => {
    process.on('unhandledRejection', onUnhandled);
    const { transport } = await connected();
    await transport.close();
    await flush();
    expect(unhandled).toEqual([]);
  });

  it('leaves no unhandled rejection when the stream had already errored', async () => {
    process.on('unhandledRejection', onUnhandled);
    const { transport, dropStream } = await connected();
    dropStream(new Error('ECONNRESET'));
    await flush();
    expect(transport.getState()).toBe('disconnected');
    await transport.close();
    await flush();
    expect(unhandled).toEqual([]);
  });

  it('stays idempotent: a second close after a dropped stream is also quiet', async () => {
    process.on('unhandledRejection', onUnhandled);
    const { transport, dropStream } = await connected();
    dropStream(new Error('ECONNRESET'));
    await flush();
    await transport.close();
    await transport.close();
    await flush();
    expect(unhandled).toEqual([]);
    expect(transport.getState()).toBe('disconnected');
  });
});
