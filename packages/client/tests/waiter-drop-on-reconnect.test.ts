import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { WrongStackClient, WrongStackError } from '../src/index.js';
import { WebSocketServer } from './ws-runtime.js';

describe('WrongStackClient control waiters on socket drop with reconnect', () => {
  it('rejects in-flight newSession, listSessions, and resumeSession waiters when socket drops before reply', async () => {
    let connectionCount = 0;

    const server = http.createServer((req, res) => {
      if (req.url?.startsWith('/ws-auth')) {
        res.writeHead(200).end('ok');
        return;
      }
      res.writeHead(404).end();
    });

    const wss = new WebSocketServer({ server });
    wss.on('connection', (socket) => {
      connectionCount += 1;
      const connNum = connectionCount;

      socket.on('message', (raw) => {
        const frame = JSON.parse(String(raw)) as {
          type: string;
          payload?: Record<string, unknown>;
        };
        if (frame.type === 'session.new' && connNum === 1) {
          socket.terminate();
        }
        if (frame.type === 'sessions.list') {
          if (frame.payload?.limit === 99) {
            socket.terminate();
          } else {
            socket.send(
              JSON.stringify({
                type: 'sessions.list',
                payload: { sessions: [{ id: 'sess_1', title: 'Main', updatedAt: 1 }] },
              }),
            );
          }
        }
        if (frame.type === 'session.resume') {
          if (frame.payload?.id === 'drop-on-resume') {
            socket.terminate();
          } else {
            socket.send(
              JSON.stringify({
                type: 'session.start',
                payload: {
                  sessionId: String(frame.payload?.id ?? 'sess_1'),
                  provider: 'p',
                  model: 'm',
                  eventEpoch: 'e1',
                },
              }),
            );
          }
        }
      });

      socket.send(
        JSON.stringify({
          type: 'session.start',
          payload: {
            sessionId: connNum === 1 ? 'sess_1' : `sess_greeting_${connNum}`,
            provider: 'p',
            model: 'm',
            eventEpoch: 'e1',
          },
        }),
      );
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const client = await WrongStackClient.connect({
      url,
      timeoutMs: 1_500,
      reconnect: { attempts: 4, initialDelayMs: 25, maxDelayMs: 50 },
    });

    try {
      await expect(client.newSession()).rejects.toMatchObject({
        kind: 'connection',
      });
      await new Promise((r) => setTimeout(r, 60));
      expect(client.session.sessionId).toBe('sess_1');

      await expect(client.listSessions(99)).rejects.toBeInstanceOf(WrongStackError);
      await new Promise((r) => setTimeout(r, 60));

      await expect(client.resumeSession('drop-on-resume')).rejects.toMatchObject({
        kind: 'connection',
      });
      await new Promise((r) => setTimeout(r, 60));

      const list = await client.listSessions(5);
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe('sess_1');
    } finally {
      client.close();
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('delivers pushed event to awaiting async-iterator waiter before onEvent listener settlement drains waiters (F127)', async () => {
    const { Run } = await import('../src/run.js');
    const run = new Run('req-1', 'sess-1', { abort() {}, confirm() {} });
    const iterator = run[Symbol.asyncIterator]();
    const nextPromise = iterator.next();

    run.onEvent(() => {
      run.fail(new WrongStackError({ kind: 'run', code: 'boom' }));
    });

    const event = {
      type: 'provider.text_delta' as const,
      payload: { sessionId: 'sess-1', messageId: 'msg-1', text: 'hello' },
    };
    run.push(event);
    void run.result.catch(() => {});

    await expect(nextPromise).resolves.toEqual({ value: event, done: false });
  });

  it('extracts query-string token and handles uppercase WS:/WSS: protocols in handshakeFailure (F157)', async () => {
    const server = http.createServer((req, res) => {
      if (req.url?.startsWith('/ws-auth')) {
        if (req.headers['x-ws-token'] === 'valid-tok') {
          res.writeHead(204).end();
          return;
        }
        res.writeHead(401).end();
        return;
      }
      res.writeHead(503).end();
    });
    server.on('upgrade', (_req, socket) => {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      await expect(
        WrongStackClient.connect({
          url: `WS://127.0.0.1:${port}/ws?token=valid-tok`,
          timeoutMs: 1_500,
          reconnect: false,
        }),
      ).rejects.toMatchObject({
        kind: 'connection',
        code: 'handshake_failed',
        retryable: true,
      });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
