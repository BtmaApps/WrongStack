import type { IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import {
  type ConnectionHandlerDeps,
  createConnectionHandler,
} from '../../src/webui-server/connection-handler.js';
import type { WSServerMessage } from '../../src/webui-server/contracts.js';
import { startWebuiHttpBridge } from '../../src/webui-server/http-bridge.js';
import { createWebuiTransport } from '../../src/webui-server/transport.js';

class TestSocket {
  readonly listeners = new Map<string, (...args: unknown[]) => unknown>();
  readonly close = vi.fn();

  on(event: string, listener: (...args: never[]) => unknown): this {
    this.listeners.set(event, listener as (...args: unknown[]) => unknown);
    return this;
  }

  async receive(data: string): Promise<void> {
    await this.listeners.get('message')?.(Buffer.from(data));
  }
}

function createDeps(handleMessage: ConnectionHandlerDeps['handleMessage']): ConnectionHandlerDeps {
  const clientHandler = { addClient: vi.fn(), removeClient: vi.fn() };
  return {
    host: '127.0.0.1',
    wsToken: '',
    requireToken: false,
    publicHostnames: [],
    publicWsUrl: undefined,
    clients: new Map(),
    currentSessionId: () => 'session-1',
    goalHandler: clientHandler as never,
    specsHandler: clientHandler as never,
    sddBoardHandler: clientHandler as never,
    sddWizardHandler: clientHandler as never,
    worktreeHandler: clientHandler as never,
    terminalHandler: clientHandler as never,
    rateLimitMax: 0,
    send: vi.fn(),
    sessionPayload: (payload) => ({ ...payload, sessionId: 'session-1' }),
    handleMessage,
    pendingConfirms: new Map(),
    buildSessionStartPayload: async () => ({}),
    needsSetup: false,
  };
}

const request = {
  headers: { host: '127.0.0.1', origin: 'http://127.0.0.1' },
  url: '/',
  socket: { remoteAddress: '127.0.0.1' },
} as IncomingMessage;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CLI WebUI connection-handler errors', () => {
  it('omits replay fields when replay loading fails during initial connect', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const deps = createDeps(async () => undefined);
    deps.buildSessionStartPayload = async () => ({
      sessionId: 'session-1',
      provider: 'p',
      model: 'm',
    });
    deps.loadReplay = async () => {
      throw new Error('flush failed before replay');
    };
    const socket = new TestSocket();

    await createConnectionHandler(deps)(socket as never as WebSocket, request);

    expect(deps.send).toHaveBeenCalledWith(
      socket,
      expect.objectContaining({
        type: 'session.start',
        payload: expect.not.objectContaining({
          replayMessages: expect.anything(),
          replayMarkers: expect.anything(),
          replayToolMeta: expect.anything(),
        }),
      }),
    );
    expect(debug).toHaveBeenCalledWith('[WebUI] Failed to load replay');
  });

  it('labels invalid JSON as a parse failure without dispatching it', async () => {
    const handleMessage = vi.fn();
    const socket = new TestSocket();
    // Invalid JSON is a wire-level fault, not a server fault — see the
    // severity policy in connection-lifecycle.ts. Benign client drift logs
    // at warn, not error.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await createConnectionHandler(createDeps(handleMessage))(socket as never as WebSocket, request);

    await socket.receive('{bad json');

    expect(handleMessage).not.toHaveBeenCalled();
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      event: 'webui_server.message_parse_failed',
      level: 'warn',
    });
  });

  it('labels dispatch exceptions as handler failures', async () => {
    const handleMessage = vi.fn().mockRejectedValue(new Error('handler exploded'));
    const socket = new TestSocket();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await createConnectionHandler(createDeps(handleMessage))(socket as never as WebSocket, request);

    await socket.receive('{"type":"kanban.get"}');

    expect(handleMessage).toHaveBeenCalledOnce();
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({
      event: 'webui_server.message_handler_failed',
      message: 'handler exploded',
    });
  });
});

/**
 * A closed SOCKET is not a stopped run.
 *
 * The handler used to delete the acting tab's entry from the run-lock registry
 * on `close` — without aborting anything. The run kept going while
 * `isRunActive` answered `false`, so `session.delete` could unlink the journal
 * a live run was still appending to, and the next `user_message` claimed a
 * second lock for the same session and hit "Agent.run() is already in
 * progress". Background runs are meant to outlive their tab; the run's own
 * `finally` is what releases the lock.
 *
 * Enforced structurally rather than by assertion: the handler is not given the
 * registry at all, so it cannot touch it. The type-level check below stops the
 * dependency from being quietly reintroduced.
 */
