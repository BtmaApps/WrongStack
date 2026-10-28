import type { Provider } from '@wrongstack/contracts/types';
import { createBrainRuntime } from '@wrongstack/core/execution';
import { expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { BrainHandlerContext } from '../src/server/brain-handlers';
import { createBrainRouteHandlers, handleBrainRoute } from '../src/server/brain-routes';
import type { WSClientMessage, WSServerMessage } from '../src/server/types';

function fixture() {
  const sent: WSServerMessage[] = [];
  const persist = vi.fn(async () => {});
  const runtime = createBrainRuntime({
    initialConfig: { maxAutoRisk: 'low' },
    defaultProviderId: 'fixture',
    sessionProvider: () => ({ id: 'fixture' }) as Provider,
    sessionModel: () => 'fixture',
    resolveProvider: () => undefined,
    persist,
  });
  const ctx: BrainHandlerContext = {
    send: (_ws, message) => sent.push(message),
    brainRuntime: runtime,
    brainSettings: undefined,
    getBrainLog: undefined,
    resolveArbiter: () => undefined,
  };
  const routes = createBrainRouteHandlers(ctx);
  const route = async (type: string, payload: Record<string, unknown>) => {
    sent.length = 0;
    await handleBrainRoute({} as WebSocket, { type, payload } as WSClientMessage, routes);
    return sent;
  };
  return { route, persist };
}
it('retains legacy untagged configuration reads', async () => {
  const { route } = fixture();
  const replies = await route('brain.config.get', {});
  expect(replies[0]).toMatchObject({
    type: 'brain.config',
    payload: { persisted: true, config: { maxAutoRisk: 'low' } },
  });
  expect(replies[0]?.payload).not.toHaveProperty('requestId');
});
it('correlates configuration reads, successful writes and invalid writes', async () => {
  const { route, persist } = fixture();
  expect((await route('brain.config.get', { requestId: 'read-owner' }))[0]?.payload).toHaveProperty(
    'requestId',
    'read-owner',
  );
  expect(
    (
      await route('brain.config.set', {
        requestId: 'write-owner',
        patch: { cache: { enabled: false } },
      })
    )[0],
  ).toMatchObject({
    type: 'brain.config',
    payload: { requestId: 'write-owner', persisted: true, config: { cache: { enabled: false } } },
  });
  expect(persist).toHaveBeenCalledTimes(1);
  expect(
    (await route('brain.config.set', { requestId: 'invalid-owner', patch: 'invalid' }))[0]?.payload,
  ).toMatchObject({ requestId: 'invalid-owner', success: false });
});
