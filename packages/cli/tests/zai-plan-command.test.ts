import type { ZaiAccountHandle, ZaiPlanReport } from '@wrongstack/providers';
import { describe, expect, it, vi } from 'vitest';
import { buildZaiPlanCommand } from '../src/slash-commands/zai-plan.js';

const plain = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

const HOUR_S = 3600;

function report(overrides: Partial<ZaiPlanReport> = {}): ZaiPlanReport {
  const now = Math.floor(Date.now() / 1000);
  return {
    region: 'zai',
    quota: {
      level: 'max',
      windows: [{ id: 'primary', usedPercent: 8, windowMinutes: 300, resetsAt: now + 3 * HOUR_S }],
      tools: {
        used: 197,
        total: 4000,
        remaining: 3803,
        usedPercent: 4,
        resetsAt: now + 27 * HOUR_S,
        tools: [
          { tool: 'search-prime', calls: 165 },
          { tool: 'web-reader', calls: 32 },
          { tool: 'zread', calls: 0 },
        ],
      },
    },
    subscription: {
      product: 'GLM Coding Max',
      billingCycle: 'annually',
      autoRenew: false,
      renewsOrEndsOn: '2026-12-01',
    },
    usage: {
      days: 7,
      totalTokens: 8_371_727_911,
      cacheHitRate: 0.9401,
      offPeakRate: 0,
      models: [
        {
          model: 'GLM-5.3-Flash',
          totalTokens: 6_918_251_379,
          inputTokens: 6_899_669_544,
          cachedInputTokens: 6_505_636_264,
          outputTokens: 18_581_835,
        },
        {
          model: 'GLM-5.3',
          totalTokens: 1_453_476_532,
          inputTokens: 1_442_591_460,
          cachedInputTokens: 1_336_907_712,
          outputTokens: 10_885_072,
        },
      ],
      currentStreakDays: 7,
      peakDay: { date: '2026-09-27', tokens: 2_052_030_959 },
    },
    health: {
      date: '2026-09-30',
      lite: { tokensPerSecond: 96.0, successRate: 0.99961 },
      proMax: { tokensPerSecond: 120.43, successRate: 0.99953 },
    },
    ...overrides,
  };
}

function handle(overrides: Partial<ZaiAccountHandle> = {}): ZaiAccountHandle {
  return {
    providerId: 'zai-coding-plan',
    region: 'zai',
    codingPlan: true,
    fetchReport: vi.fn(async () => report()),
    ...overrides,
  };
}

async function render(h: ZaiAccountHandle, r: ZaiPlanReport = report()): Promise<string> {
  const account = { ...h, fetchReport: vi.fn(async () => r) };
  const out = await buildZaiPlanCommand({ accounts: () => [account] }).run('');
  return plain(out?.message ?? '');
}

describe('report rendering', () => {
  it('shows plan, windows, MCP pool, usage and service health', async () => {
    const text = await render(handle());
    expect(text).toContain('zai-coding-plan (api.z.ai)');
    expect(text).toContain('GLM Coding Max · annually · ends 2026-12-01 (auto-renew off)');
    expect(text).toMatch(/5h\s+\S+ 8\.0% \(92% left\) · resets in/);
    expect(text).toContain('197/4000 tool calls this month (search-prime 165, web-reader 32)');
    expect(text).not.toContain('zread 0');
    expect(text).toContain('8.37B tokens · cache hit 94.0% · off-peak 0%');
    expect(text).toMatch(/GLM-5\.3-Flash\s+6\.92B/);
    expect(text).toContain('out 18.6M');
    expect(text).toContain('streak 7d · peak 2.05B on 2026-09-27');
    expect(text).toContain('pro/max 120 tok/s · 99.95% ok');
  });

  it('flags a pay-as-you-go provider and survives missing sections', async () => {
    const text = await render(
      handle({ codingPlan: false, providerId: 'zai' }),
      report({ quota: undefined, subscription: undefined, usage: undefined, health: undefined }),
    );
    expect(text).toContain('pay-as-you-go endpoint');
    expect(text).toContain('Quota could not be read');
  });
});

describe('/zai-plan', () => {
  it('explains when no Z.AI provider is active', async () => {
    const cmd = buildZaiPlanCommand({ accounts: () => [] });
    const out = await cmd.run('');
    expect(plain(out?.message ?? '')).toContain('No Z.AI / BigModel provider is active');
  });

  it('rejects an out-of-range day count without fetching', async () => {
    const h = handle();
    const cmd = buildZaiPlanCommand({ accounts: () => [h] });
    for (const arg of ['0', '31', 'abc', '2.5']) {
      expect((await cmd.run(arg))?.message).toContain('Usage: /zai-plan');
    }
    expect(h.fetchReport).not.toHaveBeenCalled();
  });

  it('passes the day window to every account', async () => {
    const a = handle();
    const b = handle({ providerId: 'zhipuai-coding-plan', region: 'bigmodel' });
    const cmd = buildZaiPlanCommand({ accounts: () => [a, b] });
    const out = plain((await cmd.run('30'))?.message ?? '');
    expect(a.fetchReport).toHaveBeenCalledWith({ days: 30 });
    expect(b.fetchReport).toHaveBeenCalledWith({ days: 30 });
    expect(out).toContain('zhipuai-coding-plan (open.bigmodel.cn)');
  });
});
