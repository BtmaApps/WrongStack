import { describe, expect, it } from 'vitest';
import {
  commitRequestLayout,
  DEFAULT_CACHE_TTL_MS,
  estimateMessageTokens,
  estimateTextTokens,
  getRequestResidency,
  liveBlockSource,
  type Message,
  type RequestLayoutInput,
  recordRequestLayout,
  recordRequestLayoutUsage,
  type TextBlock,
  type Tool,
} from '../../src/index.js';

const tool = (name: string): Tool => ({
  name,
  description: `desc-${name}`,
  permission: 'auto',
  mutating: false,
  inputSchema: { type: 'object' },
  async execute() {
    return '';
  },
});

const msg = (role: 'user' | 'assistant', text: string): Message => ({ role, content: text });
const block = (text: string): TextBlock => ({ type: 'text', text });

const TOOLS = [tool('read'), tool('edit')];
const SYSTEM = [block('You are a coding agent. '.repeat(40))];

function input(history: Message[], over: Partial<RequestLayoutInput> = {}): RequestLayoutInput {
  return {
    providerId: 'anthropic',
    model: 'claude-x',
    cacheControl: 'native',
    tools: TOOLS,
    system: SYSTEM,
    history,
    messages: history,
    tail: [],
    durableMessages: history,
    ...over,
  };
}

/** Record + commit one request for `ctx`, returning the request object. */
function send(ctx: object, layout: RequestLayoutInput, at: number): object {
  const request = {};
  recordRequestLayout(request, layout);
  commitRequestLayout(ctx, request, at);
  return request;
}

