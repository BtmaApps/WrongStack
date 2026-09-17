import { describe, expect, it, vi } from 'vitest';
import type { AgentInternals } from '../../src/core/agent-internals.js';
import { createAgentLoopContextManager } from '../../src/core/agent-loop-context.js';
import type { Context } from '../../src/core/context.js';
import { ConversationState } from '../../src/core/conversation-state.js';
import { AutoCompactionMiddleware } from '../../src/execution/auto-compaction-middleware.js';
import {
  estimateRequestTokens,
  realAnchoredInputTokens,
  recordActualUsage,
  resetCalibration,
} from '../../src/utils/token-estimate.js';

function context(maxMessages = 0): Context {
  const ctx = {
    messageLimits: { maxMessages, maxMessageTokens: 0 },
    messages: [{ role: 'user', content: 'old' }],
    todos: [],
    meta: { realAnchorMsgCount: 1 },
    clearFileTracking: vi.fn(),
    lastRealInputTokens: 100,
    lastRequestTokens: 100,
    systemPrompt: [],
    tools: [],
    model: 'model-a',
    provider: { id: 'provider', capabilities: { maxContext: 10000 } },
    session: { id: 'accounting' },
    signal: new AbortController().signal,
  } as unknown as Context;
  Object.defineProperty(ctx, 'state', { value: new ConversationState(ctx) });
  return ctx;
}

function manager(ctx: Context) {
  return createAgentLoopContextManager(
    {
      ctx,
      events: { emit: vi.fn() },
      pipelines: { contextWindow: { run: vi.fn(async () => ctx) } },
    } as unknown as AgentInternals,
    { response: {} as never },
  );
}

function anchored(ctx: Context) {
  return realAnchoredInputTokens(
    ctx.messages,
    ctx.lastRealInputTokens,
    ctx.meta['realAnchorMsgCount'] as number,
  );
}

describe('context accounting after mutations', () => {
  it('rejects the usage anchor after a same-length history rewrite', () => {
    const ctx = context();
    ctx.state.replaceMessages([{ role: 'user', content: 'new '.repeat(10000) }]);
    expect(anchored(ctx)).toBeNull();
    expect(ctx.lastRequestTokens).toBeUndefined();
  });

  it('rejects the usage anchor after retention evicts its prefix', () => {
    const ctx = context(1);
    ctx.state.appendMessage({ role: 'user', content: 'replacement' });
    expect(ctx.messages).toHaveLength(1);
    expect(anchored(ctx)).toBeNull();
  });

  it('rejects the usage anchor after adding content inside the consumed prefix', () => {
    const ctx = context();
    ctx.state.appendBlockToLastUserMessage({ type: 'text', text: 'extra '.repeat(10000) });
    expect(anchored(ctx)).toBeNull();
  });

  it('retains the real anchor for append-only history and edits beyond its prefix', () => {
    const ctx = context();
    ctx.state.appendMessage({ role: 'user', content: 'unsent' });
    ctx.state.appendBlockToLastUserMessage({ type: 'text', text: 'also unsent' });
    expect(anchored(ctx)).toBeGreaterThan(100);
    expect(ctx.lastRealInputTokens).toBe(100);
  });

  it('rejects usage from the previous provider/model route', async () => {
    const ctx = context();
    ctx.meta['contextLimitRouteKey'] = 'provider/model-a';
    ctx.model = 'model-b';
    await manager(ctx).refreshProviderContextLimit(ctx.provider, ctx.model);
    expect(anchored(ctx)).toBeNull();
  });

  it.each(['system', 'tools'])(
    'refreshes the request stash when %s references change at the same counts',
    (changed) => {
      const ctx = context();
      if (changed === 'tools') ctx.tools = [{ name: 'read', inputSchema: {} }] as Context['tools'];
      const m = manager(ctx);
      m.refreshContextRequestTokenStash();
      if (changed === 'system') {
        ctx.systemPrompt = [{ type: 'text', text: 'new instructions '.repeat(1000) }];
      } else {
        ctx.tools = [
          { name: 'read', description: 'expanded docs '.repeat(1000), inputSchema: {} },
        ] as Context['tools'];
      }
      const expected = estimateRequestTokens(ctx.messages, ctx.systemPrompt, ctx.tools).total;
      expect(m.refreshContextRequestTokenStash()).toBe(expected);
    },
  );

  it('actually compacts an oversized rewritten history instead of trusting the old 100-token anchor', async () => {
    const ctx = context();
    ctx.state.replaceMessages([{ role: 'user', content: 'new '.repeat(10000) }]);
    const compact = vi.fn(async (current: Context) => {
      const tokens = estimateRequestTokens(
        current.messages,
        current.systemPrompt,
        current.tools,
      ).total;
      return {
        before: tokens,
        after: tokens,
        fullRequestTokensBefore: tokens,
        fullRequestTokensAfter: tokens,
        reductions: [],
      };
    });
    const mw = new AutoCompactionMiddleware({ compact }, 10000, undefined, {
      warn: 0.5,
      soft: 0.75,
      hard: 0.9,
    });
    const next = vi.fn(async (ctx: Context) => ctx);
    await mw.handler()(ctx, next);
    expect(compact).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    expect(estimateRequestTokens(ctx.messages, ctx.systemPrompt, ctx.tools).total).toBeLessThan(
      8100,
    );
  });
});

