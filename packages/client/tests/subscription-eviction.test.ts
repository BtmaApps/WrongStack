import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WrongStackClient } from '../src/index.js';
import { WebSocketServer } from './ws-runtime.js';

type Frame = { type: string; payload?: Record<string, unknown> };

/**
 * A server that, like the real one, sends a session's frames only while the
 * connection declares it. Prompts starting with "quick" finish at once; the
 * rest are held until the client posts `flush`, followed by a `marker`.
 */
async function startServer() {
  let declared: string[] = [];
  const server = http.createServer((_req, res) => res.writeHead(404).end());
  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket) => {
    let subscribed: Set<string> | undefined;
    const held: Array<{ id: string; sessionId: string }> = [];
    const result = (p: { id: string; sessionId: string }) => {
      if (subscribed && !subscribed.has(p.sessionId)) return;
      socket.send(
        JSON.stringify({
          type: 'run.result',
          payload: { requestId: p.id, sessionId: p.sessionId, status: 'done', iterations: 1 },
        }),
      );
    };
    socket.on('message', (raw) => {
      const frame = JSON.parse(String(raw)) as Frame;
      if (frame.type === 'session.subscribe') {
        declared = ((frame.payload?.sessionIds as string[] | undefined) ?? []).slice(0, 4);
        subscribed = new Set(declared);
      } else if (frame.type === 'user_message') {
        const p = { id: String(frame.payload?.id), sessionId: String(frame.payload?.sessionId) };
        if (String(frame.payload?.content).startsWith('quick')) result(p);
        else held.push(p);
      } else if (frame.type === 'flush') {
        for (const p of held.splice(0)) result(p);
        socket.send(JSON.stringify({ type: 'marker', payload: {} }));
      }
    });
    socket.send(
      JSON.stringify({
        type: 'session.start',
        payload: { sessionId: 'S0', provider: 'p', model: 'm', eventEpoch: 'e1' },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    declared: () => declared,
    async stop() {
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

/** Post `flush` and wait until every held result has been applied. */
async function flush(client: WrongStackClient): Promise<void> {
  const marker = new Promise<void>((resolve) => client.on('marker', () => resolve()));
  client.post({ type: 'flush', payload: {} });
  await marker;
}

describe('WrongStackClient subscription slots and runs in flight', () => {
  let stop: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await stop?.();
    stop = undefined;
  });

  it('keeps a busy session subscribed and evicts an idle one instead', async () => {
    const server = await startServer();
    stop = server.stop;
    const client = await WrongStackClient.connect({ url: server.url, reconnect: false });
    try {
      const busy = client.send('held', { sessionId: 'S0' });
      for (const id of ['A', 'B', 'C']) {
        await client.send(`quick ${id}`, { sessionId: id }).result;
      }
      const latest = client.send('held', { sessionId: 'D' });
      expect(server.declared()).toContain('S0');
      await flush(client);
      await expect(busy.result).resolves.toMatchObject({ status: 'done' });
      await expect(latest.result).resolves.toMatchObject({ status: 'done' });
    } finally {
      client.close();
    }
  });

  it('fails a run whose session must give up its slot instead of leaving it pending', async () => {
    const server = await startServer();
    stop = server.stop;
    const client = await WrongStackClient.connect({ url: server.url, reconnect: false });
    try {
      const runs = ['A', 'B', 'C', 'D', 'E'].map((id) => client.send('held', { sessionId: id }));
      await expect(runs[0]?.result).rejects.toMatchObject({
        kind: 'connection',
        code: 'unsubscribed',
      });
      await flush(client);
      for (const run of runs.slice(1)) {
        await expect(run.result).resolves.toMatchObject({ status: 'done' });
      }
    } finally {
      client.close();
    }
  });
});
