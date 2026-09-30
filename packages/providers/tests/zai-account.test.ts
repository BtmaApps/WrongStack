/**
 * Z.AI / BigModel account plane — the monitor API reads behind ZCode's usage
 * panel. Fixtures are shaped on live responses captured 2026-09-30 (GLM Coding
 * Max, personal plan); billing fields the report never reads are trimmed.
 */

import { getProviderQuota, resetProviderQuota } from '@wrongstack/core/quota';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchZaiPlanReport,
  isZaiCodingPlanEndpoint,
  reportZaiQuota,
  zaiQuotaResetInMs,
  zaiQuotaSnapshots,
  zaiRegionOf,
} from '../src/zai-account.js';

afterEach(() => {
  resetProviderQuota();
});

const FIVE_HOUR_RESET = 1_790_765_658_788;
const MONTH_RESET = 1_790_850_670_983;

const FIVE_HOUR_ROW = {
  type: 'TOKENS_LIMIT',
  unit: 3,
  number: 5,
  percentage: 8,
  nextResetTime: FIVE_HOUR_RESET,
};

function liveQuota(tokens: Record<string, unknown>[] = [FIVE_HOUR_ROW]): unknown {
  return {
    code: 200,
    msg: 'Operation successful',
    success: true,
    data: {
      level: 'max',
      limits: [
        {
          type: 'TIME_LIMIT',
          unit: 5,
          number: 1,
          usage: 4000,
          currentValue: 197,
          remaining: 3803,
          percentage: 4,
          nextResetTime: MONTH_RESET,
          usageDetails: [
            { modelCode: 'search-prime', usage: 165 },
            { modelCode: 'web-reader', usage: 32 },
            { modelCode: 'zread', usage: 0 },
          ],
        },
        ...tokens,
      ],
    },
  };
}

/** A fetch that answers every URL with `body` and records what it was asked. */
function answering(body: unknown | ((url: string) => Response)): {
  fetchImpl: typeof fetch;
  calls: Array<{ url: string; headers: Record<string, string> }>;
} {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return typeof body === 'function'
      ? (body as (u: string) => Response)(url)
      : new Response(JSON.stringify(body));
  }) as never as typeof fetch;
  return { fetchImpl, calls };
}

async function read(body: unknown, providerId = 'zai-coding-plan') {
  const { fetchImpl } = answering(body);
  return reportZaiQuota(providerId, { apiKey: 'k', region: 'zai', fetchImpl });
}

describe('host recognition', () => {
  it('tells the two deployments apart, through the trace proxy too', () => {
    expect(zaiRegionOf('https://api.z.ai/api/coding/paas/v4')).toBe('zai');
    expect(zaiRegionOf('https://open.bigmodel.cn/api/coding/paas/v4')).toBe('bigmodel');
    expect(zaiRegionOf('http://localhost:3444/proxy/api.z.ai/api/coding/paas/v4')).toBe('zai');
    expect(zaiRegionOf('https://notz.ai.example.com/v1')).toBeUndefined();
    expect(zaiRegionOf('https://evilz.ai/v1')).toBeUndefined();
    expect(zaiRegionOf(undefined)).toBeUndefined();
  });

  it('meters only the Coding Plan endpoints, never the pay-as-you-go one', () => {
    expect(isZaiCodingPlanEndpoint('https://api.z.ai/api/coding/paas/v4')).toBe(true);
    expect(isZaiCodingPlanEndpoint('https://api.z.ai/api/anthropic')).toBe(true);
    expect(isZaiCodingPlanEndpoint('https://open.bigmodel.cn/api/coding/paas/v4')).toBe(true);
    expect(isZaiCodingPlanEndpoint('http://localhost:5173/proxy/api.z.ai/api/coding/paas/v4')).toBe(
      true,
    );
    expect(isZaiCodingPlanEndpoint('https://api.z.ai/api/paas/v4')).toBe(false);
    expect(isZaiCodingPlanEndpoint('https://api.example.com/api/coding/paas/v4')).toBe(false);
  });
});