describe('getRequestResidency', () => {
  it('is undefined before any request was sent', () => {
    const ctx = { messages: [] as Message[] };
    // A built-but-unsent request (pre-flight rebuild) must not surface.
    recordRequestLayout({}, input([]));
    expect(getRequestResidency(ctx)).toBeUndefined();
  });

  it('first request: whole prefix is written, live tail uncached, verdict cold', () => {
    const history = [msg('user', 'hello there')];
    const ctx = { messages: history };
    const tail = [{ source: 'ledger', block: block('[completed_work] did things') }];
    const req = send(ctx, input(history, { tail }), 1_000);
    recordRequestLayoutUsage(req, { input: 900, output: 10, cacheRead: 0, cacheWrite: 800 });

    const r = getRequestResidency(ctx);
    expect(r?.mechanism).toBe('explicit');
    expect(r?.segments.map((s) => [s.kind, s.lane])).toEqual([
      ['tools', 'written'],
      ['system', 'written'],
      ['history-new', 'written'],
      ['live-tail', 'uncached'],
    ]);
    expect(r?.lanes.cached).toBe(0);
    expect(r?.lanes.uncached).toBe(estimateTextTokens('[completed_work] did things'));
    expect(r?.verdict).toBe('cold');
    expect(r?.breakers).toEqual([]);
  });

  it('append-only follow-up: prior history is cached and a matching read is a hit', () => {
    const h1 = [msg('user', 'first question '.repeat(20))];
    const ctx = { messages: h1 };
    send(ctx, input(h1), 1_000);
    const h2 = [...h1, msg('assistant', 'answer '.repeat(20)), msg('user', 'next')];
    ctx.messages = h2;
    const req = send(ctx, input(h2), 2_000);
    const r0 = getRequestResidency(ctx);
    const expectedCached = r0?.lanes.cached ?? 0;
    recordRequestLayoutUsage(req, {
      input: 10,
      output: 5,
      cacheRead: expectedCached,
      cacheWrite: r0?.lanes.written ?? 0,
    });

    const r = getRequestResidency(ctx);
    const prior = r?.segments.find((s) => s.kind === 'history-prior');
    const added = r?.segments.find((s) => s.kind === 'history-new');
    expect(prior).toMatchObject({ lane: 'cached', count: 1, tokens: estimateMessageTokens(h1) });
    expect(added).toMatchObject({ lane: 'written', count: 2 });
    expect(r?.segments[0]?.lane).toBe('cached');
    expect(r?.verdict).toBe('hit');
    expect(r?.sincePreviousMs).toBe(1_000);
  });

  it('names the breaker when the tool surface changes and nothing can be cached', () => {
    const h1 = [msg('user', 'q')];
    const ctx = { messages: h1 };
    send(ctx, input(h1), 1_000);
    const h2 = [...h1, msg('assistant', 'a')];
    const req = send(ctx, input(h2, { tools: [...TOOLS, tool('mcp__x__y')] }), 2_000);
    recordRequestLayoutUsage(req, { input: 500, output: 1, cacheRead: 0, cacheWrite: 500 });

    const r = getRequestResidency(ctx);
    expect(r?.breakers.map((b) => b.kind)).toEqual(['tools']);
    expect(r?.lanes.cached).toBe(0);
    expect(r?.verdict).toBe('miss');
  });

  it('detects a rewritten history (compaction) and keeps tools/system cached', () => {
    const a = msg('user', 'old turn');
    const ctx = { messages: [a, msg('assistant', 'old answer')] };
    send(ctx, input(ctx.messages), 1_000);
    const compacted: Message[] = [
      { role: 'system', content: '[context_state]\ndigest' },
      msg('user', 'new'),
    ];
    ctx.messages = compacted;
    send(ctx, input(compacted), 2_000);

    const r = getRequestResidency(ctx);
    expect(r?.breakers.map((b) => b.kind)).toEqual(['history']);
    expect(r?.segments.find((s) => s.kind === 'tools')?.lane).toBe('cached');
    expect(r?.segments.find((s) => s.kind === 'system')?.lane).toBe('cached');
    expect(r?.segments.some((s) => s.kind === 'history-prior')).toBe(false);
  });

  it('reports a provider/model switch and an idle gap past the cache TTL', () => {
    const h = [msg('user', 'q')];
    const ctx = { messages: h };
    send(ctx, input(h), 0);
    const req = send(ctx, input(h, { model: 'claude-y' }), DEFAULT_CACHE_TTL_MS + 60_000);
    recordRequestLayoutUsage(req, { input: 100, output: 1, cacheRead: 0 });
    const kinds = getRequestResidency(ctx)?.breakers.map((b) => b.kind);
    expect(kinds).toEqual(['route', 'idle']);
  });

  it('automatic cache: replayed live snapshots inside the prefix are cached', () => {
    const h1 = [msg('user', 'q1')];
    const snap1: Message = { role: 'user', content: [block('[live_context]'), block('plan v1')] };
    const ctx = { messages: h1 };
    send(
      ctx,
      input(h1, { cacheControl: 'auto', messages: [...h1, snap1], providerId: 'openai' }),
      1_000,
    );
    const h2 = [...h1, msg('assistant', 'a1'), msg('user', 'q2')];
    const snap2: Message = { role: 'user', content: [block('[live_context]'), block('plan v2')] };
    ctx.messages = h2;
    send(
      ctx,
      input(h2, {
        cacheControl: 'auto',
        providerId: 'openai',
        // RequestContextReplay keeps snap1 where it was and appends snap2.
        messages: [h2[0] as Message, snap1, h2[1] as Message, h2[2] as Message, snap2],
        tail: [{ source: 'plan', block: block('plan v2') }],
      }),
      2_000,
    );
    const r = getRequestResidency(ctx);
    expect(r?.mechanism).toBe('automatic');
    expect(r?.segments.find((s) => s.kind === 'live-snapshots')).toMatchObject({
      lane: 'cached',
      count: 1,
    });
    expect(r?.segments.find((s) => s.kind === 'live-tail')).toMatchObject({
      lane: 'written',
      count: 1,
      parts: [{ source: 'plan', tokens: estimateTextTokens('plan v2') }],
    });
  });

  it('no-cache wire: every segment is uncached and a zero read is "unsupported"', () => {
    const h = [msg('user', 'q')];
    const ctx = { messages: h };
    const req = send(ctx, input(h, { cacheControl: 'none' }), 1_000);
    recordRequestLayoutUsage(req, { input: 50, output: 1 });
    const r = getRequestResidency(ctx);
    expect(new Set(r?.segments.map((s) => s.lane))).toEqual(new Set(['uncached']));
    expect(r?.verdict).toBe('unsupported');
  });

  it('tells what the next request adds, or that history was rewritten', () => {
    const h = [msg('user', 'q')];
    const ctx = { messages: h };
    send(ctx, input(h), 1_000);
    const added = msg('assistant', 'pending answer');
    ctx.messages = [...h, added];
    expect(getRequestResidency(ctx)?.next).toEqual({
      rewritten: false,
      pendingMessages: 1,
      pendingTokens: estimateMessageTokens([added]),
    });
    ctx.messages = [msg('user', 'after /clear')];
    expect(getRequestResidency(ctx)?.next.rewritten).toBe(true);
  });

  it('without a baseline, a sliver of cache read is cold, a large one is a warm hit', () => {
    // Observed live (MiniMax, fresh process): 188 of 55k prompt tokens read.
    const h = [msg('user', 'q')];
    const sliver = { messages: h };
    const r1 = send(sliver, input(h), 1_000);
    recordRequestLayoutUsage(r1, { input: 55_000, output: 1, cacheRead: 188, cacheWrite: 0 });
    expect(getRequestResidency(sliver)?.verdict).toBe('cold');

    // A resumed session whose prefix is still warm at the provider.
    const warm = { messages: h };
    const r2 = send(warm, input(h), 1_000);
    recordRequestLayoutUsage(r2, { input: 2_000, output: 1, cacheRead: 50_000, cacheWrite: 0 });
    expect(getRequestResidency(warm)?.verdict).toBe('hit');
  });

  it('a pending (unanswered) request reports verdict pending', () => {
    const h = [msg('user', 'q')];
    const ctx = { messages: h };
    send(ctx, input(h), 1_000);
    expect(getRequestResidency(ctx)?.verdict).toBe('pending');
  });
});