describe('CLI WebUI connection-handler — socket close and run locks', () => {
  it('has no access to the run-lock registry', () => {
    type HasAbortRegistry = 'abortControllers' extends keyof ConnectionHandlerDeps ? true : false;
    const hasAbortRegistry: HasAbortRegistry = false;
    expect(hasAbortRegistry).toBe(false);
  });

  it('drops the client on close without failing', async () => {
    const deps = createDeps(async () => undefined);
    const handler = createConnectionHandler(deps);
    const socket = new TestSocket();
    handler(socket as never as WebSocket, request);
    await Promise.resolve();
    expect(deps.clients.size).toBe(1);

    await socket.listeners.get('close')?.();
    expect(deps.clients.size).toBe(0);
  });

  it('honors WRONGSTACK_WEBUI_DEV_CROSS_PORT_WS in connection-handler and parses tunnel hostnames in http-bridge', async () => {
    const prev = process.env['WRONGSTACK_WEBUI_DEV_CROSS_PORT_WS'];
    let bridge: Awaited<ReturnType<typeof startWebuiHttpBridge>> | undefined;
    try {
      process.env['WRONGSTACK_WEBUI_DEV_CROSS_PORT_WS'] = '1';
      const deps = createDeps(async () => undefined);
      deps.wsToken = 'dev-cookie-token';
      const socket = new TestSocket();
      await createConnectionHandler(deps)(
        socket as never as WebSocket,
        {
          headers: {
            host: '127.0.0.1:3456',
            origin: 'http://127.0.0.1:5173',
            cookie: 'ws_token=dev-cookie-token',
          },
          url: '/',
          socket: { remoteAddress: '127.0.0.1' },
        } as IncomingMessage,
      );
      expect(socket.close).not.toHaveBeenCalled();
      expect(deps.clients.size).toBe(1);

      bridge = await startWebuiHttpBridge({
        opts: {
          agent: { ctx: { meta: {} } },
          frontendDistDir: 'D:/nonexistent-dist-for-test',
        } as never,
        surface: 'webui',
        host: '127.0.0.1',
        httpPort: 0,
        strictPort: false,
        globalRoot: 'D:/nonexistent-global-root',
        wsToken: 'tunnel-token',
        publicUrl: 'https://webui.example.com:8443/app',
        publicWsUrl: 'wss://ws.example.com:9443/ws',
        requireToken: true,
        getSessionAgents: () => undefined,
        onFleetPing: () => undefined,
        broadcast: () => undefined,
        onPortRebound: () => undefined,
      });
      const verifyClient = (
        bridge.wss as unknown as {
          options: {
            verifyClient: (info: {
              origin: string;
              secure: boolean;
              req: IncomingMessage;
            }) => boolean;
          };
        }
      ).options.verifyClient;
      expect(
        verifyClient({
          origin: 'https://webui.example.com:8443',
          secure: true,
          req: {
            url: '/?token=tunnel-token',
            headers: {
              host: 'ws.example.com:9443',
              origin: 'https://webui.example.com:8443',
            },
            socket: { remoteAddress: '127.0.0.1' },
          } as IncomingMessage,
        }),
      ).toBe(true);
    } finally {
      if (prev === undefined) delete process.env['WRONGSTACK_WEBUI_DEV_CROSS_PORT_WS'];
      else process.env['WRONGSTACK_WEBUI_DEV_CROSS_PORT_WS'] = prev;
      await new Promise<void>((r) => (bridge ? bridge.wss.close(() => r()) : r()));
    }
  });

  it('degrades whitespace payload sessionId to project-wide broadcast and ignores blank targetSessionId without throwing (F614)', () => {
    const sent: string[] = [];
    const ws = {
      readyState: 1,
      bufferedAmount: 0,
      send: (data: string) => sent.push(data),
    } as never as WebSocket;
    const clients = new Map([[ws, { ws, sessionId: 'session-1' }]]);
    const transport = createWebuiTransport(clients);

    expect(() =>
      transport.broadcast({
        type: 'session.status',
        payload: { sessionId: '   ', status: 'idle' },
      } as unknown as WSServerMessage),
    ).not.toThrow();
    expect(sent).toHaveLength(1);

    expect(() =>
      transport.broadcast(
        {
          type: 'session.status',
          payload: { sessionId: 'session-1', status: 'running' },
        } as unknown as WSServerMessage,
        '   ',
      ),
    ).not.toThrow();
    expect(sent).toHaveLength(1);
  });
});
