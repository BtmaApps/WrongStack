import type { Config, ConfigStore } from '@wrongstack/core/types';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { handleJevRoute } from '../src/server/jev-routes.js';

describe('Jev routes', () => {
  it('returns a correlated credential-free account snapshot', async () => {
    const send = vi.fn();
    const store = {
      get: () => ({ typesafe: { route: 'typesafe', apiKey: 'private-key' } }) as Config,
    } as ConfigStore;
    expect(
      await handleJevRoute({ store, file: '', vault: undefined, send }, {} as WebSocket, {
        type: 'jev.get',
        payload: { requestId: 'tab-1' },
      }),
    ).toBe(true);
    const response = send.mock.calls[0]?.[1];
    expect(response.payload).toMatchObject({
      requestId: 'tab-1',
      settings: { status: 'ready', keySource: 'config' },
      activity: { scope: 'process' },
    });
    expect(JSON.stringify(response)).not.toContain('private-key');
  });
  it('rejects an invalid patch without publishing a successful save or supplied values', async () => {
    const send = vi.fn();
    const store = { get: () => ({}) as Config, update: vi.fn() } as unknown as ConfigStore;
    await handleJevRoute({ store, file: '', vault: undefined, send }, {} as WebSocket, {
      type: 'jev.set',
      payload: { requestId: 'bad', patch: { endpoint: 'https://secret:password@host/' } },
    });
    expect(store.update).not.toHaveBeenCalled();
    const response = send.mock.calls[0]?.[1];
    expect(response.payload.error).toBeTruthy();
    expect(JSON.stringify(response)).not.toContain('password');
  });
  it('reports an unavailable host instead of leaving the form waiting', async () => {
    const send = vi.fn();
    await handleJevRoute({ store: undefined, file: '', vault: undefined, send }, {} as WebSocket, {
      type: 'jev.get',
      payload: { requestId: 'request' },
    });
    expect(send.mock.calls[0]?.[1].payload).toMatchObject({
      requestId: 'request',
      error: expect.any(String),
    });
  });
});
