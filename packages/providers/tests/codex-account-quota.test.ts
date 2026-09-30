/**
 * ChatGPT / Codex account quota read (`/wham/usage`) — the reading that lets a
 * surface show the plan before any turn has run, without spending the plan.
 */

import { getProviderQuota, resetProviderQuota } from '@wrongstack/core/quota';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readProviderAccountQuota } from '../src/account-quota.js';
import { resetSharedOAuthRefreshState } from '../src/oauth-refresh-coordinator.js';
import { type CodexOAuthTokens, OpenAICodexProvider } from '../src/openai-codex.js';
import { parseCodexUsagePayload } from '../src/openai-codex-rate-limits.js';

beforeEach(() => resetSharedOAuthRefreshState());
afterEach(() => resetProviderQuota());

function fakeJwt(accountId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } }),
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

const NOW = 1_800_000_000_000;

const USAGE = {
  plan_type: 'pro',
  email: 'someone@example.com',
  user_id: 'user-should-not-leak',
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: {
      used_percent: 12,
      limit_window_seconds: 18_000,
      reset_after_seconds: 3_600,
      reset_at: NOW / 1000 + 3_600,
    },
    secondary_window: {
      used_percent: 39,
      limit_window_seconds: 604_800,
      reset_after_seconds: 86_400,
      reset_at: NOW / 1000 + 86_400,
    },
  },
  credits: { has_credits: false, unlimited: false, balance: '0' },
  additional_rate_limits: [
    {
      limit_name: 'GPT-5.3-Codex-Spark',
      metered_feature: 'codex_bengalfox',
      rate_limit: {
        limit_reached: true,
        primary_window: {
          used_percent: 100,
          limit_window_seconds: 18_000,
          reset_at: NOW / 1000 + 60,
        },
      },
    },
    { limit_name: 'empty', metered_feature: 'nothing', rate_limit: null },
  ],
};

describe('parseCodexUsagePayload', () => {
  it('maps the plan windows, credits and additional meters onto neutral snapshots', () => {
    const snapshots = parseCodexUsagePayload('openai-codex', USAGE, NOW);
    expect(snapshots.map((s) => s.meterId)).toEqual(['codex', 'codex_bengalfox']);

    const [main, spark] = snapshots;
    expect(main).toMatchObject({
      providerId: 'openai-codex',
      planLabel: 'pro',
      credits: { hasCredits: false, unlimited: false, balance: '0' },
    });
    expect(main?.windows).toEqual([
      expect.objectContaining({ id: 'primary', usedPercent: 12, windowMinutes: 300 }),
      expect.objectContaining({ id: 'secondary', usedPercent: 39, windowMinutes: 10_080 }),
    ]);
    expect(main?.reachedWindowId).toBeUndefined();

    expect(spark).toMatchObject({ meterLabel: 'GPT-5.3-Codex-Spark', reachedWindowId: 'primary' });
    // Identity fields in the payload never reach a snapshot.
    expect(JSON.stringify(snapshots)).not.toMatch(/someone@example\.com|user-should-not-leak/);
  });

  it('returns nothing for a body that carries no window', () => {
    expect(parseCodexUsagePayload('openai-codex', { plan_type: 'free' }, NOW)).toEqual([]);
    expect(parseCodexUsagePayload('openai-codex', null, NOW)).toEqual([]);
    expect(parseCodexUsagePayload('openai-codex', 'nope', NOW)).toEqual([]);
  });
});

interface Call {
  url: string;
  headers: Record<string, string>;
}

function usageFetch(responses: Array<{ status: number; body: unknown }>, calls: Call[]) {
  let i = 0;
  return (async (url: string, init: { headers?: Record<string, string> }) => {
    calls.push({ url: String(url), headers: init.headers ?? {} });
    const next = responses[Math.min(i++, responses.length - 1)];
    return new Response(JSON.stringify(next?.body ?? {}), { status: next?.status ?? 500 });
  }) as never as typeof fetch;
}

