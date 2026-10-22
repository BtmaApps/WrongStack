import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamableHTTPTransport } from '../src/transport-streamable.js';

describe('StreamableHTTPTransport session header ownership', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ignores a caller session header until initialize assigns one, then sends the assigned value', async () => {
    const seen: Array<{ method: string; session: string | null }> = [];
    vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      seen.push({
        method: request.method,
        session: new Headers(init?.headers).get('mcp-session-id'),
      });
      if (request.method === 'initialize') {
        return Response.json(
          {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'fixture', version: '1' },
            },
          },
          { headers: { 'Mcp-Session-Id': 'server-assigned' } },
        );
      }
      if (request.method === 'notifications/initialized')
        return new Response(null, { status: 202 });
      return Response.json({ jsonrpc: '2.0', id: request.id, result: { tools: [] } });
    });

    const transport = new StreamableHTTPTransport({
      protocolMode: 'legacy',
      name: 'session-owner',
      url: 'https://example.test/mcp',
      headers: { 'Mcp-Session-Id': 'caller-stale' },
    });
    try {
      await transport.connect();
      expect(seen).toEqual([
        { method: 'initialize', session: null },
        { method: 'notifications/initialized', session: 'server-assigned' },
        { method: 'tools/list', session: 'server-assigned' },
      ]);
    } finally {
      await transport.close();
    }
  });
});
