import { describe, expect, it, vi } from 'vitest';
import type { Context } from '../../src/core/context.js';
import { AutoCompactionMiddleware } from '../../src/execution/auto-compaction-middleware.js';
import { computeContextWindowBudget } from '../../src/utils/context-budget.js';
import {
  estimateRequestTokens,
  estimateRequestTokensCalibrated,
  estimateRequestTokensUpperBound,
  recordActualUsage,
  resetCalibration,
} from '../../src/utils/token-estimate.js';

function context(): Context {
  const ctx = {
    messages: [],
    systemPrompt: [],
    tools: [],
    meta: {},
    model: 'test',
    provider: { id: 'test' },
    session: { id: 'same-session' },
    clearFileTracking: vi.fn(),
  } as unknown as Context;
  let revision = 0;
  Object.defineProperty(ctx, 'state', {
    value: {
      get revision() {
        return revision;
      },
      replaceMessages(messages: Context['messages']) {
        ctx.messages = messages;
        revision++;
      },
    },
  });
  return ctx;
}

function report(tokens = 6000) {
  return {
    before: tokens,
    after: tokens,
    fullRequestTokensBefore: tokens,
    fullRequestTokensAfter: tokens,
    reductions: [],
  };
}

const thresholds = { warn: 0.5, soft: 0.75, hard: 0.9 };