describe('quota/limit', () => {
  it('reads the 5-hour window and the MCP tool pool from a live response', async () => {
    const reading = await read(liveQuota());
    expect(reading?.level).toBe('max');
    expect(reading?.windows).toEqual([
      {
        id: 'primary',
        usedPercent: 8,
        windowMinutes: 300,
        resetsAt: Math.floor(FIVE_HOUR_RESET / 1000),
      },
    ]);
    // On TIME_LIMIT rows `usage` is the TOTAL and `currentValue` the used part.
    expect(reading?.tools).toMatchObject({
      used: 197,
      total: 4000,
      remaining: 3803,
      usedPercent: 4,
    });
    expect(reading?.tools?.tools.map((t) => t.tool)).toEqual([
      'search-prime',
      'web-reader',
      'zread',
    ]);
  });

  it('reads the weekly window and treats CREDIT_LIMIT as the same model budget', async () => {
    const reading = await read(
      liveQuota([
        { type: 'CREDIT_LIMIT', unit: 6, number: 1, percentage: 40, nextResetTime: MONTH_RESET },
        { ...FIVE_HOUR_ROW, percentage: 90 },
      ]),
    );
    expect(reading?.windows.map((w) => [w.id, w.windowMinutes, w.usedPercent])).toEqual([
      ['primary', 300, 90],
      ['secondary', 10_080, 40],
    ]);
  });

  it('rejects a failed envelope even though it arrives as HTTP 200', async () => {
    expect(await read({ code: 401, msg: 'token expired or incorrect', success: false })).toBe(
      undefined,
    );
    expect(await read({ code: 200, success: true, data: {} })).toBeUndefined();
    expect(getProviderQuota('zai-coding-plan')).toEqual([]);
  });

  it('records the model windows as one meter and the tool pool as a note, off the chip', async () => {
    await read(liveQuota());
    const snapshots = getProviderQuota('zai-coding-plan');
    const plan = snapshots.find((s) => s.meterId === 'default');
    const tools = snapshots.find((s) => s.meterId === 'mcp-tools');
    expect(plan?.planLabel).toBe('coding max');
    expect(plan?.windows).toHaveLength(1);
    expect(plan?.reachedWindowId).toBeUndefined();
    // No windows: the status chip picks the worst WINDOW, and an MCP pool must
    // not read as the model plan running out.
    expect(tools?.windows).toEqual([]);
    expect(tools?.note).toContain('197/4000 calls this month');
    expect(tools?.note).toContain('search-prime 165, web-reader 32');
    expect(tools?.note).not.toContain('zread');
  });

  it('marks an exhausted window reached and dates the wait by its reset', async () => {
    const now = FIVE_HOUR_RESET - 3_600_000;
    const reading = await read(liveQuota([{ ...FIVE_HOUR_ROW, percentage: 100 }]));
    expect(zaiQuotaSnapshots('p', reading!, now)[0]?.reachedWindowId).toBe('primary');
    expect(zaiQuotaResetInMs(reading, now)).toBe(3_600_000 - (FIVE_HOUR_RESET % 1000));
    expect(zaiQuotaResetInMs(await read(liveQuota()), now)).toBeUndefined();
  });
});

describe('account fetch', () => {
  it('sends the key raw — no Bearer — to the account host', async () => {
    const { fetchImpl, calls } = answering(liveQuota());
    await reportZaiQuota('p', { apiKey: 'secret-key', region: 'zai', fetchImpl });
    expect(calls[0]?.url).toBe('https://api.z.ai/api/monitor/usage/quota/limit');
    expect(calls[0]?.headers['authorization']).toBe('secret-key');
  });

  it('falls back to the BigModel business origin when the inference host has no answer', async () => {
    const { fetchImpl, calls } = answering((url: string) =>
      url.startsWith('https://open.bigmodel.cn')
        ? new Response('not here', { status: 404 })
        : new Response(JSON.stringify(liveQuota())),
    );
    const reading = await reportZaiQuota('p', { apiKey: 'k', region: 'bigmodel', fetchImpl });
    expect(reading).toBeDefined();
    expect(calls.map((c) => c.url)).toEqual([
      'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
      'https://bigmodel.cn/api/monitor/usage/quota/limit',
    ]);
  });

  it('never throws — a network failure is simply no reading', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    }) as never as typeof fetch;
    await expect(
      reportZaiQuota('p', { apiKey: 'k', region: 'zai', fetchImpl }),
    ).resolves.toBeUndefined();
  });
});

