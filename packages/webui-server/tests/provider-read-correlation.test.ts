import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { handleProviderRoute, type ProviderRouteHandlers } from '../src/server/provider-routes.js';

describe('provider catalog request correlation', () => {
  it.each(['providers.saved', 'provider.models', 'provider.models.search'] as const)(
    'correlates %s and leaves unrelated frames untouched',
    async (type) => {
      const send = vi.fn();
      const ws = { send, readyState: 1 } as unknown as WebSocket;
      const reply = (socket: WebSocket) => {
        socket.send(
          JSON.stringify({
            type: type === 'provider.models.search' ? 'provider.models.search_result' : type,
            payload: { providers: [], models: [], matches: [] },
          }),
        );
        socket.send(JSON.stringify({ type: 'stats.result', payload: {} }));
      };
      const routes = {
        listSavedProviders: reply,
        listProviderModels: reply,
        searchProviderModels: reply,
      } as unknown as ProviderRouteHandlers;
      await handleProviderRoute(
        ws,
        { type, payload: { requestId: 'catalog-read', providerId: 'account', query: 'model' } },
        routes,
      );
      const frames = send.mock.calls.map((c) => JSON.parse(String(c[0])));
      expect(frames[0].payload.requestId).toBe('catalog-read');
      expect(frames[1].payload.requestId).toBeUndefined();
    },
  );
  it('keeps the original socket for legacy calls without request ids', async () => {
    const ws = {} as WebSocket;
    const handler = vi.fn();
    await handleProviderRoute(ws, { type: 'providers.saved', payload: {} }, {
      listSavedProviders: handler,
    } as unknown as ProviderRouteHandlers);
    expect(handler).toHaveBeenCalledWith(ws, { type: 'providers.saved', payload: {} });
  });
  it.each([
    ['provider.quota.get', 'provider.quota'],
    ['provider.quota.refresh', 'provider.quota'],
    ['provider.status.get', 'provider.status.snapshot'],
    ['provider.audit.get', 'provider.audit.history'],
  ] as const)('correlates %s diagnostics reads', async (type, replyType) => {
    const send = vi.fn();
    const ws = { send, readyState: 1, bufferedAmount: 0 } as unknown as WebSocket;
    const routes = {
      providerHandlers: {
        handleProviderQuotaRefresh: (socket: WebSocket) => {
          socket.send(JSON.stringify({ type: 'provider.quota', payload: { snapshots: [] } }));
        },
      },
      statusTracker: { getSnapshot: () => ({ entries: [] }) },
    } as unknown as ProviderRouteHandlers;
    await handleProviderRoute(ws, { type, payload: { requestId: 'diagnostics-read' } }, routes);
    const frames = send.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(frames.find((frame) => frame.type === replyType)?.payload.requestId).toBe(
      'diagnostics-read',
    );
  });
});
