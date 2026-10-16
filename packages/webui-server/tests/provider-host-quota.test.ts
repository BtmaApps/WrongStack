import {
  getAllProviderQuota,
  recordProviderQuota,
  resetProviderQuota,
} from '@wrongstack/core/quota';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { ProviderServiceContext } from '../src/server/provider/mutations.js';
import { createQuotaRefreshHandlers } from '../src/server/provider/quota-refresh.js';

afterEach(() => resetProviderQuota());
describe('host provider account quota refresh', () => {
  it('refreshes a keyless WrongForge host and replays it to the panel, with throttling', async () => {
    const refreshQuota = vi.fn(async () => {
      recordProviderQuota('wrongforge', [
        {
          providerId: 'wrongforge',
          meterId: 'default',
          windows: [{ id: 'primary', usedPercent: 18 }],
          capturedAt: Date.now(),
        },
      ]);
      return true;
    });
    const sendMessage = vi.fn();
    const handlers = createQuotaRefreshHandlers({
      deps: {
        hostProviders: () => [{ id: 'wrongforge', type: 'wrongforge', models: [], refreshQuota }],
      },
      loadConfigProviders: async () => ({}),
      sendMessage,
    } as unknown as ProviderServiceContext);
    const ws = {} as WebSocket;
    await handlers.handleProviderQuotaRefresh(ws);
    expect(sendMessage).toHaveBeenLastCalledWith(ws, {
      type: 'provider.quota',
      payload: {
        snapshots: getAllProviderQuota(),
        refreshed: [{ providerId: 'wrongforge', vendor: 'wrongforge', ok: true }],
      },
    });
    await handlers.handleProviderQuotaRefresh(ws);
    expect(refreshQuota).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls.at(-1)?.[1].payload.refreshed).toEqual([
      { providerId: 'wrongforge', vendor: 'wrongforge', ok: true, throttled: true },
    ]);
  });
  it('coalesces host reads and reports a failed endpoint without failing the panel', async () => {
    let reject!: (reason: Error) => void;
    const refreshQuota = vi.fn(
      () =>
        new Promise<boolean>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const sendMessage = vi.fn();
    const handlers = createQuotaRefreshHandlers({
      deps: {
        hostProviders: () => [{ id: 'wrongforge', type: 'wrongforge', models: [], refreshQuota }],
      },
      loadConfigProviders: async () => ({}),
      sendMessage,
    } as unknown as ProviderServiceContext);
    const first = handlers.handleProviderQuotaRefresh({} as WebSocket);
    const second = handlers.handleProviderQuotaRefresh({} as WebSocket);
    await vi.waitFor(() => expect(refreshQuota).toHaveBeenCalledTimes(1));
    reject(new Error('usage_unavailable'));
    await Promise.all([first, second]);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls.at(-1)?.[1].payload.refreshed).toEqual([
      { providerId: 'wrongforge', vendor: 'wrongforge', ok: false },
    ]);
  });
});