describe('plan report', () => {
  const subscriptions = [
    {
      productName: 'GLM Coding Max',
      status: 'VALID',
      inCurrentPeriod: true,
      autoRenew: 0,
      billingCycle: 'annually',
      nextRenewTime: '2026-12-01',
      valid: '2026-12-01 18:31:11-2027-12-01 18:31:11',
    },
    {
      productName: 'GLM Coding Max',
      status: 'VALID',
      inCurrentPeriod: false,
      autoRenew: 1,
      billingCycle: 'monthly',
      nextRenewTime: '2027-01-01',
    },
  ];
  const usageDetail = {
    summary: { cacheHitRate: { value: '0.9401' }, offPeakUsageRate: { value: '0.0000' } },
    modelUsage: {
      totalUsage: { totalTokens: 1_000 },
      modelDataList: [
        {
          modelName: 'GLM-5.3',
          totalTokensUsage: [100, 200],
          inputTokensUsage: [90, 180],
          cachedInputTokensUsage: [80, 170],
          outputTokensUsage: [10, 20],
        },
        {
          modelName: 'GLM-5.3-Flash',
          totalTokensUsage: [300, 400],
          inputTokensUsage: [0, 0],
          cachedInputTokensUsage: [0, 0],
          outputTokensUsage: [0, 0],
        },
      ],
    },
  };
  const activity = {
    summary: { currentStreakDays: 7, peakDailyTokens: 2_052, peakDailyTokensDate: '2026-09-27' },
  };
  const performance = {
    x_time: ['2026-09-29', '2026-09-30'],
    liteDecodeSpeed: [100, 96],
    proMaxDecodeSpeed: [117, 120],
    liteSuccessRate: [0.999, 0.9996],
    proMaxSuccessRate: [0.9988, 0.9995],
  };

  const ok = (data: unknown) => new Response(JSON.stringify({ code: 200, success: true, data }));

  function account(overrides: Record<string, () => Response> = {}) {
    return answering((url: string) => {
      for (const [fragment, respond] of Object.entries(overrides)) {
        if (url.includes(fragment)) return respond();
      }
      if (url.includes('/quota/limit')) return new Response(JSON.stringify(liveQuota()));
      if (url.includes('/subscription/list')) return ok(subscriptions);
      if (url.includes('/usage-detail')) return ok(usageDetail);
      if (url.includes('/activity')) return ok(activity);
      if (url.includes('/model-performance-day')) return ok(performance);
      return new Response('{}', { status: 404 });
    });
  }

  it('assembles plan, usage and service health from the live shapes', async () => {
    const { fetchImpl, calls } = account();
    const report = await fetchZaiPlanReport({
      apiKey: 'k',
      region: 'zai',
      fetchImpl,
      now: new Date(2026, 8, 30, 12),
    });
    // The subscription in force, not the queued renewals.
    expect(report.subscription).toEqual({
      product: 'GLM Coding Max',
      billingCycle: 'annually',
      autoRenew: false,
      renewsOrEndsOn: '2026-12-01',
    });
    expect(report.usage?.totalTokens).toBe(1_000);
    expect(report.usage?.cacheHitRate).toBeCloseTo(0.9401);
    expect(report.usage?.offPeakRate).toBe(0);
    expect(report.usage?.models.map((m) => [m.model, m.totalTokens, m.cachedInputTokens])).toEqual([
      ['GLM-5.3-Flash', 700, 0],
      ['GLM-5.3', 300, 250],
    ]);
    expect(report.usage?.currentStreakDays).toBe(7);
    expect(report.usage?.peakDay).toEqual({ date: '2026-09-27', tokens: 2_052 });
    expect(report.health).toEqual({
      date: '2026-09-30',
      lite: { tokensPerSecond: 96, successRate: 0.9996 },
      proMax: { tokensPerSecond: 120, successRate: 0.9995 },
    });
    const urls = calls.map((c) => c.url);
    expect(urls.some((u) => u.includes('startTime=2026-09-24%2000%3A00%3A00'))).toBe(true);
    expect(urls.some((u) => u.includes('endTime=2026-09-30%2023%3A59%3A59'))).toBe(true);
  });

  it('fetches each section independently; one failing read blanks only itself', async () => {
    const failed = () => new Response('{"code":500,"success":false}');
    const { fetchImpl } = account({
      '/usage-detail': failed,
      '/model-performance-day': failed,
    });
    const report = await fetchZaiPlanReport({ apiKey: 'k', region: 'zai', fetchImpl });
    expect(report.quota?.level).toBe('max');
    expect(report.subscription?.product).toBe('GLM Coding Max');
    expect(report.usage).toBeUndefined();
    expect(report.health).toBeUndefined();
  });

  it('finds no plan when nothing is in its current period, or it is not a coding product', async () => {
    const { fetchImpl } = account({
      '/subscription/list': () =>
        ok([
          { ...subscriptions[1] },
          { productName: 'Vision Pack', status: 'VALID', inCurrentPeriod: true },
        ]),
    });
    const report = await fetchZaiPlanReport({ apiKey: 'k', region: 'zai', fetchImpl });
    expect(report.subscription).toBeUndefined();
  });
});
