import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { MCPClient } from '../src/client.js';

it('completes tools, resource and prompt MRTR with an independent real HTTP peer', async () => {
  const calls: Array<{
    id: number;
    method: string;
    params: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
  }> = [];
  const wireErrors: string[] = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const bytes of request) raw += bytes.toString();
    const message = JSON.parse(raw);
    calls.push({ ...message, headers: request.headers });
    if (
      request.headers['mcp-protocol-version'] !== '2026-07-28' ||
      request.headers['mcp-method'] !== message.method ||
      message.params?._meta?.['io.modelcontextprotocol/protocolVersion'] !== '2026-07-28'
    )
      wireErrors.push('Missing per-request version/method');
    if (request.headers['mcp-session-id'])
      wireErrors.push('Modern request leaked legacy session identity');
    const name = message.method === 'resources/read' ? message.params.uri : message.params.name;
    if (
      ['tools/call', 'resources/read', 'prompts/get'].includes(message.method) &&
      request.headers['mcp-name'] !== name
    )
      wireErrors.push('Missing routing name');
    let result;
    if (message.method === 'server/discover')
      result = {
        resultType: 'complete',
        supportedVersions: ['2026-07-28'],
        capabilities: { tools: {}, resources: {}, prompts: {} },
      };
    else if (message.method === 'tools/list')
      result = {
        resultType: 'complete',
        tools: [{ name: 'choose', inputSchema: { type: 'object' } }],
      };
    else if (!message.params.inputResponses)
      result = {
        resultType: 'input_required',
        inputRequests: {
          choice: {
            method: 'elicitation/create',
            params: {
              message: `Choose for ${name}`,
              requestedSchema: {
                type: 'object',
                properties: { branch: { type: 'string' } },
                required: ['branch'],
              },
            },
          },
        },
        requestState: `opaque:${message.method}:${name}`,
      };
    else {
      if (
        message.params.requestState !== `opaque:${message.method}:${name}` ||
        message.params.inputResponses.choice.content.branch !== 'main'
      )
        wireErrors.push('Wrong request state or validated response');
      const content = { type: 'text', text: `chosen main for ${name}` };
      result =
        message.method === 'tools/call'
          ? { resultType: 'complete', content: [content] }
          : message.method === 'resources/read'
            ? { resultType: 'complete', contents: [{ uri: name, text: content.text }] }
            : { resultType: 'complete', messages: [{ role: 'user', content }] };
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const client = new MCPClient({
    name: 'real-http-mrtr',
    transport: 'streamable-http',
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`,
    allowPrivateNetworks: true,
    elicitation: async () => ({ action: 'accept', content: { branch: 'main' } }),
  });
  try {
    await client.connect();
    expect(await client.callTool('choose', { preserve: 'argument' })).toMatchObject({
      content: [{ text: 'chosen main for choose' }],
    });
    expect(await client.readResource('memo://branch')).toMatchObject({
      contents: [{ text: 'chosen main for memo://branch' }],
    });
    expect(await client.getPrompt('branch')).toMatchObject({
      messages: [{ content: { text: 'chosen main for branch' } }],
    });
    expect(wireErrors).toEqual([]);
    for (const method of ['tools/call', 'resources/read', 'prompts/get']) {
      const attempts = calls.filter((call) => call.method === method);
      expect(attempts).toHaveLength(2);
      expect(attempts[0]!.id).not.toBe(attempts[1]!.id);
      expect(
        (attempts[1]!.params._meta as Record<string, unknown>)[
          'io.modelcontextprotocol/clientCapabilities'
        ],
      ).toEqual({ elicitation: { form: {}, url: {} } });
    }
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
});
