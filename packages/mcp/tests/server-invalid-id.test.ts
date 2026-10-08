import { describe, expect, it, vi } from 'vitest';
import { MCPServer } from '../src/server-dispatch.js';

describe('MCP server invalid request identifiers', () => {
  it.each([false, true, { nested: true }, []])(
    'uses null in an error response for invalid id %j',
    async (id) => {
      const listTools = vi.fn(() => []);
      const server = new MCPServer({
        host: { listTools, callTool: async () => ({ content: '', isError: false }) },
      });
      const output = await server.handleMessage(
        JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/list' }),
      );
      expect(JSON.parse(output ?? '')).toMatchObject({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600 },
      });
      expect(listTools).not.toHaveBeenCalled();
    },
  );
});