describe('liveBlockSource', () => {
  it('labels a block by its leading tag', () => {
    expect(liveBlockSource(block('<local_skill_recommendation>\nx'))).toBe(
      'local_skill_recommendation',
    );
    expect(liveBlockSource(block('[turn_memory] y'))).toBe('turn_memory');
    expect(liveBlockSource(block('plain text'))).toBe('middleware');
  });
});

describe('getRequestResidency with copied messages', () => {
  it('treats an equal copy of a sent message as the same prefix, not a rewrite', () => {
    // Observed live in the WebUI: the host swapped the last sent message for an
    // equal copy after the turn; the provider still read the whole prefix.
    const sent = msg('user', 'first question');
    const ctx = { messages: [sent] as Message[] };
    send(ctx, input(ctx.messages), 1_000);
    const copy = {
      ...sent,
      _estTokens: 99,
      ts: '2026-10-11T00:00:00Z',
      origin: 'user_input',
    } as Message;
    ctx.messages = [copy];
    expect(getRequestResidency(ctx)?.next.rewritten).toBe(false);

    ctx.messages = [copy, msg('assistant', 'answer'), msg('user', 'next')];
    send(ctx, input(ctx.messages), 2_000);
    const r = getRequestResidency(ctx);
    expect(r?.breakers).toEqual([]);
    expect(r?.segments.find((s) => s.kind === 'history-prior')).toMatchObject({
      lane: 'cached',
      count: 1,
    });
  });

  it('still reports a real rewrite when the bytes changed', () => {
    const ctx = { messages: [msg('user', 'original')] as Message[] };
    send(ctx, input(ctx.messages), 1_000);
    ctx.messages = [msg('user', 'compacted digest')];
    expect(getRequestResidency(ctx)?.next.rewritten).toBe(true);
  });
});

describe('getRequestResidency attribution', () => {
  it('a sliver read on an unchanged prefix is a miss attributed to the provider', () => {
    // Observed live (MiniMax, tool loop): request 2 of a run, nothing changed,
    // 190 of 53.6k prompt tokens read.
    const h1 = [msg('user', 'question '.repeat(30))];
    const ctx = { messages: h1 };
    send(ctx, input(h1), 1_000);
    const h2 = [...h1, msg('assistant', 'tool call'), msg('user', 'tool result')];
    ctx.messages = h2;
    const req = send(ctx, input(h2), 3_000);
    recordRequestLayoutUsage(req, { input: 53_447, output: 5, cacheRead: 190, cacheWrite: 0 });
    const r = getRequestResidency(ctx);
    expect(r?.verdict).toBe('miss');
    expect(r?.breakers.map((b) => b.kind)).toEqual(['provider']);
  });

  it('a real partial read with nothing changed on our side stays partial, provider-attributed', () => {
    const h1 = [msg('user', 'question '.repeat(30))];
    const ctx = { messages: h1 };
    send(ctx, input(h1), 1_000);
    const req = send(ctx, input([...h1, msg('assistant', 'a')]), 2_000);
    const expected = getRequestResidency(ctx)?.lanes.cached ?? 0;
    recordRequestLayoutUsage(req, {
      input: expected,
      output: 1,
      cacheRead: Math.round(expected * 0.5),
      cacheWrite: 0,
    });
    const r = getRequestResidency(ctx);
    expect(r?.verdict).toBe('partial');
    expect(r?.breakers.map((b) => b.kind)).toEqual(['provider']);
  });

  it('numbers requests per context, not globally', () => {
    const a = { messages: [msg('user', 'a')] };
    const b = { messages: [msg('user', 'b')] };
    send(a, input(a.messages), 1_000);
    send(b, input(b.messages), 1_100);
    send(a, input(a.messages), 1_200);
    expect(getRequestResidency(a)?.seq).toBe(2);
    expect(getRequestResidency(b)?.seq).toBe(1);
  });
});

