/**
 * ACP fallback for background `delegate` results.
 *
 * ACP only starts a turn on `session/prompt`, so a background result that
 * settles while the client is idle waits for the next prompt (the core agent
 * loop injects it at iteration 0). The turn adapter tells the client with ONE
 * coalesced unprompted `session/update`, and never:
 *  - while a turn is running (that turn's loop injects the result),
 *  - for a result already drained or delivered,
 *  - for another session,
 *  - after the session was closed.
 */

import type { Agent } from '@wrongstack/core/agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunTurnApi } from '../src/agent/protocol-contract.js';
import { ACPProtocolHandler } from '../src/agent/protocol-handler.js';
import { makeACPServerAgentTurn, serverAgentTurnCoverage } from '../src/agent/server-agent-turn.js';
import type { AgentServerTransport } from '../src/agent/stdio-transport.js';

const CWD = process.cwd();
const DEBOUNCE_MS = 15;
const SETTLE_MS = 80;

type Listener = (payload: unknown) => void;

function makeBus() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    on(name: string, cb: Listener): () => void {
      const set = listeners.get(name) ?? new Set<Listener>();
      set.add(cb);
      listeners.set(name, set);
      return () => {
        set.delete(cb);
      };
    },
    emit(name: string, payload: unknown): void {
      for (const cb of [...(listeners.get(name) ?? [])]) cb(payload);
    },
    size(name: string): number {
      return listeners.get(name)?.size ?? 0;
    },
  };
}

interface Rig {
  handler: ACPProtocolHandler;
  sent: unknown[];
  bus: ReturnType<typeof makeBus>;
  run: ReturnType<typeof vi.fn>;
  turn: ReturnType<typeof makeACPServerAgentTurn>;
}

function makeRig(
  opts: {
    run?: (input: unknown) => Promise<unknown>;
    pendingDeliveries?: (sessionId: string) => number;
  } = {},
): Rig {
  const sent: unknown[] = [];
  const transport = {
    send: vi.fn(async (m: unknown) => {
      sent.push(typeof m === 'string' ? JSON.parse(m) : m);
    }),
  };
  const bus = makeBus();
  const run = vi.fn(opts.run ?? (async () => ({ text: 'ok', stopReason: 'end_turn' })));
  const turn = makeACPServerAgentTurn({
    deliveryNoticeDebounceMs: DEBOUNCE_MS,
    ...(opts.pendingDeliveries ? { pendingDeliveries: opts.pendingDeliveries } : {}),
    agentFor: async (sessionId) =>
      ({
        events: bus,
        ctx: { session: { id: sessionId } },
        run,
        teardown: vi.fn(async () => {}),
      }) as never as Agent,
  });
  const handler = new ACPProtocolHandler({
    transport: transport as never as AgentServerTransport,
    defaultCwd: CWD,
    runTurn: turn,
    disposeFor: turn.dispose,
  });
  return { handler, sent, bus, run, turn };
}

let nextId = 1;
async function request(rig: Rig, method: string, params: unknown): Promise<unknown> {
  const id = nextId++;
  await rig.handler.handleMessage({ jsonrpc: '2.0', id, method, params });
  const reply = rig.sent.find((m) => (m as { id?: unknown }).id === id) as
    | { result?: unknown; error?: { message?: string } }
    | undefined;
  if (reply?.error) throw new Error(reply.error.message);
  return reply?.result;
}

async function openSession(rig: Rig): Promise<string> {
  await request(rig, 'initialize', { protocolVersion: 1, clientCapabilities: {} });
  const created = (await request(rig, 'session/new', { cwd: CWD, mcpServers: [] })) as {
    sessionId: string;
  };
  return created.sessionId;
}

function prompt(rig: Rig, sessionId: string, text = 'hi'): Promise<unknown> {
  return request(rig, 'session/prompt', { sessionId, prompt: [{ type: 'text', text }] });
}

function notices(rig: Rig): Array<{ sessionId: string; text: string }> {
  return rig.sent.flatMap((m) => {
    const msg = m as {
      method?: string;
      params?: {
        sessionId: string;
        update?: { sessionUpdate?: string; content?: { text?: string } };
      };
    };
    const text = msg.params?.update?.content?.text ?? '';
    return msg.method === 'session/update' &&
      msg.params?.update?.sessionUpdate === 'agent_message_chunk' &&
      text.includes('finished; send any message to continue')
      ? [{ sessionId: msg.params.sessionId, text }]
      : [];
  });
}