describe('auto-compaction state isolation', () => {
  it('does not let a no-op in one context suppress compaction in another', async () => {
    const compact = vi.fn(async (_ctx: Context) => report());
    const mw = new AutoCompactionMiddleware({ compact }, 10000, () => 6000, thresholds);
    const a = context();
    const b = context();
    const next = vi.fn(async (ctx: Context) => ctx);
    await mw.handler()(a, next);
    await mw.handler()(a, next);
    expect(compact).toHaveBeenCalledTimes(1);
    await mw.handler()(b, next);
    expect(compact).toHaveBeenCalledTimes(2);
    expect(compact.mock.calls[1]?.[0]).toBe(b);
  });

  it('estimates each context even when counts, revision, system and tools match', async () => {
    const compact = vi.fn(async (_ctx: Context) => report());
    const mw = new AutoCompactionMiddleware({ compact }, 10000, undefined, thresholds);
    const a = context();
    const b = context();
    b.systemPrompt = a.systemPrompt;
    b.tools = a.tools;
    for (const [ctx, tokens] of [
      [a, 3000],
      [b, 6000],
    ] as const) {
      ctx.lastRequestTokens = tokens;
      ctx.meta['lastRequestTokensAt'] = { msgCount: 0, toolCount: 0, revision: 0 };
    }
    const next = async (ctx: Context) => ctx;
    await mw.handler()(a, next);
    await mw.handler()(b, next);
    expect(compact).toHaveBeenCalledTimes(1);
    expect(compact.mock.calls[0]?.[0]).toBe(b);
  });

  it('runs the first history hygiene pass independently for each context', async () => {
    const compact = vi.fn(async (_ctx: Context) => report(4000));
    const mw = new AutoCompactionMiddleware({ compact }, 10000, () => 6000, thresholds);
    const hygiene = vi.spyOn(
      mw as unknown as { runHistoryHygiene(ctx: Context): boolean },
      'runHistoryHygiene',
    );
    const a = context();
    const b = context();
    const next = async (ctx: Context) => ctx;
    await mw.handler()(a, next);
    await mw.handler()(b, next);
    expect(hygiene).toHaveBeenCalledTimes(2);
    expect(hygiene.mock.calls[1]?.[0]).toBe(b);
  });

  it('keeps blocking repeated hard overflow when static overhead cannot be trimmed', async () => {
    const ctx = context();
    ctx.systemPrompt = [{ text: 'overhead '.repeat(10000) }] as Context['systemPrompt'];
    const compact = vi.fn(async (_ctx: Context) => report(50000));
    const mw = new AutoCompactionMiddleware({ compact }, 10000, () => 50000, thresholds);
    const next = vi.fn(async (ctx: Context) => ctx);
    await expect(mw.handler()(ctx, next)).rejects.toMatchObject({ code: 'AGENT_CONTEXT_OVERFLOW' });
    await expect(mw.handler()(ctx, next)).rejects.toMatchObject({ code: 'AGENT_CONTEXT_OVERFLOW' });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('post-compaction send guard', () => {
  it('trims dense content even when its raw estimate fits below the target load', async () => {
    const ctx = context();
    ctx.messages = [{ role: 'user', content: '漢字'.repeat(7500) }];
    const raw = estimateRequestTokens(ctx.messages, ctx.systemPrompt, ctx.tools).total;
    const guard = () =>
      estimateRequestTokensUpperBound(ctx.messages, ctx.systemPrompt, ctx.tools).total;
    expect(raw / 9000).toBeLessThan(0.65);
    expect(guard() / 9000).toBeGreaterThan(1);
    const compact = vi.fn(async (_ctx: Context) => report(raw));
    const mw = new AutoCompactionMiddleware({ compact }, 10000, undefined, thresholds);
    const next = vi.fn(async (ctx: Context) => ctx);
    await mw.handler()(ctx, next);
    expect(compact).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    expect(guard() / 9000).toBeLessThan(thresholds.hard);
  });
});

describe('send guard reaches the hard line below a full window', () => {
  it('compacts uncalibrated dense text that the old 0.35 gate skipped', async () => {
    const maxContext = 100_000;
    const key = 'anthropic/claude-sonnet';
    const policy = { warn: 0.55, soft: 0.7, hard: 0.85 };
    // Historical skip: min(0.4, 0.875 / 2.5). It only kept inflated load under 1.0.
    const historicalWindowGate = Math.min(0.4, 0.875 / 2.5);
    resetCalibration(key);
    try {
      const chars = denseCharsUnderGate(maxContext, key, historicalWindowGate, policy.hard);
      const ctx = context();
      ctx.provider = { id: 'anthropic' } as Context['provider'];
      ctx.model = 'claude-sonnet';
      ctx.messages = [{ role: 'user', content: '漢'.repeat(chars) }];
      const before = loadPair(ctx, maxContext, key);
      expect(before.calibrated).toBeLessThan(historicalWindowGate);
      expect(before.guarded).toBeGreaterThanOrEqual(policy.hard);

      const compact = vi.fn(async (active: Context) => {
        const total = estimateRequestTokensCalibrated(
          active.messages,
          active.systemPrompt,
          active.tools ?? [],
          key,
        ).total;
        return report(total);
      });
      const mw = new AutoCompactionMiddleware({ compact }, maxContext, undefined, policy);
      const next = vi.fn(async (active: Context) => active);
      await mw.handler()(ctx, next);

      expect(compact).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledOnce();
      expect(loadPair(ctx, maxContext, key).guarded).toBeLessThan(policy.hard);
    } finally {
      resetCalibration(key);
    }
  });
});

function loadPair(
  ctx: Context,
  maxContext: number,
  key: string,
): { calibrated: number; guarded: number } {
  const calibrated = estimateRequestTokensCalibrated(
    ctx.messages,
    ctx.systemPrompt,
    ctx.tools ?? [],
    key,
  ).total;
  const guarded = estimateRequestTokensUpperBound(
    ctx.messages,
    ctx.systemPrompt,
    ctx.tools ?? [],
    key,
  ).total;
  const available = computeContextWindowBudget({
    maxContext,
    inputTokens: Math.max(calibrated, 1),
  }).availableInputTokens;
  return { calibrated: calibrated / available, guarded: guarded / available };
}

function denseCharsUnderGate(maxContext: number, key: string, gate: number, hard: number): number {
  const probe = context();
  probe.provider = { id: 'anthropic' } as Context['provider'];
  probe.model = 'claude-sonnet';
  let lo = 1_000;
  let hi = 200_000;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    probe.messages = [{ role: 'user', content: '漢'.repeat(mid) }];
    const sample = loadPair(probe, maxContext, key);
    if (sample.calibrated < gate && sample.guarded >= hard) {
      best = mid;
      hi = mid - 1;
    } else if (sample.guarded < hard) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) throw new Error('no dense transcript sits under the old gate and over hard');
  return best;
}

describe('token cache calibration identity', () => {
  it.each(['calibration update', 'model switch'])(
    'refreshes estimates after a %s',
    async (change) => {
      const ctx = context();
      ctx.provider = { id: 'cache-calibration-regression' } as Context['provider'];
      const oldKey = `${ctx.provider.id}/${ctx.model}`;
      const newKey = change === 'model switch' ? `${ctx.provider.id}/new-model` : oldKey;
      resetCalibration(oldKey);
      resetCalibration(newKey);
      try {
        for (let i = 0; i < 10; i++) recordActualUsage(1500, 3000, oldKey);
        ctx.lastRequestTokens = 3000;
        ctx.meta['lastRequestTokensAt'] = { msgCount: 0, toolCount: 0, revision: 0 };
        const compact = vi.fn(async (_ctx: Context) => report(4000));
        const mw = new AutoCompactionMiddleware({ compact }, 10000, undefined, thresholds);
        const next = async (ctx: Context) => ctx;
        await mw.handler()(ctx, next);
        expect(compact).not.toHaveBeenCalled();
        resetCalibration(newKey);
        for (let i = 0; i < 10; i++) recordActualUsage(4500, 3000, newKey);
        if (change === 'model switch') ctx.model = 'new-model';
        await mw.handler()(ctx, next);
        expect(compact).toHaveBeenCalledOnce();
      } finally {
        resetCalibration(oldKey);
        resetCalibration(newKey);
      }
    },
  );
});
