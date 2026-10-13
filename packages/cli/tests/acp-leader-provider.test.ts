/**
 * An ACP agent as the leader (docs/plans/acp-leader-mode.md): leader turns go
 * to one persistent agent session per conversation and stream back as text;
 * side requests and WrongStack subagents never reach the agent.
 */
import { EventBus } from '@wrongstack/core/kernel';
import type { Config, Provider, StreamEvent } from '@wrongstack/core/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const acp = vi.hoisted(() => ({
  starts: [] as Array<Record<string, unknown>>,
  prompts: [] as string[],
  closes: [] as Array<{ graceMs?: number }>,
  turn: undefined as
    | ((onProgress: (e: unknown) => void) => Promise<Record<string, unknown>>)
    | undefined,
}));

vi.mock('@wrongstack/acp', () => ({
  textContent: (text: string) => ({ type: 'text', text }),
  resolveAcpAgentCommand: (id: string) =>
    id === 'claude-code' ? { command: 'npx', args: ['adapter'], role: id } : null,
  classifyAgentFailure: (rpc: { message: string }, agent: string) =>
    rpc.message.includes('hit your limit')
      ? { kind: 'provider_quota', message: `${agent}: quota`, retryable: false }
      : undefined,
  ACPSession: {
    start: async (opts: Record<string, unknown>) => {
      acp.starts.push(opts);
      return {
        prompt: async (
          blocks: Array<{ text: string }>,
          _signal: AbortSignal,
          onProgress: (e: unknown) => void,
        ) => {
          acp.prompts.push(blocks[0]?.text ?? '');
          return (
            (await acp.turn?.(onProgress)) ?? {
              text: 'ok',
              stopReason: 'end_turn',
              toolCalls: [],
              diffs: [],
              thoughts: '',
              hasText: true,
            }
          );
        },
        close: async (opts: { graceMs?: number } = {}) => {
          acp.closes.push(opts);
        },
      };
    },
  },
}));

const { acpLeaderHost, bindAcpLeaderHost, closeAcpLeaderSessions, dropAcpLeaderConfirm } =
  await import('../src/acp-leader/acp-leader-host.js');
const { AcpLeaderProvider, isLeaderTurn, leaderSideModel } = await import(
  '../src/acp-leader/acp-leader-provider.js'
);
const { agentTurnError, latestUserText } = await import('../src/acp-leader/acp-leader-stream.js');

const SIGNAL = new AbortController().signal;

function sideProvider(calls: string[]): Provider {
  return {
    id: 'zai',
    capabilities: {} as Provider['capabilities'],
    async *stream(req) {
      calls.push(`stream ${req.model}`);
      yield { type: 'message_start', model: req.model };
    },
    async complete(req) {
      calls.push(`complete ${req.model}`);
      return {
        content: [],
        stopReason: 'end_turn',
        usage: { input: 0, output: 0 },
        model: req.model,
      };
    },
  };
}

function leaderRequest(text: string, thread = 's1') {
  return {
    model: 'claude-code',
    messages: [
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'earlier' }] },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'answer' }] },
      { role: 'user' as const, content: [{ type: 'text' as const, text }] },
    ],
    cache: { sessionId: 's1', threadId: thread },
  };
}

async function collect(stream: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of stream) out.push(ev);
  return out;
}

const CONFIG = { acp: { leader: { sideModel: 'zai/glm-5' } } } as unknown as Config;

beforeEach(() => {
  acp.starts.length = 0;
  acp.prompts.length = 0;
  acp.closes.length = 0;
  acp.turn = undefined;
});
afterEach(() => bindAcpLeaderHost(undefined));

describe('which requests reach the agent', () => {
  it("treats a request as the leader's turn unless its thread is another agent's", () => {
    expect(isLeaderTurn({ cache: { sessionId: 's1', threadId: 's1' } } as never)).toBe(true);
    expect(isLeaderTurn({ cache: {} } as never)).toBe(true);
    expect(isLeaderTurn({ cache: { sessionId: 's1', threadId: 'sub-7' } } as never)).toBe(false);
  });

  it('picks the side model from acp.leader, then the fallback bridge and chain', () => {
    expect(leaderSideModel(CONFIG)).toEqual({ provider: 'zai', model: 'glm-5' });
    expect(leaderSideModel({ fallbackBridge: 'openai/gpt-5.5/mini' } as unknown as Config)).toEqual(
      { provider: 'openai', model: 'gpt-5.5/mini' },
    );
    // A bare id, or the ACP provider itself, cannot serve a side request.
    expect(
      leaderSideModel({ fallbackModels: ['glm-5', 'acp/claude-code'] } as unknown as Config),
    ).toBeUndefined();
  });

  it('sends side requests and subagent turns to the side model, never the agent', async () => {
    const calls: string[] = [];
    const provider = new AcpLeaderProvider({
      bootConfig: CONFIG,
      buildProvider: (id) => (id === 'zai' ? sideProvider(calls) : undefined),
    });
    await provider.complete(leaderRequest('title please') as never, { signal: SIGNAL });
    await collect(provider.stream(leaderRequest('sub task', 'sub-1') as never, { signal: SIGNAL }));
    expect(calls).toEqual(['complete glm-5', 'stream glm-5']);
    expect(acp.starts).toEqual([]);
  });

  it('refuses a side request clearly when no side model is configured', async () => {
    const provider = new AcpLeaderProvider({
      bootConfig: {} as Config,
      buildProvider: () => undefined,
    });
    await expect(
      provider.complete(leaderRequest('x') as never, { signal: SIGNAL }),
    ).rejects.toMatchObject({
      kind: 'invalid_request',
      message: expect.stringContaining('sideModel'),
    });
  });
});

