import type { MCPRegistry } from '@wrongstack/mcp';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import {
  handleMcpPromptGet,
  handleMcpResourceRead,
  handleMcpResources,
} from '../src/server/mcp-content-handlers.js';
import { handleMcpRoute, type McpRouteHandlers } from '../src/server/mcp-routes.js';
import type { WSClientMessage } from '../src/server/types.js';

function fixture() {
  const frames: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const ws = {
    readyState: 1,
    send(value: string) {
      frames.push(JSON.parse(value));
    },
  } as unknown as WebSocket;
  const registry = {
    listResources: async () => [],
    listResourceTemplates: async () => [],
    selectResourceForInsertion: async () => ({
      kind: 'resource',
      untrusted: true,
      byteSize: 5,
      provenance: { origin: 'mcp', serverName: 'fixture', capability: 'resource' },
      contents: [{ uri: 'repo://fixture/readme', text: 'hello' }],
    }),
    selectPromptForInsertion: async () => {
      throw Error('Fixture prompt unavailable');
    },
  } as unknown as MCPRegistry;
  const handlers = {
    resources: (socket: WebSocket, message: WSClientMessage) =>
      handleMcpResources(socket, message, '', registry),
    resourceRead: (socket: WebSocket, message: WSClientMessage) =>
      handleMcpResourceRead(socket, message, '', registry),
    promptGet: (socket: WebSocket, message: WSClientMessage) =>
      handleMcpPromptGet(socket, message, '', registry),
  } as unknown as McpRouteHandlers;
  return { ws, frames, handlers };
}
describe('MCP content operation request ownership', () => {
  it('correlates catalog control and selected resource content on the real dispatcher/handler path', async () => {
    const { ws, frames, handlers } = fixture();
    await handleMcpRoute(
      ws,
      { type: 'mcp.resources', payload: { name: 'fixture', requestId: 'catalog-control' } },
      handlers,
    );
    expect(frames[0]).toMatchObject({
      type: 'mcp.resources',
      payload: { requestId: 'catalog-control', resources: [] },
    });
    await handleMcpRoute(
      ws,
      {
        type: 'mcp.resource.read',
        payload: { name: 'fixture', uri: 'repo://fixture/readme', requestId: 'resource-read' },
      },
      handlers,
    );
    expect(frames[1]).toMatchObject({
      type: 'mcp.content.selected',
      payload: { requestId: 'resource-read', untrusted: true, contents: [{ text: 'hello' }] },
    });
  });
  it('correlates a prompt failure rather than leaving a native operation pending', async () => {
    const { ws, frames, handlers } = fixture();
    await handleMcpRoute(
      ws,
      {
        type: 'mcp.prompt.get',
        payload: { name: 'fixture', prompt: 'missing', requestId: 'prompt-failed' },
      },
      handlers,
    );
    expect(frames[0]).toMatchObject({
      type: 'mcp.content.error',
      payload: { requestId: 'prompt-failed', error: 'Fixture prompt unavailable' },
    });
  });
});
