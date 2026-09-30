/**
 * On-demand plan quota reads: only the vendors whose quota lives on a free
 * account endpoint (MiniMax, Z.AI Coding Plan) are read, from the configured
 * host (seen through the trace proxy) or the catalog default for the type.
 */

import { getProviderQuota, resetProviderQuota } from '@wrongstack/core/quota';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshProviderAccountQuota } from '../src/account-quota.js';

afterEach(() => {
  resetProviderQuota();
});

const HOUR = 3_600_000;

function vendorApi(): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (input: unknown) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/v1/token_plan/remains')) {
      const now = Date.now();
      return new Response(
        JSON.stringify({
          base_resp: { status_code: 0 },
          model_remains: [
            {
              model_name: 'MiniMax-M*',
              start_time: now - HOUR,
              end_time: now + 4 * HOUR,
              current_interval_total_count: 100,
              current_interval_usage_count: 100,
              current_interval_remaining_percent: 70,
              current_interval_status: 1,
              current_weekly_total_count: 0,
              current_weekly_status: 3,
            },
          ],
        }),
      );
    }
    if (url.includes('/api/monitor/usage/quota/limit')) {
      return new Response(
        JSON.stringify({
          code: 200,
          success: true,
          data: {
            level: 'pro',
            limits: [
              {
                type: 'TOKENS_LIMIT',
                unit: 3,
                number: 5,
                percentage: 12,
                nextResetTime: Date.now() + HOUR,
              },
            ],
          },
        }),
      );
    }
    return new Response('{}', { status: 404 });
  }) as never as typeof fetch;
  return { fetchImpl, urls };
}

describe('refreshProviderAccountQuota', () => {
  it('reads MiniMax from its account root, through the trace proxy', async () => {
    const { fetchImpl, urls } = vendorApi();
    const result = await refreshProviderAccountQuota({
      providerId: 'minimax-coding-plan',
      type: 'minimax-coding-plan',
      baseUrl: 'http://localhost:5173/proxy/api.minimax.io/anthropic/v1',
      apiKey: 'k',
      fetchImpl,
    });
    expect(result).toEqual({ vendor: 'minimax', ok: true });
    expect(urls).toEqual(['https://api.minimax.io/v1/token_plan/remains']);
    expect(getProviderQuota('minimax-coding-plan')[0]?.windows[0]?.usedPercent).toBe(30);
  });

  it('reads the Z.AI Coding Plan, and the catalog default when no base URL is saved', async () => {
    const { fetchImpl, urls } = vendorApi();
    expect(
      await refreshProviderAccountQuota({
        providerId: 'glm',
        type: 'zai-coding-plan',
        apiKey: 'k',
        fetchImpl,
      }),
    ).toEqual({ vendor: 'zai', ok: true });
    expect(urls).toEqual(['https://api.z.ai/api/monitor/usage/quota/limit']);
    expect(getProviderQuota('glm')[0]?.windows[0]?.usedPercent).toBe(12);
  });

  it('uses the China defaults for the -cn and BigModel ids', async () => {
    const { fetchImpl, urls } = vendorApi();
    await refreshProviderAccountQuota({ providerId: 'minimax-cn', apiKey: 'k', fetchImpl });
    await refreshProviderAccountQuota({
      providerId: 'zhipuai-coding-plan',
      apiKey: 'k',
      fetchImpl,
    });
    expect(urls[0]).toBe('https://api.minimax.cn/v1/token_plan/remains');
    expect(urls[1]).toBe('https://open.bigmodel.cn/api/monitor/usage/quota/limit');
  });

  it('skips header-metered, pay-as-you-go and keyless providers without a request', async () => {
    const { fetchImpl, urls } = vendorApi();
    for (const input of [
      { providerId: 'openai-codex', baseUrl: 'https://chatgpt.com/backend-api' },
      { providerId: 'anthropic', baseUrl: 'https://api.anthropic.com' },
      { providerId: 'zai', baseUrl: 'https://api.z.ai/api/paas/v4' },
    ]) {
      expect(await refreshProviderAccountQuota({ ...input, apiKey: 'k', fetchImpl })).toBe(
        undefined,
      );
    }
    expect(
      await refreshProviderAccountQuota({ providerId: 'zai-coding-plan', apiKey: ' ', fetchImpl }),
    ).toBeUndefined();
    expect(urls).toEqual([]);
  });

  it('reports a failed read without throwing', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"code":401,"success":false}'),
    ) as never as typeof fetch;
    expect(
      await refreshProviderAccountQuota({ providerId: 'zai-coding-plan', apiKey: 'k', fetchImpl }),
    ).toEqual({ vendor: 'zai', ok: false });
  });
});