describe('agent-loop compaction cache', () => {
  it.each(['usage anchor', 'calibration', 'model switch'])(
    'does not suppress rechecking after a %s change',
    async (changed) => {
      const ctx = context();
      ctx.lastRealInputTokens = undefined;
      delete ctx.meta['realAnchorMsgCount'];
      const key = `${ctx.provider.id}/${ctx.model}`;
      resetCalibration(key);
      const run = vi.fn(async () => ctx);
      const m = createAgentLoopContextManager(
        {
          ctx,
          events: { emit: vi.fn() },
          pipelines: { contextWindow: { run } },
        } as unknown as AgentInternals,
        { response: {} as never },
      );
      try {
        m.refreshContextRequestTokenStash();
        await m.compactContextIfNeeded();
        await m.compactContextIfNeeded();
        expect(run).toHaveBeenCalledTimes(1);
        if (changed === 'usage anchor') {
          ctx.lastRealInputTokens = 9000;
          ctx.meta['realAnchorMsgCount'] = ctx.messages.length;
        } else if (changed === 'calibration') {
          for (let i = 0; i < 3; i++) recordActualUsage(150, 100, key);
        } else {
          ctx.model = 'changed-model';
        }
        await m.compactContextIfNeeded();
        expect(run).toHaveBeenCalledTimes(2);
      } finally {
        resetCalibration(key);
        resetCalibration(`${ctx.provider.id}/changed-model`);
      }
    },
  );
});

describe('context percentage cache identity', () => {
  it.each(['usage anchor', 'calibration', 'model', 'system', 'tools'])(
    'emits a refreshed percentage after a %s change without message growth',
    (changed) => {
      const ctx = context();
      if (changed !== 'usage anchor') {
        ctx.lastRealInputTokens = undefined;
        delete ctx.meta['realAnchorMsgCount'];
      }
      const key = `${ctx.provider.id}/${ctx.model}`;
      resetCalibration(key);
      const emit = vi.fn();
      const m = createAgentLoopContextManager(
        {
          ctx,
          events: { emit },
          pipelines: { contextWindow: { run: vi.fn(async () => ctx) } },
        } as unknown as AgentInternals,
        { response: {} as never },
      );
      try {
        m.emitContextPct();
        m.emitContextPct();
        expect(emit).toHaveBeenCalledTimes(1);
        if (changed === 'usage anchor') ctx.lastRealInputTokens = 9000;
        if (changed === 'calibration') for (let i = 0; i < 3; i++) recordActualUsage(150, 100, key);
        if (changed === 'model') ctx.model = 'different-model';
        if (changed === 'system') ctx.systemPrompt = [{ type: 'text', text: 'new '.repeat(1000) }];
        if (changed === 'tools')
          ctx.tools = [{ name: 'new-tool', inputSchema: {} }] as Context['tools'];
        m.emitContextPct();
        expect(emit).toHaveBeenCalledTimes(2);
        expect(emit.mock.calls[1]?.[0]).toBe('ctx.pct');
        if (changed === 'usage anchor')
          expect(emit.mock.calls[1]?.[1]).toMatchObject({ tokens: 9000 });
        if (changed === 'system') expect(emit.mock.calls[1]?.[1].tokens).toBeGreaterThan(1000);
        if (changed === 'tools') expect(emit.mock.calls[1]?.[1].tokens).toBeGreaterThan(1);
      } finally {
        resetCalibration(key);
        resetCalibration(`${ctx.provider.id}/different-model`);
      }
    },
  );
});