describe('a leader turn', () => {
  it('streams the reply, relays tool cards, and keeps one agent session per conversation', async () => {
    const events = new EventBus();
    const cards: string[] = [];
    events.on('tool.started', (e) => cards.push(`start ${e.name}`));
    events.on('tool.executed', (e) => cards.push(`done ${e.name} ${e.ok}`));
    bindAcpLeaderHost({
      events,
      projectRoot: '/proj',
      getConfig: () => CONFIG,
      permission: () =>
        ({ evaluate: async () => ({ permission: 'auto', source: 'default' }) }) as never,
      context: () => ({}) as never,
      getTool: () => undefined,
    });
    acp.turn = async (onProgress) => {
      onProgress({ type: 'message', text: 'Hello ' });
      onProgress({
        type: 'tool_call',
        toolCall: { toolCallId: 't1', title: 'Read a.ts', status: 'pending', rawInput: { p: 1 } },
      });
      onProgress({
        type: 'tool_call_update',
        toolCall: {
          toolCallId: 't1',
          title: 'Read a.ts',
          status: 'completed',
          rawOutput: { output: 'x' },
        },
      });
      onProgress({ type: 'message', text: 'world' });
      return {
        text: 'Hello world',
        stopReason: 'end_turn',
        tokens: { input: 3, output: 5, cacheRead: 100, cacheWrite: 7 },
        toolCalls: [],
        diffs: [],
        thoughts: '',
        hasText: true,
      };
    };
    const provider = new AcpLeaderProvider({ bootConfig: CONFIG, buildProvider: () => undefined });
    const events1 = await collect(
      provider.stream(leaderRequest('first') as never, { signal: SIGNAL }),
    );
    expect(events1.map((e) => e.type)).toEqual([
      'message_start',
      'content_block_start',
      'text_delta',
      'text_delta',
      'content_block_stop',
      'message_stop',
    ]);
    expect(events1.at(-1)).toEqual({
      type: 'message_stop',
      stopReason: 'end_turn',
      usage: { input: 3, output: 5, cacheRead: 100, cacheWrite: 7 },
    });
    expect(cards).toEqual(['start Read a.ts', 'done Read a.ts true']);

    await collect(provider.stream(leaderRequest('second') as never, { signal: SIGNAL }));
    // Only the newest user message is sent; the agent keeps its own history.
    expect(acp.prompts).toEqual(['first', 'second']);
    expect(acp.starts).toHaveLength(1);
    expect(acp.starts[0]).toMatchObject({
      command: 'npx',
      cwd: '/proj',
      initialModeId: 'default',
      requireInitialMode: true,
    });
    expect(
      (acp.starts[0]?.sessionMeta as { systemPrompt: { append: string } }).systemPrompt.append,
    ).toContain('You are the leader of a WrongStack session');

    await closeAcpLeaderSessions();
    expect(acp.closes).toEqual([{ graceMs: 500 }]);
  });

  it('turns a spent subscription into quota_exhausted and starts a fresh agent after a crash', async () => {
    const provider = new AcpLeaderProvider({ bootConfig: CONFIG, buildProvider: () => undefined });
    acp.turn = async () => {
      throw Object.assign(new Error('session/prompt failed'), {
        kind: 'prompt_failed',
        cause: { code: -32603, message: "Internal error: You've hit your limit · resets 3pm" },
      });
    };
    await expect(
      collect(provider.stream(leaderRequest('a') as never, { signal: SIGNAL })),
    ).rejects.toMatchObject({ kind: 'quota_exhausted' });
    acp.turn = async () => {
      throw Object.assign(new Error('agent exited'), { kind: 'agent_died' });
    };
    await expect(
      collect(provider.stream(leaderRequest('b') as never, { signal: SIGNAL })),
    ).rejects.toMatchObject({ kind: 'server' });
    acp.turn = undefined;
    await collect(provider.stream(leaderRequest('c') as never, { signal: SIGNAL }));
    // The quota failure kept the session; the crash replaced it.
    expect(acp.starts).toHaveLength(2);
  });
});

describe('the host binding', () => {
  it('forgets the stdin prompt once the surface (TUI, WebUI) takes confirmations over', () => {
    bindAcpLeaderHost({
      events: new EventBus(),
      projectRoot: '/proj',
      getConfig: () => CONFIG,
      permission: () => ({}) as never,
      context: () => ({}) as never,
      getTool: () => undefined,
      confirmAwaiter: async () => 'yes',
    });
    dropAcpLeaderConfirm();
    expect(acpLeaderHost()?.confirmAwaiter).toBeUndefined();
    expect(acpLeaderHost()?.projectRoot).toBe('/proj');
  });
});

describe('stream helpers', () => {
  it('reads the newest user text and maps a stall to a timeout', () => {
    expect(latestUserText(leaderRequest('now').messages as never)).toBe('now');
    expect(
      agentTurnError(
        Object.assign(new Error('silent'), { kind: 'stalled' }),
        'claude-code',
        () => undefined,
      ),
    ).toMatchObject({ dead: true, error: { kind: 'timeout' } });
  });
});
