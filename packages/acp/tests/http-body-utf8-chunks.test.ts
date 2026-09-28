/**
 * HTTP request-body reading in the ACP server.
 *
 * - It decoded each request-body Buffer on its own (`body += chunk`), so a
 *   multibyte character split across two socket reads reached runTurn as
 *   U+FFFD pairs. The body is sent here in two writes that split a character,
 *   with a pause so the server reads them separately.
 * - On an oversized body it stopped reading and left the rest on a kept-alive
 *   socket, so the client's next request on that socket was reset.
 */
import { Agent, request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { WrongStackACPServer } from '../src/agent/wrongstack-acp-agent.js';

const servers: WrongStackACPServer[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
});

function postInTwoWrites(port: number, payload: unknown, splitAt: number): Promise<string> {
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        const parts: Buffer[] = [];
        res.on('data', (c: Buffer) => parts.push(c));
        res.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
      },
    );
    req.on('error', reject);
    req.write(bytes.subarray(0, splitAt));
    setTimeout(() => req.end(bytes.subarray(splitAt)), 50);
  });
}

describe('WrongStackACPServer HTTP request body decoding', () => {
  it('delivers a prompt whose character straddles two socket reads intact', async () => {
    const prompts: string[] = [];
    const server = new WrongStackACPServer({
      transport: 0,
      runTurn: async (input) => {
        prompts.push(input.prompt.map((b) => ('text' in b ? b.text : '')).join(''));
        return { stopReason: 'end_turn' };
      },
    });
    servers.push(server);
    await server.start();
    const { port } = (
      server as unknown as { httpServer: { address(): { port: number } } }
    ).httpServer.address();

    await postInTwoWrites(port, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, 5);
    const created = JSON.parse(
      await postInTwoWrites(
        port,
        { jsonrpc: '2.0', id: 2, method: 'session/new', params: { cwd: process.cwd() } },
        5,
      ),
    );
    const text = 'çözüm 日本 😀';
    const payload = {
      jsonrpc: '2.0',
      id: 3,
      method: 'session/prompt',
      params: { sessionId: created.result.sessionId, prompt: [{ type: 'text', text }] },
    };
    // split one byte into the 4-byte emoji
    const json = JSON.stringify(payload);
    const splitAt = Buffer.byteLength(json.slice(0, json.indexOf('😀')), 'utf8') + 1;
    await postInTwoWrites(port, payload, splitAt);
    expect(prompts).toEqual([text]);
  });

  it('answers an oversized body with 413 and keeps the connection usable', async () => {
    const server = new WrongStackACPServer({ transport: 0 });
    servers.push(server);
    await server.start();
    const { port } = (
      server as unknown as { httpServer: { address(): { port: number } } }
    ).httpServer.address();
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const post = (body: string) =>
      new Promise<string>((resolve) => {
        const req = request(
          { agent, host: '127.0.0.1', port, method: 'POST', path: '/' },
          (res) => {
            res.resume();
            res.on('end', () => resolve(`status ${res.statusCode}`));
          },
        );
        req.on('error', (e: NodeJS.ErrnoException) => resolve(`error ${e.code}`));
        req.end(body);
      });
    const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    try {
      expect(await post('x'.repeat(11 * 1024 * 1024))).toBe('status 413');
      expect(await post(init)).toBe('status 200');
      // Past twice the limit the server stops reading (the upload is cut off);
      // the client still gets its 413.
      expect(await post('x'.repeat(21 * 1024 * 1024))).toBe('status 413');
    } finally {
      agent.destroy();
    }
  }, 30_000);
});