function pending(sessionId: string, ...deliveryIds: string[]) {
  return { sessionId, count: deliveryIds.length, wake: true, deliveryIds };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const rigs: Rig[] = [];
afterEach(() => {
  for (const rig of rigs.splice(0)) rig.handler.close();
});

describe('ACP background-delegation notice', () => {
  it('sends one coalesced unprompted notice while idle, then the next prompt runs a turn', async () => {
    const rig = makeRig();
    rigs.push(rig);
    const sessionId = await openSession(rig);
    await prompt(rig, sessionId);

    rig.bus.emit('leader.delivery_pending', pending(sessionId, 'delegation:d-1'));
    rig.bus.emit('leader.delivery_pending', pending(sessionId, 'delegation:d-2'));

    await expect.poll(() => notices(rig).length).toBe(1);
    await sleep(SETTLE_MS);
    const [notice] = notices(rig);
    expect(notice?.sessionId).toBe(sessionId);
    expect(notice?.text).toBe(
      'Background delegations d-1, d-2 finished; send any message to continue.',
    );

    // ACP never started a turn on its own; the client's next prompt does, and
    // that turn's loop is what injects the queued results.
    expect(rig.run).toHaveBeenCalledTimes(1);
    await prompt(rig, sessionId, 'continue');
    expect(rig.run).toHaveBeenCalledTimes(2);
    await sleep(SETTLE_MS);
    expect(notices(rig)).toHaveLength(1);
  });

  it('stays quiet while a turn is running when the result was drained by that turn', async () => {
    let release!: () => void;
    const rig = makeRig({
      run: () =>
        new Promise((resolve) => {
          release = () => resolve({ text: 'done', stopReason: 'end_turn' });
        }),
      pendingDeliveries: () => 0,
    });
    rigs.push(rig);
    const sessionId = await openSession(rig);
    const inFlight = prompt(rig, sessionId);
    await expect.poll(() => rig.run.mock.calls.length).toBe(1);

    rig.bus.emit('leader.delivery_pending', pending(sessionId, 'delegation:mid-turn'));
    await sleep(SETTLE_MS);
    expect(notices(rig)).toHaveLength(0);

    release();
    await inFlight;
    await sleep(SETTLE_MS);
    expect(notices(rig)).toHaveLength(0);
  });

  it('announces a result that landed after the final drain once the turn ends', async () => {
    let release!: () => void;
    const rig = makeRig({
      run: () =>
        new Promise((resolve) => {
          release = () => resolve({ text: 'done', stopReason: 'end_turn' });
        }),
      pendingDeliveries: () => 1,
    });
    rigs.push(rig);
    const sessionId = await openSession(rig);
    const inFlight = prompt(rig, sessionId);
    await expect.poll(() => rig.run.mock.calls.length).toBe(1);

    rig.bus.emit('leader.delivery_pending', pending(sessionId, 'delegation:late'));
    await sleep(SETTLE_MS);
    expect(notices(rig)).toHaveLength(0);

    release();
    await inFlight;
    await expect.poll(() => notices(rig).length).toBe(1);
    expect(notices(rig)[0]?.text).toBe(
      'Background delegation late finished; send any message to continue.',
    );
  });

  it('without a live pending count, treats mid-turn announcements as consumed by the turn', async () => {
    let release!: () => void;
    const rig = makeRig({
      run: () =>
        new Promise((resolve) => {
          release = () => resolve({ text: 'done', stopReason: 'end_turn' });
        }),
    });
    rigs.push(rig);
    const sessionId = await openSession(rig);
    const inFlight = prompt(rig, sessionId);
    await expect.poll(() => rig.run.mock.calls.length).toBe(1);
    rig.bus.emit('leader.delivery_pending', pending(sessionId, 'delegation:mid'));
    release();
    await inFlight;
    await sleep(SETTLE_MS);
    expect(notices(rig)).toHaveLength(0);
  });

  it('skips a notice when the host reports nothing still pending', async () => {
    const rig = makeRig({ pendingDeliveries: () => 0 });
    rigs.push(rig);
    const sessionId = await openSession(rig);
    await prompt(rig, sessionId);
    rig.bus.emit('leader.delivery_pending', pending(sessionId, 'delegation:gone'));
    await sleep(SETTLE_MS);
    expect(notices(rig)).toHaveLength(0);
  });

  it('drops an announcement delivered in-band before the window closes', async () => {
    const rig = makeRig();
    rigs.push(rig);
    const sessionId = await openSession(rig);
    await prompt(rig, sessionId);
    rig.bus.emit('leader.delivery_pending', pending(sessionId, 'delegation:awaited'));
    rig.bus.emit('delegation.delivered', {
      sessionId,
      delegationId: 'awaited',
      via: 'await_tasks',
    });
    await sleep(SETTLE_MS);
    expect(notices(rig)).toHaveLength(0);
  });

  it('ignores deliveries for another session', async () => {
    const rig = makeRig();
    rigs.push(rig);
    const sessionId = await openSession(rig);
    await prompt(rig, sessionId);
    rig.bus.emit('leader.delivery_pending', pending('some-other-session', 'delegation:x'));
    await sleep(SETTLE_MS);
    expect(notices(rig)).toHaveLength(0);
  });

  it('sends nothing after session/close, including a notice already scheduled', async () => {
    const rig = makeRig();
    rigs.push(rig);
    const sessionId = await openSession(rig);
    await prompt(rig, sessionId);

    rig.bus.emit('leader.delivery_pending', pending(sessionId, 'delegation:before-close'));
    await request(rig, 'session/close', { sessionId });
    // Disposal also detached the listeners.
    expect(rig.bus.size('leader.delivery_pending')).toBe(0);
    rig.bus.emit('leader.delivery_pending', pending(sessionId, 'delegation:after-close'));
    await sleep(SETTLE_MS);
    expect(notices(rig)).toHaveLength(0);
  });

  it('never sends for a closed session even if the adapter was not disposed', async () => {
    // A host that forgets `disposeFor` still must not notify a closed session:
    // the API's `sendSessionUpdate` checks the live session itself.
    const sent: unknown[] = [];
    const bus = makeBus();
    const turn = makeACPServerAgentTurn({
      deliveryNoticeDebounceMs: DEBOUNCE_MS,
      agentFor: async (id) =>
        ({
          events: bus,
          ctx: { session: { id } },
          run: vi.fn(async () => ({ text: 'ok' })),
          teardown: vi.fn(async () => {}),
        }) as never as Agent,
    });
    const handler = new ACPProtocolHandler({
      transport: {
        send: vi.fn(async (m: unknown) => {
          sent.push(typeof m === 'string' ? JSON.parse(m) : m);
        }),
      } as never as AgentServerTransport,
      defaultCwd: CWD,
      runTurn: turn,
    });
    const rig = { handler, sent, bus, run: vi.fn(), turn } as Rig;
    rigs.push(rig);
    const sessionId = await openSession(rig);
    await prompt(rig, sessionId);
    await request(rig, 'session/close', { sessionId });
    bus.emit('leader.delivery_pending', pending(sessionId, 'delegation:orphan'));
    await sleep(SETTLE_MS);
    expect(notices(rig)).toHaveLength(0);
  });

  it('contains a failing client send and never throws into the event bus', async () => {
    const bus = makeBus();
    const api: RunTurnApi = {
      clientCapabilities: {},
      requestPermission: async () => ({ outcome: 'cancelled' }),
      readTextFile: async () => '',
      writeTextFile: async () => {},
      runTerminal: async () => ({ output: '', exitCode: 0 }),
      sendSessionUpdate: vi.fn(async () => {
        throw new Error('transport gone');
      }),
    };
    const turn = makeACPServerAgentTurn({
      deliveryNoticeDebounceMs: DEBOUNCE_MS,
      agentFor: async () =>
        ({
          events: bus,
          ctx: { session: { id: 's-1' } },
          run: vi.fn(async () => ({ text: 'ok' })),
          teardown: vi.fn(async () => {}),
        }) as never as Agent,
    });
    await turn(
      { sessionId: 's-1', prompt: [], signal: new AbortController().signal },
      () => {},
      api,
    );

    expect(() =>
      bus.emit('leader.delivery_pending', pending('s-1', 'delegation:boom')),
    ).not.toThrow();
    expect(() => bus.emit('leader.delivery_pending', { malformed: true })).not.toThrow();
    await expect
      .poll(() => (api.sendSessionUpdate as ReturnType<typeof vi.fn>).mock.calls.length)
      .toBe(1);
    turn.dispose('s-1');
  });
});

describe('ACP delivery notice helpers', () => {
  const { deliveryNoticeText, agentOwnsSession, finiteNonNegativeLimit } = serverAgentTurnCoverage;

  it('names the delegation, strips the delivery prefix, and caps the id list', () => {
    expect(deliveryNoticeText(['delegation:abc'])).toBe(
      'Background delegation abc finished; send any message to continue.',
    );
    expect(deliveryNoticeText(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe(
      'Background delegations a, b, c, d, e (+2 more) finished; send any message to continue.',
    );
  });

  it('matches the ACP id or the id the agent context is bound to', () => {
    const agent = { ctx: { session: { id: 'D:\\run\\s' }, meta: { sessionId: 'owner' } } } as never;
    expect(agentOwnsSession(agent, 'acp-1', 'acp-1')).toBe(true);
    expect(agentOwnsSession(agent, 'acp-1', 'D:/run/s')).toBe(true);
    expect(agentOwnsSession(agent, 'acp-1', 'owner')).toBe(true);
    expect(agentOwnsSession(agent, 'acp-1', 'other')).toBe(false);
    expect(agentOwnsSession(agent, 'acp-1', undefined)).toBe(false);
  });

  it('accepts a zero debounce and falls back on invalid values', () => {
    expect(finiteNonNegativeLimit(0, 1500)).toBe(0);
    expect(finiteNonNegativeLimit(-1, 1500)).toBe(1500);
    expect(finiteNonNegativeLimit(Number.NaN, 1500)).toBe(1500);
  });
});
