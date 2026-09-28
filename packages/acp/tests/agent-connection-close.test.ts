/**
 * When the agent connection ends (the agent process exits, the remote socket
 * closes, a frame limit tears the transport down) every in-flight request must
 * fail at once. Before, the transports only cleared their handlers and nothing
 * told ACPSession, so a session/prompt in flight when the agent crashed waited
 * out its whole timeout (5 minutes by default).
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACPSession } from '../src/client/acp-session.js';
import { WebSocketClientTransport } from '../src/client/websocket-transport.js';

type Listener = (ev?: unknown) => void;

class FakeWS {
  static instances: FakeWS[] = [];
  readonly listeners: Record<string, Listener[]> = {};
  readonly sent: string[] = [];
  constructor() {
    FakeWS.instances.push(this);
  }
  addEventListener(type: string, cb: Listener): void {
    const list = this.listeners[type] ?? [];
    list.push(cb);
    this.listeners[type] = list;
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.fire('close');
  }
  fire(type: string, ev?: unknown): void {
    for (const cb of this.listeners[type] ?? []) cb(ev);
  }
  request(method: string): { id: number } {
    const found = this.sent.map((s) => JSON.parse(s)).find((m) => m.method === method);
    if (!found) throw new Error(`${method} was not sent`);
    return found;
  }
  reply(id: number, result: unknown): void {
    this.fire('message', { data: JSON.stringify({ jsonrpc: '2.0', id, result }) });
  }
}

const realWS = (globalThis as { WebSocket?: unknown }).WebSocket;
const tick = () => new Promise((r) => setImmediate(r));

function lastWS(): FakeWS {
  const ws = FakeWS.instances[FakeWS.instances.length - 1];
  if (!ws) throw new Error('no WebSocket constructed');
  return ws;
}

beforeEach(() => {
  FakeWS.instances.length = 0;
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeWS as never;
});

afterEach(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = realWS;
});

async function openWS(opts: { maxMessageChars?: number } = {}) {
  const t = new WebSocketClientTransport({ url: 'ws://agent.test', ...opts });
  const started = t.start();
  lastWS().fire('open');
  await started;
  return { t, ws: lastWS() };
}

describe('WebSocketClientTransport onClose', () => {
  it('reports a socket closed by the agent once, isolating a faulty listener', async () => {
    const { t, ws } = await openWS();
    const reasons: string[] = [];
    const dropped = vi.fn();
    t.onClose(() => {
      throw new Error('faulty listener');
    });
    t.onClose((r) => reasons.push(r));
    t.onClose(dropped)();
    ws.fire('close');
    ws.fire('close');
    t.stop();
    expect(reasons).toEqual(['WebSocket closed']);
    expect(dropped).not.toHaveBeenCalled();
  });

  it('names the cause for a post-open error, an oversized message and a local stop', async () => {
    const reasonsFor = async (end: (t: WebSocketClientTransport, ws: FakeWS) => void) => {
      const { t, ws } = await openWS({ maxMessageChars: 8 });
      const reasons: string[] = [];
      t.onClose((r) => reasons.push(r));
      end(t, ws);
      return reasons;
    };
    expect(await reasonsFor((_t, ws) => ws.fire('error', new Error('reset')))).toEqual([
      'WebSocket error',
    ]);
    expect(await reasonsFor((_t, ws) => ws.fire('message', { data: '123456789' }))).toEqual([
      'agent message exceeds 8 characters',
    ]);
    expect(await reasonsFor((t) => t.stop())).toEqual(['transport stopped']);
  });
});

describe('ACPSession over a socket that closes', () => {
  const PROJECT_ROOT = path.resolve(os.tmpdir(), 'wstack-acp-close-test');

  async function connected() {
    const sessionP = ACPSession.connectWebSocket(
      { url: 'ws://agent.test' },
      { command: 'remote', projectRoot: PROJECT_ROOT, timeoutMs: 60_000 },
    );
    lastWS().fire('open');
    await tick();
    const ws = lastWS();
    ws.reply(ws.request('initialize').id, { protocolVersion: 1 });
    return { session: await sessionP, ws };
  }

  it('fails an in-flight prompt as soon as the socket closes, not at the timeout', async () => {
    const { session, ws } = await connected();
    const promptP = session.prompt([{ type: 'text', text: 'hi' }], new AbortController().signal);
    await tick();
    ws.reply(ws.request('session/new').id, { sessionId: 's1' });
    await tick();
    ws.request('session/prompt');
    ws.fire('close');
    await expect(promptP).rejects.toThrow(
      'agent connection closed (WebSocket closed) during session/prompt',
    );
    await expect(
      session.prompt([{ type: 'text', text: 'again' }], new AbortController().signal),
    ).rejects.toThrow('session is closed');
  });

  it('fails the handshake when the socket closes during initialize', async () => {
    const sessionP = ACPSession.connectWebSocket(
      { url: 'ws://agent.test' },
      { command: 'remote', projectRoot: PROJECT_ROOT, timeoutMs: 60_000 },
    );
    lastWS().fire('open');
    await tick();
    lastWS().fire('close');
    await expect(sessionP).rejects.toThrow(
      'agent connection closed (WebSocket closed) during initialize',
    );
  });

  it('keeps the plain close message when the session is closed locally', async () => {
    const { session, ws } = await connected();
    const promptP = session.prompt([{ type: 'text', text: 'hi' }], new AbortController().signal);
    await tick();
    ws.request('session/new');
    await session.close();
    await expect(promptP).rejects.toThrow('session was closed');
  });
});

// ── stdio: a real agent process that exits mid-turn ──────────────────────────

describe('ACPSession over a stdio agent that exits', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it('fails the in-flight prompt when the agent process exits', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'acp-agent-exit-'));
    const agent = path.join(dir, 'agent.cjs');
    await fs.writeFile(
      agent,
      [
        "const rl = require('node:readline').createInterface({ input: process.stdin });",
        "const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');",
        "rl.on('line', (line) => {",
        '  const msg = JSON.parse(line);',
        "  if (msg.method === 'initialize') send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1 } });",
        "  else if (msg.method === 'session/new') send({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's1' } });",
        "  else if (msg.method === 'session/prompt') process.exit(3);",
        '});',
      ].join('\n'),
    );
    const session = await ACPSession.start({
      command: process.execPath,
      args: [agent],
      projectRoot: dir,
      cwd: dir,
      timeoutMs: 60_000,
    });
    const started = Date.now();
    await expect(
      session.prompt([{ type: 'text', text: 'hi' }], new AbortController().signal),
    ).rejects.toThrow('agent connection closed (agent process exited with code 3)');
    expect(Date.now() - started).toBeLessThan(10_000);
    await session.close();
    stderr.mockRestore();
  }, 30_000);
});
