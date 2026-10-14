import { expect, it, vi } from 'vitest';
import { MAX_MCP_HTTP_BODY_BYTES } from '../src/read-body.js';
import { StreamableHTTPTransport } from '../src/transport-streamable.js';

it('cancels oversized SSE responses and releases readers even when cancellation fails', async () => {
  let mode: 'normal' | 'oversized' | 'cancel-fails' | 'empty' = 'normal';
  let cancelled = 0;
  const bodies: ReadableStream<Uint8Array>[] = [];
  const transport = new StreamableHTTPTransport({
    name: 'cap-verify',
    url: 'https://mcp.example.test',
  });
  vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    const requestMode = mode;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        if (requestMode === 'empty') {
          controller.close();
          return;
        }
        controller.enqueue(
          requestMode === 'normal'
            ? new TextEncoder().encode(
                `data: ${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { ok: true } })}\n\n`,
              )
            : new Uint8Array(MAX_MCP_HTTP_BODY_BYTES + 1),
        );
      },
      cancel() {
        cancelled++;
        if (requestMode === 'cancel-fails') return Promise.reject(new Error('cancel seam failed'));
        return undefined;
      },
    });
    bodies.push(body);
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  });
  try {
    expect((await transport.request('ping', {})).result).toEqual({ ok: true });
    expect(cancelled).toBe(1);
    for (let index = 0; index < 3; index++) {
      mode = 'oversized';
      await expect(transport.request('ping', {})).rejects.toThrow(/response stream exceeded/);
      expect(cancelled).toBe(index + 2);
      expect(bodies.at(-1)?.locked).toBe(false);
    }
    mode = 'cancel-fails';
    await expect(transport.request('ping', {})).rejects.toThrow(/response stream exceeded/);
    expect(cancelled).toBe(5);
    expect(bodies.at(-1)?.locked).toBe(false);
    mode = 'empty';
    await expect(transport.request('ping', {})).rejects.toThrow(/Could not parse/);
    expect(bodies.at(-1)?.locked).toBe(false);
  } finally {
    for (const body of bodies) await body.cancel().catch(() => undefined);
    await transport.close();
    vi.unstubAllGlobals();
  }
});
