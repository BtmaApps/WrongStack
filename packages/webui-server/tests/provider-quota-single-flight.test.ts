import { resetProviderQuota } from '@wrongstack/core/quota';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderServiceContext } from '../src/server/provider/mutations.js';
import { createQuotaRefreshHandlers } from '../src/server/provider/quota-refresh.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness() {
  const sent: Array<{ payload: { refreshed: unknown[] } }> = [];
  const providers = {
    'zai-coding-plan': { type: 'zai-coding-plan', apiKeys: [{ label: 'default', apiKey: 'fake' }] },
  };
  const ctx = {
    loadConfigProviders: async () => providers,
    sendMessage: (_ws: unknown, message: { payload: { refreshed: unknown[] } }) => {
      sent.push(message);
    },
  } as unknown as ProviderServiceContext;
  return { sent, handlers: createQuotaRefreshHandlers(ctx) };
}

const success = () =>
  new Response(
    JSON.stringify({
      code: 200,
      success: true,
      data: {
        level: 'max',
        limits: [
          { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 8, nextResetTime: 4_600_000 },
        ],
      },
    }),
  );
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetProviderQuota();
});

describe('quota refresh shares concurrent vendor work', () => {
  it('reads once for multiple tabs while the vendor response is gated, and replies to each', async () => {
    const entered = deferred<void>();
    const completed = deferred<Response>();
    const fetcher = vi.fn(() => {
      entered.resolve();
      return completed.promise;
    });
    vi.stubGlobal('fetch', fetcher);
    const { handlers, sent } = harness();
    const requests = [
      handlers.handleProviderQuotaRefresh({} as never),
      handlers.handleProviderQuotaRefresh({} as never),
      handlers.handleProviderQuotaRefresh({} as never),
    ];
    await entered.promise;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);
    completed.resolve(success());
    await Promise.all(requests);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(3);
    expect(sent.every((message) => message.payload.refreshed.length === 1)).toBe(true);
    await handlers.handleProviderQuotaRefresh({} as never);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('clears a failed flight and retries after the throttle window', async () => {
    const entered = deferred<void>();
    const completed = deferred<Response>();
    const fetcher = vi.fn(() => {
      entered.resolve();
      return completed.promise;
    });
    vi.stubGlobal('fetch', fetcher);
    const { handlers, sent } = harness();
    const first = handlers.handleProviderQuotaRefresh({} as never);
    const second = handlers.handleProviderQuotaRefresh({} as never);
    await entered.promise;
    completed.resolve(new Response('{}', { status: 503 }));
    await Promise.all([first, second]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sent[0]?.payload.refreshed).toEqual([expect.objectContaining({ ok: false })]);
    vi.spyOn(Date, 'now').mockReturnValue(1_020_001);
    fetcher.mockImplementation(async () => success());
    await handlers.handleProviderQuotaRefresh({} as never);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sent.at(-1)?.payload.refreshed).toEqual([expect.objectContaining({ ok: true })]);
  });

  it('allows a new successful flight exactly at the throttle boundary', async () => {
    const fetcher = vi.fn(async () => success());
    vi.stubGlobal('fetch', fetcher);
    const { handlers } = harness();
    await handlers.handleProviderQuotaRefresh({} as never);
    vi.spyOn(Date, 'now').mockReturnValue(1_019_999);
    await handlers.handleProviderQuotaRefresh({} as never);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.spyOn(Date, 'now').mockReturnValue(1_020_000);
    await handlers.handleProviderQuotaRefresh({} as never);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
