import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { handleAgentRosterRoute } from '../src/server/agent-roster-routes.js';

function socket() {
  return { readyState: 1, send: vi.fn() } as never as WebSocket & {
    send: ReturnType<typeof vi.fn>;
  };
}

function sent(ws: ReturnType<typeof socket>) {
  return ws.send.mock.calls.map(([raw]) => JSON.parse(String(raw)) as unknown);
}

describe('handleAgentRosterRoute request correlation', () => {
  it('echoes requestId on successful replies', async () => {
    const ws = socket();
    const rosterHandler = {
      handleMessage: vi.fn(async () => ({
        type: 'agent-roster.list',
        payload: { roles: ['executor'] },
      })),
    };

    await handleAgentRosterRoute(
      ws,
      { type: 'agent-roster.list', payload: { requestId: 'roster-1' } },
      { rosterHandler: rosterHandler as never },
    );

    expect(sent(ws)).toEqual([
      {
        type: 'agent-roster.list',
        payload: { roles: ['executor'], requestId: 'roster-1' },
      },
    ]);
  });

  it('echoes requestId on error replies', async () => {
    const ws = socket();
    const rosterHandler = {
      handleMessage: vi.fn(async () => {
        throw new Error('roster unavailable');
      }),
    };

    await handleAgentRosterRoute(
      ws,
      { type: 'agent-roster.list', payload: { requestId: 'roster-2' } },
      { rosterHandler: rosterHandler as never },
    );

    expect(sent(ws)).toEqual([
      {
        type: 'agent-roster.list',
        payload: { error: 'roster unavailable', requestId: 'roster-2' },
      },
    ]);
  });
});