describe('getRequestResidency after an unanswered request', () => {
  it('does not blame the provider for a prefix the failed request never wrote', () => {
    const h = [msg('user', 'question '.repeat(30))];
    const ctx = { messages: h };
    send(ctx, input(h), 1_000); // no usage: the request errored
    const req = send(ctx, input(h), 2_000);
    recordRequestLayoutUsage(req, { input: 500, output: 1, cacheRead: 0, cacheWrite: 400 });
    const r = getRequestResidency(ctx);
    expect(r?.verdict).toBe('miss');
    expect(r?.breakers[0]?.detail).toContain('previous request got no response');
  });
});

describe('getRequestResidency request-scoped blocks', () => {
  it('accounts raw mail as its own never-cached segment, apart from the live tail', () => {
    const h = [msg('user', 'q')];
    const ctx = { messages: h };
    send(
      ctx,
      input(h, {
        tail: [{ source: 'ledger', block: block('[completed_work] x') }],
        ephemeral: [{ source: 'mailbox', block: block('[MAILBOX] status from fleet') }],
      }),
      1_000,
    );
    const r = getRequestResidency(ctx);
    expect(r?.segments.find((s) => s.kind === 'live-tail')?.parts).toEqual([
      { source: 'ledger', tokens: estimateTextTokens('[completed_work] x') },
    ]);
    expect(r?.segments.find((s) => s.kind === 'request-scoped')).toMatchObject({
      lane: 'uncached',
      count: 1,
      parts: [{ source: 'mailbox', tokens: estimateTextTokens('[MAILBOX] status from fleet') }],
    });
  });
});

describe('getRequestResidency cache_control awareness', () => {
  const stableA = 'You are a coding agent. '.repeat(40);
  const stableB = 'Follow the repository conventions. '.repeat(40);
  const marked = (text: string): TextBlock => ({
    type: 'text',
    text,
    cache_control: { type: 'ephemeral' },
  });

  /**
   * Two committed turns on one ctx: turn 1 sends `system1`, turn 2 extends the
   * history and sends `system2`. Returns the ctx (to read residency) and the
   * second request object (to attach usage).
   */
  function twoTurns(
    system1: TextBlock[],
    system2: TextBlock[],
  ): { ctx: { messages: Message[] }; req2: object } {
    const h1 = [msg('user', 'first question')];
    const ctx = { messages: h1 };
    send(ctx, input(h1, { system: system1 }), 1_000);
    const h2 = [...h1, msg('assistant', 'ok'), msg('user', 'second question')];
    ctx.messages = h2;
    const req2 = send(ctx, input(h2, { system: system2 }), 2_000);
    return { ctx, req2 };
  }

  const systemLane = (ctx: { messages: Message[] }): string | undefined =>
    getRequestResidency(ctx)?.segments.find((s) => s.kind === 'system')?.lane;
  const breakerKinds = (ctx: { messages: Message[] }): string[] =>
    (getRequestResidency(ctx)?.breakers ?? []).map((b) => b.kind);

  it('treats a moved cache_control marker as a system change, not a reusable prefix', () => {
    // Same blocks, same order, same text — only the breakpoint moved.
    const { ctx } = twoTurns([marked(stableA), block(stableB)], [block(stableA), marked(stableB)]);
    // `CacheLane` defines `cached` as a byte-identical prefix; a marker moved is
    // not one, so the segment must not claim reuse the wire cannot deliver.
    expect(systemLane(ctx)).not.toBe('cached');
    expect(breakerKinds(ctx)).toContain('system');
  });

  it('does not blame the provider for a miss caused by our own marker move', () => {
    const { ctx, req2 } = twoTurns(
      [marked(stableA), block(stableB)],
      [block(stableA), marked(stableB)],
    );
    recordRequestLayoutUsage(req2, { input: 900, output: 10, cacheRead: 0, cacheWrite: 800 });

    expect(getRequestResidency(ctx)?.verdict).toBe('miss');
    // The provider is only at fault when the prefix really was unchanged on our side.
    expect(breakerKinds(ctx)).not.toContain('provider');
  });

  it('still reports an unchanged system prefix as cached (control)', () => {
    const { ctx } = twoTurns([marked(stableA), block(stableB)], [marked(stableA), block(stableB)]);

    expect(systemLane(ctx)).toBe('cached');
    expect(breakerKinds(ctx)).not.toContain('system');
  });

  it('still detects a real system text change (control)', () => {
    const { ctx } = twoTurns(
      [block(stableA), block(stableB)],
      [block(`${stableA} CHANGED`), block(stableB)],
    );

    expect(breakerKinds(ctx)).toContain('system');
    expect(systemLane(ctx)).not.toBe('cached');
  });
});
