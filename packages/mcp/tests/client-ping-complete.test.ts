import { describe, expect, it } from 'vitest';
import { type JsonRpcResponse, MCPClient } from '../src/client.js';
import type { MCPServerMetadata } from '../src/protocol.js';

type RequestFn = (
  method: string,
  params: unknown,
  timeoutMs?: number,
  opts?: { signal?: AbortSignal | undefined },
) => Promise<JsonRpcResponse>;

function connectedClient(request: RequestFn): MCPClient {
  const client = new MCPClient({ name: 'fixture', transport: 'stdio', command: 'fixture' });
  const internals = client as never as {
    state: 'connected';
    _serverMetadata: MCPServerMetadata;
    request: RequestFn;
  };
  internals.state = 'connected';
  internals._serverMetadata = {
    protocolVersion: '2025-06-18',
    capabilities: { completion: {} },
    serverInfo: { name: 'fixture', version: '1.0.0' },
  };
  internals.request = request;
  return client;
}

function ok(result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: 1, result } as JsonRpcResponse;
}

function rpcError(message: string): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: 1,
    error: { code: -32601, message },
  } as JsonRpcResponse;
}

describe('MCPClient ping and completion/complete', () => {
  it('sends ping with no params and resolves on the empty result', async () => {
    const methods: string[] = [];
    const seenParams: unknown[] = [];
    const client = connectedClient(async (method, params) => {
      methods.push(method);
      seenParams.push(params);
      return ok({});
    });
    await expect(client.ping()).resolves.toBeUndefined();
    expect(methods).toEqual(['ping']);
    expect(seenParams[0]).toEqual({});
  });

  it('rejects a malformed ping result instead of resolving silently', async () => {
    const client = connectedClient(async () => ok(null));
    await expect(client.ping()).rejects.toThrow(/Malformed MCP empty result/);
  });

  it('surfaces a JSON-RPC error response from ping as a thrown error', async () => {
    const client = connectedClient(async () => rpcError('Method not found: ping'));
    await expect(client.ping()).rejects.toThrow(/MCP ping failed: Method not found: ping/);
  });

  it('sends completion/complete with the ref and argument, and parses values', async () => {
    let seenParams: unknown;
    const client = connectedClient(async (method, params) => {
      expect(method).toBe('completion/complete');
      seenParams = params;
      return ok({ completion: { values: ['cache', 'cache-key'], total: 2, hasMore: false } });
    });
    await expect(
      client.complete({ type: 'ref/prompt', name: 'review' }, { name: 'language', value: 'ts' }),
    ).resolves.toEqual({
      completion: { values: ['cache', 'cache-key'], total: 2, hasMore: false },
    });
    expect(seenParams).toEqual({
      ref: { type: 'ref/prompt', name: 'review' },
      argument: { name: 'language', value: 'ts' },
    });
  });

  it('rejects a completion result without values', async () => {
    const client = connectedClient(async () => ok({ completion: {} }));
    await expect(
      client.complete({ type: 'ref/resource', uri: 'file:///a.md' }, { name: 'q', value: '' }),
    ).rejects.toThrow(/expected values array/);
  });

  it('surfaces a JSON-RPC error response from completion as a thrown error', async () => {
    const client = connectedClient(async () => rpcError('Method not found: completion/complete'));
    await expect(
      client.complete({ type: 'ref/prompt', name: 'x' }, { name: 'q', value: 'v' }),
    ).rejects.toThrow(/MCP completion\/complete failed: Method not found/);
  });

  it('rejects a non-string completion argument name before any request', async () => {
    let calls = 0;
    const client = connectedClient(async () => {
      calls++;
      return ok({});
    });
    await expect(
      client.complete(
        { type: 'ref/prompt', name: 'x' },
        { name: 42 as unknown as string, value: 'v' },
      ),
    ).rejects.toThrow(/completion argument name/);
    expect(calls).toBe(0);
  });
});