describe('OpenAICodexProvider.readAccountQuota', () => {
  it('reads /wham/usage with the ChatGPT headers and records the reading', async () => {
    const calls: Call[] = [];
    const provider = new OpenAICodexProvider({
      credentials: { accessToken: fakeJwt('acc_1'), expiresAt: Date.now() + 3_600_000 },
      fetchImpl: usageFetch([{ status: 200, body: USAGE }], calls),
      webSocket: false,
    });

    const snapshots = await provider.readAccountQuota();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://chatgpt.com/backend-api/wham/usage');
    expect(calls[0]?.headers['authorization']).toBe(`Bearer ${fakeJwt('acc_1')}`);
    expect(calls[0]?.headers['chatgpt-account-id']).toBe('acc_1');
    expect(calls[0]?.headers['originator']).toBeTruthy();
    expect(snapshots.map((s) => s.meterId)).toEqual(['codex', 'codex_bengalfox']);
    expect(getProviderQuota(provider.id).map((s) => s.meterId)).toEqual([
      'codex',
      'codex_bengalfox',
    ]);
  });

  it('refreshes the token once on a 401 and retries with the rotated one', async () => {
    const calls: Call[] = [];
    const fresh = fakeJwt('acc_new');
    const refreshFn = vi.fn(
      async (): Promise<CodexOAuthTokens> => ({
        access: fresh,
        refresh: 'r2',
        expires: Date.now() + 3_600_000,
      }),
    );
    const onRefresh = vi.fn();
    const provider = new OpenAICodexProvider({
      credentials: {
        accessToken: fakeJwt('acc_old'),
        refreshToken: 'r1',
        expiresAt: Date.now() + 3_600_000,
      },
      refreshFn,
      onRefresh,
      fetchImpl: usageFetch(
        [
          { status: 401, body: { error: 'expired' } },
          { status: 200, body: USAGE },
        ],
        calls,
      ),
      webSocket: false,
    });

    const snapshots = await provider.readAccountQuota();

    expect(refreshFn).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: 'r2' }));
    expect(calls).toHaveLength(2);
    expect(calls[1]?.headers['authorization']).toBe(`Bearer ${fresh}`);
    expect(snapshots).toHaveLength(2);
  });

  it('returns an empty reading and records nothing when the read fails', async () => {
    const calls: Call[] = [];
    const provider = new OpenAICodexProvider({
      credentials: { accessToken: fakeJwt('acc_1'), expiresAt: Date.now() + 3_600_000 },
      fetchImpl: usageFetch([{ status: 500, body: { error: 'down' } }], calls),
      webSocket: false,
    });
    await expect(provider.readAccountQuota()).resolves.toEqual([]);
    expect(getProviderQuota(provider.id)).toEqual([]);

    const throwing = new OpenAICodexProvider({
      credentials: { accessToken: fakeJwt('acc_1'), expiresAt: Date.now() + 3_600_000 },
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as never as typeof fetch,
      webSocket: false,
    });
    await expect(throwing.readAccountQuota()).resolves.toEqual([]);
  });
});

describe('readProviderAccountQuota', () => {
  it('reads a ChatGPT transport and reports the vendor', async () => {
    const provider = new OpenAICodexProvider({
      credentials: { accessToken: fakeJwt('acc_1'), expiresAt: Date.now() + 3_600_000 },
      fetchImpl: usageFetch([{ status: 200, body: USAGE }], []),
      webSocket: false,
    });
    await expect(readProviderAccountQuota(provider)).resolves.toEqual({
      vendor: 'codex',
      ok: true,
    });
  });

  it('reports a failed read as not ok', async () => {
    const provider = new OpenAICodexProvider({
      credentials: { accessToken: fakeJwt('acc_1'), expiresAt: Date.now() + 3_600_000 },
      fetchImpl: usageFetch([{ status: 403, body: {} }], []),
      webSocket: false,
    });
    await expect(readProviderAccountQuota(provider)).resolves.toEqual({
      vendor: 'codex',
      ok: false,
    });
  });

  it('leaves a provider without an account read alone', async () => {
    const plain = { id: 'anthropic', stream: vi.fn() } as never;
    await expect(readProviderAccountQuota(plain)).resolves.toBeUndefined();
  });
});
