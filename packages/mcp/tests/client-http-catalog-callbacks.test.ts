import { afterEach, describe, expect, it, vi } from 'vitest';
import { MCPClient } from '../src/client.js';
import type { JsonRpcResponse } from '../src/contracts.js';
import { SSETransport, StreamableHTTPTransport } from '../src/transport.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HTTP MCP client catalog relay ownership', () => {
  it.each(['sse', 'streamable'] as const)(
    '%s stops later client observers after callback close',
    async (kind) => {
      const Class = kind === 'sse' ? SSETransport : StreamableHTTPTransport;
      vi.spyOn(Class.prototype, 'connect').mockResolvedValue();
      const client = new MCPClient({
        name: 'fixture',
        transport: kind === 'sse' ? 'sse' : 'streamable-http',
        url: 'https://fixture.invalid',
      });
      const gate = Promise.withResolvers<JsonRpcResponse>();
      const seen: string[] = [];
      let closing: Promise<void> | undefined;
      try {
        await client.connect();
        const raw = (client as unknown as Record<string, unknown>)[
          kind === 'sse' ? 'sseTransport' : 'httpTransport'
        ] as Record<string, unknown>;
        raw[kind === 'sse' ? 'httpPost' : 'postRaw'] = () => gate.promise;
        client.addToolsChangedListener((_name, tools) => {
          seen.push(`first:${tools[0]!.name}`);
          closing = client.close();
        });
        client.addToolsChangedListener((_name, tools) => seen.push(`second:${tools[0]!.name}`));
        const pending = (
          raw[kind === 'sse' ? 'handleToolsListChanged' : 'refreshTools'] as () => Promise<void>
        ).call(raw);
        gate.resolve({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [{ name: 'old', inputSchema: {} }] },
        });
        await pending;
        await closing;
        expect(seen).toEqual(['first:old']);
      } finally {
        gate.resolve({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
        await closing;
        await client.close();
      }
    },
  );
});
