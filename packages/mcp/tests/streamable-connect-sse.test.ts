import { afterEach, describe, expect, it } from 'vitest';
import { StreamableHTTPTransport } from '../src/transport-streamable.js';

describe('StreamableHTTPTransport.connect SSE handling', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('streams SSE initialize responses via readResponse, dispatches preceding notifications, and cancels open reader on match', async () => {
    let logNotices = 0;
    let streamCancelled = false;
    let sessionHeader: string | null = null;

    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body ?? '{}')) as { id?: number; method?: string };
      if (body.method === 'initialize') {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'notifications/message',
                  params: { level: 'info', data: 'booting' },
                })}\n\n`,
              ),
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  jsonrpc: '2.0',
                  id: body.id,
                  result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    serverInfo: { name: 'sse-mcp', version: '1.0.0' },
                  },
                })}\n\n`,
              ),
            );
          },
          cancel() {
            streamCancelled = true;
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream', 'mcp-session-id': 'sess-sse' },
        });
      }
      if (body.method === 'tools/list') {
        sessionHeader = headers.get('mcp-session-id');
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [] } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(null, { status: 202 });
    }) as typeof fetch;

    const transport = new StreamableHTTPTransport({
      name: 'sse-mcp',
      url: 'http://localhost:8080/mcp',
      startupTimeoutMs: 400,
      requestTimeoutMs: 400,
    });
    transport.onLogMessage(() => {
      logNotices += 1;
    });

    try {
      await transport.connect();
      expect(transport.getState()).toBe('connected');
      expect(sessionHeader).toBe('sess-sse');
      expect(logNotices).toBe(1);
      expect(streamCancelled).toBe(true);
    } finally {
      await transport.close();
    }
  });
});
